// Copyright (c) 2026 CookApps / Casual Office
// SPDX-License-Identifier: Apache-2.0

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::Emitter;

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

#[tauri::command]
async fn desktop_auth_request(
    request: DesktopAuthRequest,
) -> Result<DesktopAuthResponse, String> {
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
        .invoke_handler(tauri::generate_handler![desktop_auth_request])
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
                            let _ = app_handle.emit("cword:deeplink", serde_json::json!({ "url": url_str }));
                        }
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running CWord tauri application");
}
