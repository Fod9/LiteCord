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
    // Authentification via query param : évite les problèmes de timing liés au premier message
    let url = format!("{}/ws/?token={}", api_url_to_ws(&api_url), token);

    let (ws_stream, _) = match connect_async(&url).await {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[litecord] WS connexion échouée: {}", e);
            let _ = app.emit("ws-error", format!("Connexion WS échouée: {}", e));
            return;
        }
    };

    let (mut write, mut read) = ws_stream.split();

    eprintln!("[litecord] WS connecté");
    let _ = app.emit("ws-connected", ());

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
                    Some("role_created") => {
                        if let Some(payload) = parse_content(&json) {
                            let _ = app.emit("role-created", &payload);
                        }
                    }
                    Some("role_modified") => {
                        if let Some(payload) = parse_content(&json) {
                            let _ = app.emit("role-modified", &payload);
                        }
                    }
                    Some("role_deleted") => {
                        if let Some(payload) = parse_content(&json) {
                            let _ = app.emit("role-deleted", &payload);
                        }
                    }
                    Some("voice_state_update") => {
                        if let Some(payload) = parse_content(&json) {
                            // Si l'utilisateur vocal a quitté son channel, nettoyer l'état local
                            if payload.get("channel_id").map(|v| v.is_null()).unwrap_or(false) {
                                // no-op côté Rust — c'est le frontend qui gère la présence vocale
                            }
                            let _ = app.emit("voice-state-update", &payload);
                        }
                    }
                    Some("channel_permissions_updated") => {
                        let payload = json.get("content").and_then(|c| {
                            if c.is_object() { Some(c.clone()) }
                            else { c.as_str().and_then(|s| serde_json::from_str(s).ok()) }
                        });
                        if let Some(p) = payload {
                            let _ = app.emit("channel-permissions-updated", &p);
                        }
                    }
                    Some("relay") => {
                        // Signal P2P (WebRTC SDP/ICE) — on relaie tout le message vers le frontend
                        let _ = app.emit("p2p-signal", &json);
                    }
                    Some("user_online") => {
                        if let Some(user_id) = json.get("user_id").and_then(|v| v.as_str()) {
                            let uid = user_id.to_string();
                            {
                                let app_state = app.state::<crate::AppState>();
                                let mut fo = app_state.friends_online.lock().unwrap();
                                if !fo.contains(&uid) { fo.push(uid); }
                            }
                            let _ = app.emit("user-online", user_id);
                        }
                    }
                    Some("user_offline") => {
                        if let Some(user_id) = json.get("user_id").and_then(|v| v.as_str()) {
                            let uid = user_id.to_string();
                            {
                                let app_state = app.state::<crate::AppState>();
                                let mut fo = app_state.friends_online.lock().unwrap();
                                fo.retain(|id| id != &uid);
                            }
                            let _ = app.emit("user-offline", user_id);
                        }
                    }
                    Some("error") => {
                        let msg = json.get("content").and_then(|v| v.as_str()).unwrap_or("Erreur serveur inconnue");
                        eprintln!("[litecord] WS erreur serveur: {}", msg);
                        // "server-error" = erreur applicative (commande rejetée, permission manquante…)
                        // ≠ "ws-error" qui est réservé aux pannes de connexion WS
                        let _ = app.emit("server-error", msg);
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
                                let ids: Vec<String> = arr.iter().filter_map(|v| v.as_str().map(str::to_owned)).collect();
                                *app.state::<crate::AppState>().friends_online.lock().unwrap() = ids.clone();
                                let _ = app.emit("friends-online-init", &ids);
                            }
                            if let Some(states) = json.get("voice_states").and_then(|v| v.as_array()) {
                                let _ = app.emit("voice-states-init", states);
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
