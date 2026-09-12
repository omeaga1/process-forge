// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use keyring::Entry;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemTelemetry {
    platform: String,
    arch: String,
    is_offline_capable: bool,
}

#[tauri::command]
fn get_system_telemetry() -> Result<SystemTelemetry, String> {
    Ok(SystemTelemetry {
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        is_offline_capable: true,
    })
}

#[tauri::command]
fn save_secure_token(service: String, account: String, secret: String) -> Result<(), String> {
    let entry = Entry::new(&service, &account).map_err(|e| e.to_string())?;
    entry.set_password(&secret).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_secure_token(service: String, account: String) -> Result<String, String> {
    let entry = Entry::new(&service, &account).map_err(|e| e.to_string())?;
    entry.get_password().map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_secure_token(service: String, account: String) -> Result<(), String> {
    let entry = Entry::new(&service, &account).map_err(|e| e.to_string())?;
    entry.delete_password().map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_system_telemetry,
            save_secure_token,
            get_secure_token,
            delete_secure_token
        ])
        .run(tauri::generate_context!())
        .expect("error while running ProcessForge desktop application");
}
