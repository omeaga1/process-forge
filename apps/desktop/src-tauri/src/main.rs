// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod oauth_loopback;
mod mcp_bridge;

/// Opens an https link in the user's browser. The web view is not a browser:
/// without this, links such as "Get an API key" or a release download do
/// nothing in the desktop app. Only https URLs, with no whitespace, are opened,
/// and never through a shell.
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    if !url.starts_with("https://") || url.len() > 2048 || url.chars().any(char::is_whitespace) {
        return Err("Only https links can be opened.".into());
    }
    oauth_loopback::open_in_browser(&url)
}

use keyring::Entry;
use serde::{Deserialize, Serialize};
use tauri::Manager;
use tauri_plugin_updater::UpdaterExt;

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemTelemetry {
    platform: String,
    arch: String,
    is_offline_capable: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub should_update: bool,
    pub release_notes: String,
    pub release_url: String,
}

#[tauri::command]
fn get_system_telemetry() -> Result<SystemTelemetry, String> {
    Ok(SystemTelemetry {
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        is_offline_capable: true,
    })
}

fn namespaced_service(service: &str) -> String {
    if service.starts_with("com.processforge.studio:") {
        service.to_string()
    } else {
        format!("com.processforge.studio:{}", service)
    }
}

#[tauri::command]
fn save_secure_token(service: String, account: String, secret: String) -> Result<(), String> {
    let ns_service = namespaced_service(&service);
    let entry = Entry::new(&ns_service, &account).map_err(|e| e.to_string())?;
    entry.set_password(&secret).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_secure_token(service: String, account: String) -> Result<String, String> {
    let ns_service = namespaced_service(&service);
    let entry = Entry::new(&ns_service, &account).map_err(|e| e.to_string())?;
    entry.get_password().map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_secure_token(service: String, account: String) -> Result<(), String> {
    let ns_service = namespaced_service(&service);
    let entry = Entry::new(&ns_service, &account).map_err(|e| e.to_string())?;
    entry.delete_password().map_err(|e| e.to_string())
}

#[tauri::command]
async fn check_for_updates(app: tauri::AppHandle) -> Result<UpdateInfo, String> {
    // The app version from tauri.conf.json, which is what the updater compares.
    // CARGO_PKG_VERSION is the crate version, which had drifted to 0.1.4 while
    // the app shipped as 0.1.6, so the banner reported the wrong version.
    let current_version = app.package_info().version.to_string();

    match app.updater() {
        Ok(updater) => {
            match updater.check().await {
                Ok(Some(update)) => Ok(UpdateInfo {
                    current_version,
                    latest_version: update.version,
                    should_update: true,
                    release_notes: update.body.unwrap_or_else(|| "New release available on GitHub.".to_string()),
                    release_url: "https://github.com/omeaga1/process-forge/releases/latest".to_string(),
                }),
                Ok(None) => Ok(UpdateInfo {
                    current_version: current_version.clone(),
                    latest_version: current_version,
                    should_update: false,
                    release_notes: "You are running the latest version of ProcessForge.".to_string(),
                    release_url: "https://github.com/omeaga1/process-forge/releases/latest".to_string(),
                }),
                Err(e) => {
                    // Graceful fallback when offline or running local dev build
                    Ok(UpdateInfo {
                        current_version: current_version.clone(),
                        latest_version: current_version,
                        should_update: false,
                        release_notes: format!("Update check skipped: {}", e),
                        release_url: "https://github.com/omeaga1/process-forge/releases/latest".to_string(),
                    })
                }
            }
        }
        Err(e) => Ok(UpdateInfo {
            current_version: current_version.clone(),
            latest_version: current_version,
            should_update: false,
            release_notes: format!("Updater not initialized: {}", e),
            release_url: "https://github.com/omeaga1/process-forge/releases/latest".to_string(),
        }),
    }
}

#[tauri::command]
async fn install_and_restart_update(app: tauri::AppHandle) -> Result<String, String> {
    match app.updater() {
        Ok(updater) => {
            match updater.check().await {
                Ok(Some(update)) => {
                    let mut downloaded: usize = 0;
                    update
                        .download_and_install(
                            |chunk_length, _content_length| {
                                downloaded += chunk_length;
                            },
                            || {},
                        )
                        .await
                        .map_err(|e| format!("Failed to download and install update: {}", e))?;

                    app.restart();
                    #[allow(unreachable_code)]
                    Ok("Update installed. Restarting...".to_string())
                }
                Ok(None) => Ok("Application is already at latest version.".to_string()),
                Err(e) => Err(format!("Update check failed: {}", e)),
            }
        }
        Err(e) => Err(format!("Updater not initialized: {}", e)),
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            get_system_telemetry,
            save_secure_token,
            get_secure_token,
            delete_secure_token,
            check_for_updates,
            install_and_restart_update,
            oauth_loopback::google_loopback_sign_in,
            oauth_loopback::openrouter_loopback_sign_in,
            mcp_bridge::bridge_take_pending,
            mcp_bridge::bridge_report,
            mcp_bridge::bridge_set_flowsheet,
            mcp_bridge::bridge_status,
            open_external
        ])
        .setup(|app| {
            // The link MCP clients use to add unit ops to the open flowsheet.
            // If it cannot start, the app still runs; the bridge commands then
            // have no state and MCP falls back to copy and paste.
            match mcp_bridge::start(app.handle()) {
                Ok(bridge) => {
                    app.manage(bridge);
                }
                Err(e) => eprintln!("MCP bridge not started: {e}"),
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building ProcessForge desktop application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(bridge) = app.try_state::<mcp_bridge::Bridge>() {
                    mcp_bridge::stop(&bridge);
                }
            }
        });
}
