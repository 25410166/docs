// Copyright (c) 2026 CookApps / Casual Office
// SPDX-License-Identifier: Apache-2.0

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Default)]
struct DesktopTokenStore(Mutex<Option<HashMap<String, String>>>);

#[derive(Debug, Deserialize)]
struct DesktopAuthRequest {
    url: String,
    method: String,
    headers: Option<HashMap<String, String>>,
    body: Option<Value>,
}

#[derive(Debug, Serialize)]
struct DesktopAuthResponse {
    status: u16,
    body: Value,
}

fn validate_token_key(key: &str) -> Result<(), String> {
    if !key.starts_with("cword.")
        || key.len() > 256
        || key
            .chars()
            .any(|character| character.is_control() || matches!(character, '/' | '\\'))
    {
        return Err("Invalid desktop token key".to_string());
    }

    Ok(())
}

fn token_store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve app data directory: {error}"))?;
    Ok(app_data_dir.join("auth-store.json"))
}

fn read_token_store(app: &AppHandle) -> Result<HashMap<String, String>, String> {
    let path = token_store_path(app)?;
    match fs::read_to_string(&path) {
        Ok(contents) => serde_json::from_str(&contents)
            .map_err(|error| format!("Could not parse desktop token store: {error}")),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(HashMap::new()),
        Err(error) => Err(format!("Could not read desktop token store: {error}")),
    }
}

fn write_token_store(app: &AppHandle, values: &HashMap<String, String>) -> Result<(), String> {
    let path = token_store_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create app data directory: {error}"))?;
    }

    let temporary_path = path.with_extension("json.tmp");
    let contents = serde_json::to_vec(values)
        .map_err(|error| format!("Could not serialize desktop token store: {error}"))?;
    fs::write(&temporary_path, contents)
        .map_err(|error| format!("Could not write desktop token store: {error}"))?;

    if path.exists() {
        fs::remove_file(&path)
            .map_err(|error| format!("Could not replace desktop token store: {error}"))?;
    }
    fs::rename(&temporary_path, &path)
        .map_err(|error| format!("Could not commit desktop token store: {error}"))
}

#[tauri::command]
fn desktop_token_get(
    app: AppHandle,
    state: State<'_, DesktopTokenStore>,
    key: String,
) -> Result<Option<String>, String> {
    validate_token_key(&key)?;
    let mut values = state
        .0
        .lock()
        .map_err(|_| "Desktop token store is unavailable".to_string())?;
    if values.is_none() {
        *values = Some(read_token_store(&app)?);
    }

    Ok(values.as_ref().and_then(|store| store.get(&key).cloned()))
}

#[tauri::command]
fn desktop_token_set(
    app: AppHandle,
    state: State<'_, DesktopTokenStore>,
    key: String,
    value: String,
) -> Result<(), String> {
    validate_token_key(&key)?;
    let mut values = state
        .0
        .lock()
        .map_err(|_| "Desktop token store is unavailable".to_string())?;
    let mut next_values = match values.as_ref() {
        Some(current) => current.clone(),
        None => read_token_store(&app)?,
    };

    if value.is_empty() {
        next_values.remove(&key);
    } else {
        next_values.insert(key, value);
    }

    write_token_store(&app, &next_values)?;
    *values = Some(next_values);
    Ok(())
}

#[tauri::command]
async fn desktop_auth_request(request: DesktopAuthRequest) -> Result<DesktopAuthResponse, String> {
    let is_allowed_url = request.url.starts_with("https://cookapps.net/")
        || request.url.starts_with("http://localhost:3000/");
    if !is_allowed_url {
        return Err("Authentication URL is not allowed".to_string());
    }

    let method = reqwest::Method::from_bytes(request.method.as_bytes())
        .map_err(|error| format!("Invalid authentication method: {error}"))?;
    if method != reqwest::Method::GET && method != reqwest::Method::POST {
        return Err("Authentication method is not allowed".to_string());
    }

    let client = reqwest::Client::new();
    let mut builder = client.request(method, &request.url);
    for (name, value) in request.headers.unwrap_or_default() {
        builder = builder.header(name, value);
    }
    if let Some(body) = request.body {
        builder = builder.json(&body);
    }

    let response = builder
        .send()
        .await
        .map_err(|error| format!("CookApps request failed: {error}"))?;
    let status = response.status().as_u16();
    let body = response.json::<Value>().await.unwrap_or(Value::Null);

    Ok(DesktopAuthResponse { status, body })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(DesktopTokenStore::default())
        .invoke_handler(tauri::generate_handler![
            desktop_auth_request,
            desktop_token_get,
            desktop_token_set
        ])
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // Forward command-line deep-link args on Windows single instance
            for arg in argv {
                if arg.starts_with("cookapps-cword://") {
                    let _ = app.emit("cword:deeplink", serde_json::json!({ "url": arg }));
                }
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            #[cfg(any(windows, target_os = "linux"))]
            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let app_handle = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    for url in event.urls() {
                        let url_str = url.to_string();
                        if url_str.starts_with("cookapps-cword://") {
                            let _ = app_handle
                                .emit("cword:deeplink", serde_json::json!({ "url": url_str }));
                        }
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running CWord tauri application");
}
