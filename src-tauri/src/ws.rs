use futures_util::{SinkExt, StreamExt};
use tauri::{AppHandle, Emitter};
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
                        // content = JSON stringifié { friendship, from_user }
                        if let Some(payload) = parse_content(&json) {
                            let _ = app.emit("friend-request", &payload);
                        }
                    }
                    Some("friend_request_updated") => {
                        if let Some(payload) = parse_content(&json) {
                            let _ = app.emit("friend-request-updated", &payload);
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
                    _ => {
                        if json.get("status").and_then(|v| v.as_str()) == Some("authenticated") {
                            eprintln!("[litecord] WS authentifié");
                            // Initialiser l'état de présence avec les amis déjà connectés
                            if let Some(arr) = json.get("friends_online").and_then(|v| v.as_array()) {
                                let ids: Vec<&str> = arr.iter().filter_map(|v| v.as_str()).collect();
                                let _ = app.emit("friends-online-init", &ids);
                            }
                        } else if json.get("error").is_some() {
                            eprintln!("[litecord] WS auth refusée: {}", json);
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
