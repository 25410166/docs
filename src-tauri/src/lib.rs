// Copyright (c) 2026 CookApps / Casual Office
// SPDX-License-Identifier: Apache-2.0

use tauri::Emitter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
