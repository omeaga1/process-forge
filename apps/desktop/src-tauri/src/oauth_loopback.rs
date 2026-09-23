//! Google sign-in for the desktop app, through the system browser.
//!
//! Google's web sign-in button only runs on web origins registered in the
//! Google Cloud project. The desktop app's pages are served from
//! `http://tauri.localhost`, which Google rejects as an origin, so the button
//! failed with "origin mismatch". Installed apps are meant to use the flow in
//! RFC 8252 instead: open Google in the user's own browser and receive the
//! result on a loopback address.
//!
//! This module does only the native half:
//!   1. bind 127.0.0.1 on a free port,
//!   2. open the Google authorization URL (built by the web app, which also
//!      holds the PKCE verifier and `state`) with that port as redirect_uri,
//!   3. accept the single redirect and hand back `code` and `state`.
//!
//! It never sees a client secret or a token. The web app sends the code and
//! the PKCE verifier to the cloud API, which does the exchange.
//!
//! The same loopback also serves "Sign in with OpenRouter": OpenRouter's PKCE
//! flow redirects back with a `code` (no `state`), which the web app exchanges
//! for an API key directly with OpenRouter.

use serde::Serialize;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::time::{Duration, Instant};

/// Who we are signing in with. Each provider has exactly one URL this module
/// will open, so the commands cannot be used to open arbitrary URLs.
struct Provider {
    name: &'static str,
    auth_prefix: &'static str,
    /// Google echoes `state`; OpenRouter's flow has none (PKCE covers it).
    requires_state: bool,
    /// Loopback host placed in the redirect. OpenRouter documents
    /// `localhost`; Google accepts the literal address RFC 8252 prefers.
    redirect_host: &'static str,
}

const GOOGLE: Provider = Provider {
    name: "Google",
    auth_prefix: "https://accounts.google.com/o/oauth2/v2/auth?",
    requires_state: true,
    redirect_host: "127.0.0.1",
};

const OPENROUTER: Provider = Provider {
    name: "OpenRouter",
    auth_prefix: "https://openrouter.ai/auth?",
    requires_state: false,
    redirect_host: "localhost",
};
const REDIRECT_PLACEHOLDER: &str = "{redirect_uri}";
const TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoopbackResult {
    pub code: String,
    pub state: String,
    pub redirect_uri: String,
}

/// Percent-decodes a query component (`+` is a space in form encoding).
fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => out.push(b' '),
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
                match u8::from_str_radix(hex, 16) {
                    Ok(b) => {
                        out.push(b);
                        i += 2;
                    }
                    Err(_) => out.push(b'%'),
                }
            }
            b => out.push(b),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn percent_encode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{:02X}", b),
        })
        .collect()
}

fn query_param(query: &str, name: &str) -> Option<String> {
    query.split('&').find_map(|pair| {
        let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
        (k == name).then(|| percent_decode(v))
    })
}

/// Opens a URL in the default browser without a shell, so nothing in the URL
/// is interpreted as a command. The URL has already been checked to be Google's.
fn open_in_browser(url: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let status = std::process::Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", url])
        .spawn();
    #[cfg(target_os = "macos")]
    let status = std::process::Command::new("open").arg(url).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let status = std::process::Command::new("xdg-open").arg(url).spawn();
    status.map(|_| ()).map_err(|e| format!("Could not open the browser: {e}"))
}

fn respond(stream: &mut TcpStream, ok: bool, provider: &Provider) {
    let fail = format!("{} did not return a sign-in code. Return to ProcessForge and try again.", provider.name);
    let (title, body) = if ok {
        ("Signed in", "You are signed in to ProcessForge. You can close this tab and return to the app.")
    } else {
        ("Sign-in did not complete", fail.as_str())
    };
    let html = format!(
        "<!doctype html><meta charset=utf-8><title>{title}</title>\
         <body style=\"font:15px system-ui;margin:15vh auto;max-width:32rem;padding:0 16px\">\
         <h1 style=\"font-size:20px\">{title}</h1><p>{body}</p></body>"
    );
    let _ = write!(
        stream,
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        html.len(),
        html
    );
}

/// Reads the request line: `GET /?code=...&state=... HTTP/1.1`.
fn read_request_target(stream: &mut TcpStream) -> Option<String> {
    stream.set_read_timeout(Some(Duration::from_secs(5))).ok()?;
    let mut buf = [0u8; 8192];
    let n = stream.read(&mut buf).ok()?;
    let head = std::str::from_utf8(&buf[..n]).ok()?;
    let line = head.lines().next()?;
    let mut parts = line.split_whitespace();
    (parts.next()? == "GET").then(|| parts.next().map(str::to_string))?
}

fn run(auth_url_template: &str, provider: &Provider) -> Result<LoopbackResult, String> {
    // Only ever open the provider's authorization endpoint: this command must
    // not be usable to open arbitrary URLs from the web view.
    if !auth_url_template.starts_with(provider.auth_prefix) || !auth_url_template.contains(REDIRECT_PLACEHOLDER) {
        return Err(format!("Refusing to open an authorization URL that is not {}'s.", provider.name));
    }

    // 127.0.0.1, not localhost: RFC 8252 section 8.3, and it cannot be
    // redirected by a hosts-file entry.
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| format!("Could not open a local port: {e}"))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect_uri = format!("http://{}:{port}/", provider.redirect_host);
    let url = auth_url_template.replace(REDIRECT_PLACEHOLDER, &percent_encode(&redirect_uri));

    open_in_browser(&url)?;

    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let deadline = Instant::now() + TIMEOUT;
    loop {
        if Instant::now() > deadline {
            return Err(format!("Timed out waiting for {} sign-in in the browser.", provider.name));
        }
        match listener.accept() {
            Ok((mut stream, _)) => {
                let _ = stream.set_nonblocking(false);
                let Some(target) = read_request_target(&mut stream) else { continue };
                // Browsers also ask for /favicon.ico; only the redirect counts.
                let Some(query) = target.strip_prefix("/?") else {
                    let _ = write!(stream, "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                    continue;
                };
                if let Some(err) = query_param(query, "error") {
                    respond(&mut stream, false, provider);
                    return Err(if err == "access_denied" {
                        format!("{} sign-in was cancelled.", provider.name)
                    } else {
                        format!("{} sign-in failed: {err}", provider.name)
                    });
                }
                let state = query_param(query, "state");
                match (query_param(query, "code"), state) {
                    (Some(code), state) if !code.is_empty() && (state.is_some() || !provider.requires_state) => {
                        respond(&mut stream, true, provider);
                        return Ok(LoopbackResult { code, state: state.unwrap_or_default(), redirect_uri });
                    }
                    _ => {
                        respond(&mut stream, false, provider);
                        return Err(format!("{}'s redirect did not include a sign-in code.", provider.name));
                    }
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(100)),
            Err(e) => return Err(format!("Local sign-in listener failed: {e}")),
        }
    }
}

/// Runs the browser half of Google sign-in. `auth_url` is Google's
/// authorization URL with `{redirect_uri}` where the loopback address goes.
#[tauri::command]
pub async fn google_loopback_sign_in(auth_url: String) -> Result<LoopbackResult, String> {
    tauri::async_runtime::spawn_blocking(move || run(&auth_url, &GOOGLE))
        .await
        .map_err(|e| format!("Sign-in task failed: {e}"))?
}

/// Runs the browser half of "Sign in with OpenRouter". `auth_url` is
/// `https://openrouter.ai/auth?callback_url={redirect_uri}&code_challenge=...`.
#[tauri::command]
pub async fn openrouter_loopback_sign_in(auth_url: String) -> Result<LoopbackResult, String> {
    tauri::async_runtime::spawn_blocking(move || run(&auth_url, &OPENROUTER))
        .await
        .map_err(|e| format!("Sign-in task failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_query_values() {
        assert_eq!(percent_decode("4%2F0Ab_x-y"), "4/0Ab_x-y");
        assert_eq!(percent_decode("a+b"), "a b");
        assert_eq!(percent_decode("100%"), "100%");
        assert_eq!(query_param("state=s1&code=4%2Fabc", "code").as_deref(), Some("4/abc"));
        assert_eq!(query_param("code=x", "state"), None);
    }

    #[test]
    fn refuses_non_google_urls() {
        assert!(run("https://evil.example/?redirect_uri={redirect_uri}", &GOOGLE).is_err());
        assert!(run("https://accounts.google.com/o/oauth2/v2/auth?no_placeholder", &GOOGLE).is_err());
        // Each command opens only its own provider.
        assert!(run("https://accounts.google.com/o/oauth2/v2/auth?redirect_uri={redirect_uri}", &OPENROUTER).is_err());
        assert!(run("https://openrouter.ai/auth?callback_url={redirect_uri}", &GOOGLE).is_err());
        assert!(run("https://openrouter.ai.evil.example/auth?callback_url={redirect_uri}", &OPENROUTER).is_err());
    }

    #[test]
    fn encodes_the_redirect_uri() {
        assert_eq!(percent_encode("http://127.0.0.1:5000/"), "http%3A%2F%2F127.0.0.1%3A5000%2F");
    }
}
