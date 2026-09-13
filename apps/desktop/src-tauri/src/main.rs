// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use keyring::Entry;
use serde::{Deserialize, Serialize};
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
    if service.starts_with("com.processforge.app:") {
        service.to_string()
    } else {
        format!("com.processforge.app:{}", service)
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
    let current_version = env!("CARGO_PKG_VERSION").to_string();

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

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            get_system_telemetry,
            save_secure_token,
            get_secure_token,
            delete_secure_token,
            check_for_updates
        ])
        .run(tauri::generate_context!())
        .expect("error while running ProcessForge desktop application");
}
