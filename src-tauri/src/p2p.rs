use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex as AsyncMutex;

use crate::AppState;

pub struct P2PReceive {
    pub temp_path: PathBuf,
    pub filename: String,
    pub writer: Arc<AsyncMutex<tokio::fs::File>>,
}

/// Retourne la taille d'un fichier sur le disque.
#[tauri::command]
pub async fn get_file_size(path: String) -> Result<u64, String> {
    tokio::fs::metadata(&path)
        .await
        .map(|m| m.len())
        .map_err(|e| format!("Impossible de lire le fichier : {}", e))
}

/// Lit un chunk et le retourne en binaire brut (pas de JSON — ArrayBuffer côté JS).
#[tauri::command]
pub async fn p2p_read_chunk(
    path: String,
    offset: u64,
    chunk_size: u32,
) -> Result<tauri::ipc::Response, String> {
    use tokio::io::{AsyncReadExt, AsyncSeekExt};

    let mut file = tokio::fs::File::open(&path)
        .await
        .map_err(|e| format!("Ouverture : {}", e))?;

    if offset > 0 {
        file.seek(std::io::SeekFrom::Start(offset))
            .await
            .map_err(|e| format!("Seek : {}", e))?;
    }

    let mut buf = vec![0u8; chunk_size as usize];
    let n = file
        .read(&mut buf)
        .await
        .map_err(|e| format!("Lecture : {}", e))?;
    buf.truncate(n);
    Ok(tauri::ipc::Response::new(buf))
}

/// Crée le fichier temporaire et ouvre le handle persistant.
#[tauri::command]
pub async fn p2p_receive_start(
    transfer_id: String,
    filename: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let temp_path = std::env::temp_dir().join(format!("litecord_p2p_{}", transfer_id));
    let file = tokio::fs::File::create(&temp_path)
        .await
        .map_err(|e| format!("Création temp file : {}", e))?;
    let writer = Arc::new(AsyncMutex::new(file));
    state
        .p2p_receives
        .lock()
        .unwrap()
        .insert(transfer_id, P2PReceive { temp_path, filename, writer });
    Ok(())
}

/// Écrit un chunk reçu (encodé en base64) dans le fichier temporaire.
/// Base64 réduit la taille du payload IPC de ~300 % (tableau JSON) à ~33 %.
#[tauri::command]
pub async fn p2p_receive_chunk(
    transfer_id: String,
    data: String, // base64
    state: State<'_, AppState>,
) -> Result<(), String> {
    use base64::{engine::general_purpose::STANDARD, Engine};

    let bytes = STANDARD
        .decode(&data)
        .map_err(|e| format!("Décode base64 : {}", e))?;

    let writer = {
        let lock = state.p2p_receives.lock().unwrap();
        lock.get(&transfer_id)
            .map(|r| Arc::clone(&r.writer))
            .ok_or_else(|| format!("Transfert inconnu : {}", transfer_id))?
    };

    let mut guard = writer.lock().await;
    guard
        .write_all(&bytes)
        .await
        .map_err(|e| format!("Écriture chunk : {}", e))
}

/// Flush + fermeture du handle, puis déplace vers Téléchargements.
#[tauri::command]
pub async fn p2p_receive_finish(
    transfer_id: String,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    use tauri::Manager;

    let receive = state
        .p2p_receives
        .lock()
        .unwrap()
        .remove(&transfer_id)
        .ok_or_else(|| format!("Transfert inconnu : {}", transfer_id))?;

    {
        let mut file = receive.writer.lock().await;
        file.flush().await.map_err(|e| format!("Flush : {}", e))?;
        file.shutdown().await.map_err(|e| format!("Shutdown : {}", e))?;
    }

    let download_dir = app.path().download_dir().map_err(|e| e.to_string())?;
    let dest = download_dir.join(&receive.filename);

    tokio::fs::rename(&receive.temp_path, &dest)
        .await
        .map_err(|e| format!("Déplacement : {}", e))
}

/// Annule un transfert entrant et supprime le fichier temporaire.
#[tauri::command]
pub async fn p2p_cancel(
    transfer_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let receive = state.p2p_receives.lock().unwrap().remove(&transfer_id);
    if let Some(r) = receive {
        drop(r.writer);
        let _ = tokio::fs::remove_file(&r.temp_path).await;
    }
    Ok(())
}
