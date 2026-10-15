//! Which ProcessForge MCP server Claude has, for the app's "What's new".
//!
//! The Claude Desktop extension keeps itself up to date: it downloads a newer
//! server from the releases into ~/.process-forge/mcp and uses it the next
//! time Claude starts. This reads what that left behind, so the app can say
//! "Claude is on 0.18, 0.21 is ready: restart Claude" instead of the update
//! going unnoticed. Read-only: nothing here changes Claude or the extension.

use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;

fn home() -> Option<PathBuf> {
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(PathBuf::from)
}

fn read_json(path: PathBuf) -> Value {
    fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(Value::Null)
}

/// Where Claude Desktop keeps its extensions on this platform.
fn extensions_dir() -> Option<PathBuf> {
    if cfg!(windows) {
        std::env::var_os("APPDATA").map(|d| PathBuf::from(d).join("Claude").join("Claude Extensions"))
    } else if cfg!(target_os = "macos") {
        home().map(|h| h.join("Library").join("Application Support").join("Claude").join("Claude Extensions"))
    } else {
        home().map(|h| h.join(".config").join("Claude").join("Claude Extensions"))
    }
}

/// The installed extension's version, from its manifest (any install of it: from a file or the directory).
fn extension_version() -> Value {
    let Some(dir) = extensions_dir() else { return Value::Null };
    let Ok(entries) = fs::read_dir(dir) else { return Value::Null };
    for entry in entries.flatten() {
        if entry.file_name().to_string_lossy().contains("process-forge") {
            let manifest = read_json(entry.path().join("manifest.json"));
            if let Some(v) = manifest.get("version") {
                return v.clone();
            }
        }
    }
    Value::Null
}

#[tauri::command]
pub fn claude_tools_status() -> Value {
    let Some(mcp) = home().map(|h| h.join(".process-forge").join("mcp")) else {
        return json!({ "running": null, "downloaded": null, "extension": null, "log": [] });
    };
    let log: Vec<String> = fs::read_to_string(mcp.join("updater.log"))
        .map(|s| {
            let lines: Vec<&str> = s.lines().collect();
            lines[lines.len().saturating_sub(12)..].iter().map(|l| l.to_string()).collect()
        })
        .unwrap_or_default();
    json!({
        "running": read_json(mcp.join("running.json")),
        "downloaded": read_json(mcp.join("current.json")),
        "extension": extension_version(),
        "log": log
    })
}
