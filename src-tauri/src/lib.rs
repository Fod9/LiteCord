use std::sync::Mutex;
use tauri::{Manager, State};
use tokio::sync::mpsc::{self, UnboundedSender};

mod auth;
mod channels;
mod friends;
mod store;
mod ws;

pub struct AppState {
    pub api_url: String,
    pub token_store: Mutex<store::TokenStore>,
    pub http: reqwest::Client,
    pub ws_sender: Mutex<Option<UnboundedSender<String>>>,
}

#[tauri::command]
async fn connect_ws(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let token = state
        .token_store
        .lock()
        .unwrap()
        .load()
        .ok_or("Non authentifié")?
        .token;

    let api_url = state.api_url.clone();
    let (tx, rx) = mpsc::unbounded_channel::<String>();
    *state.ws_sender.lock().unwrap() = Some(tx);

    tauri::async_runtime::spawn(async move {
        ws::run(app, api_url, token, rx).await;
        // Connexion fermée — on vide le sender
    });

    Ok(())
}

#[tauri::command]
async fn send_ws_message(
    to: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let msg = serde_json::json!({
        "to": to,
        "message_type": "text",
        "content": content,
    })
    .to_string();

    state
        .ws_sender
        .lock()
        .unwrap()
        .as_ref()
        .ok_or("WebSocket non connecté")?
        .send(msg)
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            std::fs::create_dir_all(&data_dir).expect("failed to create app data dir");

            let api_url = std::env::var("LITECORD_API_URL")
                .unwrap_or_else(|_| "http://localhost:8080".to_string());

            app.manage(AppState {
                api_url,
                token_store: Mutex::new(store::TokenStore::new(data_dir.join("tokens.json"))),
                http: reqwest::Client::new(),
                ws_sender: Mutex::new(None),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            connect_ws,
            send_ws_message,
            auth::login,
            auth::signup,
            auth::get_current_user,
            auth::logout,
            channels::list_dm_channels,
            channels::create_dm_channel,
            channels::get_channel_messages,
            friends::add_friend,
            friends::delete_friend,
            friends::list_friends,
            friends::list_pending_requests,
            friends::update_friend_request,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
