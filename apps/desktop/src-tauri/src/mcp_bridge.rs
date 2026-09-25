//! A local link from MCP clients (Claude Desktop, Cursor, ...) to the running
//! ProcessForge desktop app.
//!
//! The ProcessForge MCP server runs inside the MCP client, as its own process.
//! Without this it could validate a unit operation but not put it anywhere:
//! the engineer had to copy the contract out of the chat and paste it into the
//! app. With it, the MCP server can read the open flowsheet and add a unit op
//! to it directly.
//!
//! How it is kept to this machine and this user:
//!   - it listens on 127.0.0.1 only, on a port the OS picks;
//!   - every request must carry a random token, generated at each launch;
//!   - the port and token are written to `mcp-bridge.json` in the app's data
//!     directory, which only this user can read, and removed on exit;
//!   - requests with an Origin header (i.e. from a web page) are refused, and
//!     the Host header must be the loopback address, so a web page cannot
//!     reach it even by guessing.
//!
//! The app itself decides what happens: the web view validates a unit op again
//! with the engine before adding it, checks a stream fits the ports it joins,
//! and reports back.

use serde_json::{json, Value};
use std::collections::{HashMap, VecDeque};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Manager, State};

const MAX_BODY: usize = 2 * 1024 * 1024;
const MAX_HEAD: usize = 16 * 1024;
/// How long a request waits for the app to add the unit and answer.
const REPLY_TIMEOUT: Duration = Duration::from_secs(20);

pub struct BridgeState {
    token: String,
    port: u16,
    file: Option<PathBuf>,
    pending: Mutex<VecDeque<Value>>,
    results: Mutex<HashMap<String, Value>>,
    ready: Condvar,
    flowsheet: Mutex<Option<Value>>,
    counter: Mutex<u64>,
}

pub type Bridge = Arc<BridgeState>;

fn random_token() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).map_err(|e| format!("no randomness: {e}"))?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

/// Constant-time comparison, so the token cannot be recovered by timing.
fn same(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

struct Request {
    method: String,
    path: String,
    headers: HashMap<String, String>,
    body: Vec<u8>,
}

fn find_head_end(buf: &[u8]) -> Option<usize> {
    buf.windows(4).position(|w| w == b"\r\n\r\n")
}

fn parse_head(head: &str) -> Option<(String, String, HashMap<String, String>)> {
    let mut lines = head.split("\r\n");
    let mut first = lines.next()?.split_whitespace();
    let method = first.next()?.to_string();
    let path = first.next()?.to_string();
    let mut headers = HashMap::new();
    for line in lines {
        if let Some((k, v)) = line.split_once(':') {
            headers.insert(k.trim().to_ascii_lowercase(), v.trim().to_string());
        }
    }
    Some((method, path, headers))
}

fn read_request(stream: &mut TcpStream) -> Result<Request, (u16, String)> {
    stream.set_read_timeout(Some(Duration::from_secs(10))).ok();
    let mut buf = Vec::new();
    let mut chunk = [0u8; 8192];
    let head_end = loop {
        let n = stream.read(&mut chunk).map_err(|_| (400, "could not read the request".to_string()))?;
        if n == 0 {
            return Err((400, "empty request".into()));
        }
        buf.extend_from_slice(&chunk[..n]);
        if let Some(i) = find_head_end(&buf) {
            break i;
        }
        if buf.len() > MAX_HEAD {
            return Err((431, "request headers too large".into()));
        }
    };
    let head = std::str::from_utf8(&buf[..head_end]).map_err(|_| (400, "headers are not UTF-8".to_string()))?;
    let (method, path, headers) = parse_head(head).ok_or((400, "malformed request line".to_string()))?;
    let len: usize = headers.get("content-length").and_then(|v| v.parse().ok()).unwrap_or(0);
    if len > MAX_BODY {
        return Err((413, "request body over 2 MB".into()));
    }
    let mut body = buf[head_end + 4..].to_vec();
    while body.len() < len {
        let n = stream.read(&mut chunk).map_err(|_| (400, "could not read the body".to_string()))?;
        if n == 0 {
            break;
        }
        body.extend_from_slice(&chunk[..n]);
    }
    body.truncate(len);
    Ok(Request { method, path, headers, body })
}

fn respond(stream: &mut TcpStream, status: u16, body: &Value) {
    let reason = match status {
        200 => "OK",
        202 => "Accepted",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        409 => "Conflict",
        413 => "Payload Too Large",
        431 => "Request Header Fields Too Large",
        _ => "Error",
    };
    let text = body.to_string();
    let _ = write!(
        stream,
        "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{text}",
        text.len()
    );
}

/// The checks every request passes before its route runs.
fn authorize(req: &Request, bridge: &BridgeState) -> Result<(), (u16, String)> {
    if req.headers.contains_key("origin") {
        return Err((403, "requests from web pages are not accepted".into()));
    }
    let host = req.headers.get("host").map(String::as_str).unwrap_or("");
    let allowed = [format!("127.0.0.1:{}", bridge.port), format!("localhost:{}", bridge.port)];
    if !allowed.iter().any(|h| h == host) {
        return Err((403, "unexpected Host".into()));
    }
    let token = req
        .headers
        .get("authorization")
        .and_then(|v| v.strip_prefix("Bearer "))
        .unwrap_or("");
    if !same(token, &bridge.token) {
        return Err((401, "missing or wrong bridge token".into()));
    }
    Ok(())
}

fn handle(mut stream: TcpStream, bridge: Bridge) {
    let req = match read_request(&mut stream) {
        Ok(r) => r,
        Err((code, msg)) => return respond(&mut stream, code, &json!({ "error": msg })),
    };
    if let Err((code, msg)) = authorize(&req, &bridge) {
        return respond(&mut stream, code, &json!({ "error": msg }));
    }
    match (req.method.as_str(), req.path.as_str()) {
        ("GET", "/v1/status") => {
            let open = bridge.flowsheet.lock().map(|f| f.is_some()).unwrap_or(false);
            respond(
                &mut stream,
                200,
                &json!({ "ok": true, "app": "ProcessForge", "version": env!("CARGO_PKG_VERSION"), "flowsheetOpen": open }),
            )
        }
        ("GET", "/v1/flowsheet") => match bridge.flowsheet.lock().ok().and_then(|f| f.clone()) {
            Some(f) => respond(&mut stream, 200, &f),
            None => respond(&mut stream, 409, &json!({ "error": "No flowsheet is open in ProcessForge yet. Open the studio first." })),
        },
        ("POST", "/v1/unit-ops") => {
            let payload: Value = match serde_json::from_slice(&req.body) {
                Ok(v) => v,
                Err(e) => return respond(&mut stream, 400, &json!({ "error": format!("body is not JSON: {e}") })),
            };
            if payload.get("contract").map(Value::is_object) != Some(true) {
                return respond(&mut stream, 400, &json!({ "error": "expected { \"contract\": { ... } }" }));
            }
            let (code, body) = queue_and_wait(&bridge, "unit-op", payload);
            respond(&mut stream, code, &body)
        }
        ("POST", "/v1/streams") => {
            let payload: Value = match serde_json::from_slice(&req.body) {
                Ok(v) => v,
                Err(e) => return respond(&mut stream, 400, &json!({ "error": format!("body is not JSON: {e}") })),
            };
            let named = |k: &str| payload.get(k).map(Value::is_string) == Some(true);
            if !named("from") || !named("to") {
                return respond(&mut stream, 400, &json!({ "error": "expected { \"from\": \"unit\", \"to\": \"unit\" }" }));
            }
            let (code, body) = queue_and_wait(&bridge, "stream", payload);
            respond(&mut stream, code, &body)
        }
        ("POST", "/v1/nodes") => {
            // A whole unit built by the MCP server: a standard one, a feed or
            // outlet, or one from the community library. The web view checks it
            // against the schema before placing it.
            let payload: Value = match serde_json::from_slice(&req.body) {
                Ok(v) => v,
                Err(e) => return respond(&mut stream, 400, &json!({ "error": format!("body is not JSON: {e}") })),
            };
            if payload.get("node").map(Value::is_object) != Some(true) {
                return respond(&mut stream, 400, &json!({ "error": "expected { \"node\": { ... } }" }));
            }
            let (code, body) = queue_and_wait(&bridge, "node", payload);
            respond(&mut stream, code, &body)
        }
        _ => respond(&mut stream, 404, &json!({ "error": "unknown endpoint" })),
    }
}

/// Hands a request to the web view and waits for what it did. The web view
/// owns the flowsheet, so it applies the change and reports the result.
fn queue_and_wait(bridge: &BridgeState, kind: &str, payload: Value) -> (u16, Value) {
    let id = {
        let mut c = bridge.counter.lock().unwrap();
        *c += 1;
        format!("u{}", *c)
    };
    if let Ok(mut q) = bridge.pending.lock() {
        q.push_back(json!({ "id": id, "kind": kind, "request": payload }));
    }
    let results = bridge.results.lock().unwrap();
    let (mut results, timeout) = bridge
        .ready
        .wait_timeout_while(results, REPLY_TIMEOUT, |r| !r.contains_key(&id))
        .unwrap();
    if timeout.timed_out() {
        return (
            202,
            json!({ "queued": true, "message": "ProcessForge has the request but did not answer in time. It is applied when the studio is open." }),
        );
    }
    (200, results.remove(&id).unwrap_or(json!({ "error": "no result" })))
}

/// Starts the bridge and writes its discovery file. A failure here only
/// disables the bridge; the app runs normally without it.
pub fn start(app: &AppHandle) -> Result<Bridge, String> {
    let token = random_token()?;
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| format!("could not open a local port: {e}"))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    let file = app.path().app_data_dir().ok().map(|dir| dir.join("mcp-bridge.json"));
    if let Some(path) = &file {
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let info = json!({
            "protocol": 1,
            "port": port,
            "token": token,
            "pid": std::process::id(),
            "version": env!("CARGO_PKG_VERSION")
        });
        std::fs::write(path, info.to_string()).map_err(|e| format!("could not write {}: {e}", path.display()))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
        }
    }

    let bridge: Bridge = Arc::new(BridgeState {
        token,
        port,
        file,
        pending: Mutex::new(VecDeque::new()),
        results: Mutex::new(HashMap::new()),
        ready: Condvar::new(),
        flowsheet: Mutex::new(None),
        counter: Mutex::new(0),
    });
    let serving = bridge.clone();
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let b = serving.clone();
            std::thread::spawn(move || handle(stream, b));
        }
    });
    Ok(bridge)
}

/// Removes the discovery file, so an MCP client does not try a closed app.
pub fn stop(bridge: &BridgeState) {
    if let Some(path) = &bridge.file {
        let _ = std::fs::remove_file(path);
    }
}

// ---- commands for the web view ------------------------------------------

/// Requests (unit ops, streams) sent by MCP clients since the last call.
#[tauri::command]
pub fn bridge_take_pending(bridge: State<'_, Bridge>) -> Vec<Value> {
    bridge.pending.lock().map(|mut q| q.drain(..).collect()).unwrap_or_default()
}

/// What happened to a unit op, for the MCP client that sent it.
#[tauri::command]
pub fn bridge_report(bridge: State<'_, Bridge>, id: String, result: Value) {
    if let Ok(mut r) = bridge.results.lock() {
        r.insert(id, result);
    }
    bridge.ready.notify_all();
}

/// The open flowsheet, for get_open_flowsheet.
#[tauri::command]
pub fn bridge_set_flowsheet(bridge: State<'_, Bridge>, flowsheet: Value) {
    if let Ok(mut f) = bridge.flowsheet.lock() {
        *f = Some(flowsheet);
    }
}

#[tauri::command]
pub fn bridge_status(bridge: State<'_, Bridge>) -> Value {
    json!({ "running": true, "port": bridge.port })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_tokens_exactly() {
        assert!(same("abc", "abc"));
        assert!(!same("abc", "abd"));
        assert!(!same("abc", "abcd"));
        assert!(!same("", "a"));
    }

    #[test]
    fn parses_a_request_head() {
        let (m, p, h) = parse_head("POST /v1/unit-ops HTTP/1.1\r\nHost: 127.0.0.1:5000\r\nContent-Length: 12\r\nAuthorization: Bearer t").unwrap();
        assert_eq!((m.as_str(), p.as_str()), ("POST", "/v1/unit-ops"));
        assert_eq!(h.get("host").map(String::as_str), Some("127.0.0.1:5000"));
        assert_eq!(h.get("content-length").map(String::as_str), Some("12"));
        assert_eq!(h.get("authorization").map(String::as_str), Some("Bearer t"));
    }

    #[test]
    fn finds_the_end_of_the_head() {
        assert_eq!(find_head_end(b"GET / HTTP/1.1\r\n\r\nbody"), Some(14));
        assert_eq!(find_head_end(b"GET / HTTP/1.1\r\n"), None);
    }

    fn state(port: u16) -> BridgeState {
        BridgeState {
            token: "secret".into(),
            port,
            file: None,
            pending: Mutex::new(VecDeque::new()),
            results: Mutex::new(HashMap::new()),
            ready: Condvar::new(),
            flowsheet: Mutex::new(None),
            counter: Mutex::new(0),
        }
    }

    fn req(headers: &[(&str, &str)]) -> Request {
        Request {
            method: "GET".into(),
            path: "/v1/status".into(),
            headers: headers.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect(),
            body: vec![],
        }
    }

    #[test]
    fn refuses_web_pages_wrong_hosts_and_wrong_tokens() {
        let s = state(5000);
        let good = [("host", "127.0.0.1:5000"), ("authorization", "Bearer secret")];
        assert!(authorize(&req(&good), &s).is_ok());
        assert_eq!(authorize(&req(&[("origin", "https://evil.example"), good[0], good[1]]), &s).unwrap_err().0, 403);
        assert_eq!(authorize(&req(&[("host", "evil.example:5000"), good[1]]), &s).unwrap_err().0, 403);
        assert_eq!(authorize(&req(&[good[0], ("authorization", "Bearer nope")]), &s).unwrap_err().0, 401);
        assert_eq!(authorize(&req(&[good[0]]), &s).unwrap_err().0, 401);
    }
}
