use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use tauri::{Emitter, Manager, State};
use tokio::sync::mpsc::{self, UnboundedSender};

mod auth;
mod channels;
mod friends;
mod guilds;
mod p2p;
mod store;
mod voice;
mod ws;

pub struct AppState {
    pub api_url: String,
    pub token_store: Mutex<store::TokenStore>,
    pub http: reqwest::Client,
    pub ws_sender: Mutex<Option<UnboundedSender<String>>>,
    /// Canaux DM dont l'autre participant n'est plus ami — messages bloqués.
    pub locked_channels: Mutex<HashSet<String>>,
    /// IDs des amis en ligne au moment de l'auth WS — snapshot initial de présence.
    pub friends_online: Mutex<Vec<String>>,
    /// Incrémenté à chaque appel connect_ws — permet d'invalider les boucles de reconnexion obsolètes.
    pub ws_generation: Mutex<u64>,
    /// Fichiers temporaires des transferts P2P en cours de réception.
    pub p2p_receives: Mutex<HashMap<String, p2p::P2PReceive>>,
    /// Channel vocal actuellement rejoint par l'utilisateur local.
    pub current_voice_channel: Mutex<Option<String>>,
}

#[tauri::command]
async fn connect_ws(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let api_url = state.api_url.clone();

    // Invalide toute boucle de reconnexion précédente (re-login, etc.)
    let my_gen = {
        let mut gen = state.ws_generation.lock().unwrap();
        *gen += 1;
        *gen
    };

    tauri::async_runtime::spawn(async move {
        let mut backoff_secs = 1u64;

        loop {
            // Arrêt si une nouvelle connexion a été demandée
            if *app.state::<AppState>().ws_generation.lock().unwrap() != my_gen {
                break;
            }

            // Récupère le token frais (peut avoir été rafraîchi entre deux tentatives)
            let token = app
                .state::<AppState>()
                .token_store
                .lock()
                .unwrap()
                .load()
                .map(|t| t.token);

            let Some(token) = token else {
                eprintln!("[litecord] WS pas de token, arrêt reconnexion");
                break;
            };

            let (tx, rx) = mpsc::unbounded_channel::<String>();
            *app.state::<AppState>().ws_sender.lock().unwrap() = Some(tx);

            ws::run(app.clone(), api_url.clone(), token, rx).await;

            *app.state::<AppState>().ws_sender.lock().unwrap() = None;

            // Logout pendant la connexion ?
            if *app.state::<AppState>().ws_generation.lock().unwrap() != my_gen {
                break;
            }
            if app.state::<AppState>().token_store.lock().unwrap().load().is_none() {
                break;
            }

            eprintln!("[litecord] WS reconnexion dans {}s...", backoff_secs);
            let _ = app.emit("ws-reconnecting", backoff_secs);
            tokio::time::sleep(tokio::time::Duration::from_secs(backoff_secs)).await;
            backoff_secs = (backoff_secs * 2).min(30);
        }
    });

    Ok(())
}

#[tauri::command]
async fn get_friends_online(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    Ok(state.friends_online.lock().unwrap().clone())
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

#[tauri::command]
async fn relay_signal(
    to: String,
    content: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let payload = serde_json::json!({
        "to": to,
        "message_type": "relay",
        "content": content,
    })
    .to_string();

    state
        .ws_sender
        .lock()
        .unwrap()
        .as_ref()
        .ok_or("WebSocket non connecté")?
        .send(payload)
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
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
                friends_online: Mutex::new(Vec::new()),
                ws_generation: Mutex::new(0),
                p2p_receives: Mutex::new(HashMap::new()),
                current_voice_channel: Mutex::new(None),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            connect_ws,
            send_ws_message,
            get_friends_online,
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
            guilds::get_my_guild_member,
            guilds::kick_guild_member,
            guilds::list_guild_roles,
            guilds::create_guild_role,
            guilds::update_guild_role,
            guilds::delete_guild_role,
            guilds::assign_guild_role,
            guilds::remove_guild_role,
            guilds::set_channel_permissions,
            channels::upload_attachment,
            channels::download_attachment,
            relay_signal,
            voice::join_voice_channel,
            voice::leave_voice_channel,
            voice::get_current_voice_channel,
            p2p::get_file_size,
            p2p::p2p_read_chunk,
            p2p::p2p_receive_start,
            p2p::p2p_receive_chunk,
            p2p::p2p_receive_finish,
            p2p::p2p_cancel,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
