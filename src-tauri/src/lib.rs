use std::collections::HashSet;
use std::sync::Mutex;
use tauri::{Manager, State};
use tokio::sync::mpsc::{self, UnboundedSender};

mod auth;
mod channels;
mod friends;
mod guilds;
mod store;
mod ws;

pub struct AppState {
    pub api_url: String,
    pub token_store: Mutex<store::TokenStore>,
    pub http: reqwest::Client,
    pub ws_sender: Mutex<Option<UnboundedSender<String>>>,
    /// Canaux DM dont l'autre participant n'est plus ami — messages bloqués.
    pub locked_channels: Mutex<HashSet<String>>,
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
async fn lock_channel(channel_id: String, state: State<'_, AppState>) -> Result<(), String> {
    state.locked_channels.lock().unwrap().insert(channel_id);
    Ok(())
}

#[tauri::command]
async fn unlock_channel(channel_id: String, state: State<'_, AppState>) -> Result<(), String> {
    state.locked_channels.lock().unwrap().remove(&channel_id);
    Ok(())
}

#[tauri::command]
async fn send_ws_message(
    to: String,
    content: String,
    attachments: Option<Vec<channels::Attachment>>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if state.locked_channels.lock().unwrap().contains(&to) {
        return Err("Canal verrouillé : vous n'êtes plus amis avec cet utilisateur".into());
    }

    let mut payload = serde_json::json!({
        "to": to,
        "message_type": "text",
        "content": content,
    });
    if let Some(atts) = attachments {
        if !atts.is_empty() {
            payload["attachments"] = serde_json::json!(atts);
        }
    }
    let msg = payload.to_string();

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
            let profile = std::env::args()
                .skip_while(|a| a != "--profile")
                .nth(1);

            let base_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");

            let data_dir = match profile {
                Some(name) => base_dir.join(name),
                None => base_dir,
            };
            std::fs::create_dir_all(&data_dir).expect("failed to create app data dir");

            let api_url = std::env::var("LITECORD_API_URL")
                .unwrap_or_else(|_| "http://localhost:8080".to_string());

            app.manage(AppState {
                api_url,
                token_store: Mutex::new(store::TokenStore::new(data_dir.join("tokens.json"))),
                http: reqwest::Client::new(),
                ws_sender: Mutex::new(None),
                locked_channels: Mutex::new(HashSet::new()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            connect_ws,
            send_ws_message,
            lock_channel,
            unlock_channel,
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
            guilds::list_guilds,
            guilds::create_guild,
            guilds::join_guild,
            guilds::leave_guild,
            guilds::delete_guild,
            guilds::update_guild,
            guilds::get_guild_channels,
            guilds::create_guild_channel,
            guilds::delete_guild_channel,
            guilds::create_guild_invite,
            guilds::list_guild_invites,
            guilds::revoke_guild_invite,
            guilds::list_guild_members,
            guilds::kick_guild_member,
            guilds::list_guild_roles,
            guilds::create_guild_role,
            guilds::delete_guild_role,
            guilds::assign_guild_role,
            guilds::remove_guild_role,
            channels::upload_attachment,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
