use futures_util::{SinkExt, StreamExt};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::mpsc::UnboundedReceiver;
use tokio_tungstenite::{connect_async, tungstenite::Message};

fn api_url_to_ws(api_url: &str) -> String {
    api_url
        .replacen("https://", "wss://", 1)
        .replacen("http://", "ws://", 1)
}

/// Parse le champ `content` (JSON stringifié) des événements serveur.
fn parse_content(json: &serde_json::Value) -> Option<serde_json::Value> {
    json.get("content")
        .and_then(|c| c.as_str())
        .and_then(|s| serde_json::from_str(s).ok())
}

pub async fn run(
    app: AppHandle,
    api_url: String,
    token: String,
    mut rx: UnboundedReceiver<String>,
) {
    let url = format!("{}/ws/", api_url_to_ws(&api_url));

    let (ws_stream, _) = match connect_async(&url).await {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[litecord] WS connexion échouée ({}): {}", url, e);
            return;
        }
    };

    let (mut write, mut read) = ws_stream.split();

    let auth = serde_json::json!({ "token": token }).to_string();
    if let Err(e) = write.send(Message::Text(auth)).await {
        eprintln!("[litecord] WS auth échouée: {}", e);
        return;
    }

    eprintln!("[litecord] WS connecté à {}", url);

    loop {
        tokio::select! {
            // Messages entrants du serveur
            incoming = read.next() => {
                let msg = match incoming {
                    Some(Ok(m)) => m,
                    Some(Err(e)) => { eprintln!("[litecord] WS erreur: {}", e); break; }
                    None => { eprintln!("[litecord] WS fermé"); break; }
                };

                let text = match msg {
                    Message::Text(t) => t,
                    Message::Close(_) => { eprintln!("[litecord] WS fermé par le serveur"); break; }
                    _ => continue,
                };

                let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) else { continue };

                match json.get("message_type").and_then(|v| v.as_str()) {
                    Some("friend_request") => {
                        // content = JSON stringifié { friendship, from_user } ou objet direct
                        let payload = json.get("content").and_then(|c| {
                            if c.is_object() { Some(c.clone()) }
                            else { c.as_str().and_then(|s| serde_json::from_str(s).ok()) }
                        });
                        if let Some(p) = payload {
                            let _ = app.emit("friend-request", &p);
                        }
                    }
                    Some("friend_request_updated") => {
                        // content = JSON stringifié { friendship, from_user } ou objet direct
                        let payload = json.get("content").and_then(|c| {
                            if c.is_object() { Some(c.clone()) }
                            else { c.as_str().and_then(|s| serde_json::from_str(s).ok()) }
                        });
                        if let Some(p) = payload {
                            let _ = app.emit("friend-request-updated", &p);
                        }
                    }
                    Some("dm_channel_created") => {
                        // content = "DMChannel:<id>" (string brut)
                        let channel_id = json.get("content").and_then(|v| v.as_str()).unwrap_or("");
                        let _ = app.emit("dm-channel-created", channel_id);
                    }
                    Some("new_message") => {
                        // content peut être un objet JSON direct ou une chaîne JSON encodée
                        let payload = json.get("content").and_then(|c| {
                            if c.is_object() {
                                Some(c.clone())
                            } else {
                                c.as_str().and_then(|s| serde_json::from_str(s).ok())
                            }
                        });
                        if let Some(p) = payload {
                            let _ = app.emit("new-message", &p);
                        }
                    }
                    Some("friend_removed") => {
                        // content = "friendship:<id>" (string brut)
                        let friendship_id = json.get("content").and_then(|v| v.as_str()).unwrap_or("");
                        let _ = app.emit("friend-removed", friendship_id);
                    }
                    Some("guild_member_joined") => {
                        if let Some(payload) = parse_content(&json) {
                            let _ = app.emit("guild-member-joined", &payload);
                        }
                    }
                    Some("guild_member_left") => {
                        if let Some(payload) = parse_content(&json) {
                            let _ = app.emit("guild-member-left", &payload);
                        }
                    }
                    Some("guild_deleted") => {
                        // content = "guild:<id>" (string brut)
                        let guild_id = json.get("content").and_then(|v| v.as_str()).unwrap_or("");
                        let _ = app.emit("guild-deleted", guild_id);
                    }
                    Some("channel_created") => {
                        // content peut être un objet direct ou un JSON stringifié
                        let payload = json.get("content").and_then(|c| {
                            if c.is_object() { Some(c.clone()) }
                            else { c.as_str().and_then(|s| serde_json::from_str(s).ok()) }
                        });
                        if let Some(p) = payload {
                            let _ = app.emit("channel-created", &p);
                        }
                    }
                    Some("channel_deleted") => {
                        if let Some(payload) = parse_content(&json) {
                            let _ = app.emit("channel-deleted", &payload);
                        }
                    }
                    Some("role_updated") => {
                        if let Some(payload) = parse_content(&json) {
                            let _ = app.emit("role-updated", &payload);
                        }
                    }
                    Some("user_online") => {
                        if let Some(user_id) = json.get("user_id").and_then(|v| v.as_str()) {
                            let _ = app.emit("user-online", user_id);
                        }
                    }
                    Some("user_offline") => {
                        if let Some(user_id) = json.get("user_id").and_then(|v| v.as_str()) {
                            let _ = app.emit("user-offline", user_id);
                        }
                    }
                    Some("error") => {
                        let msg = json.get("content").and_then(|v| v.as_str()).unwrap_or("Erreur WS inconnue");
                        eprintln!("[litecord] WS erreur serveur: {}", msg);
                        let _ = app.emit("ws-error", msg);
                    }
                    _ => {
                        let action = json.get("action").and_then(|v| v.as_str());
                        let status = json.get("status").and_then(|v| v.as_str());

                        if action == Some("token_refresh_required") {
                            eprintln!("[litecord] WS token refresh requis");
                            let refresh_token = app
                                .state::<crate::AppState>()
                                .token_store
                                .lock()
                                .unwrap()
                                .load()
                                .map(|t| t.refresh_token);

                            match refresh_token {
                                Some(rt) => {
                                    let msg = serde_json::json!({ "refresh_token": rt }).to_string();
                                    if let Err(e) = write.send(Message::Text(msg)).await {
                                        eprintln!("[litecord] WS envoi refresh token échoué: {}", e);
                                        break;
                                    }
                                }
                                None => {
                                    eprintln!("[litecord] WS refresh token introuvable, fermeture");
                                    break;
                                }
                            }
                        } else if status == Some("token_refreshed") {
                            eprintln!("[litecord] WS tokens rafraîchis");
                            let new_token = json.get("token").and_then(|v| v.as_str());
                            let new_refresh = json.get("refresh_token").and_then(|v| v.as_str());

                            if let (Some(token), Some(refresh_token)) = (new_token, new_refresh) {
                                let tokens = crate::store::Tokens {
                                    token: token.to_string(),
                                    refresh_token: refresh_token.to_string(),
                                };
                                if let Err(e) = app
                                    .state::<crate::AppState>()
                                    .token_store
                                    .lock()
                                    .unwrap()
                                    .save(&tokens)
                                {
                                    eprintln!("[litecord] WS sauvegarde tokens échouée: {}", e);
                                }
                            }
                        } else if status == Some("authenticated") {
                            eprintln!("[litecord] WS authentifié");
                            if let Some(arr) = json.get("friends_online").and_then(|v| v.as_array()) {
                                let ids: Vec<&str> = arr.iter().filter_map(|v| v.as_str()).collect();
                                let _ = app.emit("friends-online-init", &ids);
                            }
                        } else if json.get("error").is_some() {
                            eprintln!("[litecord] WS erreur: {}", json);
                            break;
                        }
                    }
                }
            }

            // Messages sortants (depuis les commandes Tauri)
            Some(outgoing) = rx.recv() => {
                if let Err(e) = write.send(Message::Text(outgoing)).await {
                    eprintln!("[litecord] WS envoi échoué: {}", e);
                }
            }
        }
    }
}
