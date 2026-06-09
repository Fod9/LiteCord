use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone)]
pub struct Tokens {
    pub token: String,
    pub refresh_token: String,
}

pub struct TokenStore {
    path: PathBuf,
}

impl TokenStore {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn load(&self) -> Option<Tokens> {
        let data = std::fs::read_to_string(&self.path).ok()?;
        serde_json::from_str(&data).ok()
    }

    pub fn save(&self, tokens: &Tokens) -> std::io::Result<()> {
        let data = serde_json::to_string(tokens)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
        std::fs::write(&self.path, data)
    }

    pub fn clear(&self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static COUNTER: AtomicUsize = AtomicUsize::new(0);

    fn tmp_store() -> (TokenStore, std::path::PathBuf) {
        let id = COUNTER.fetch_add(1, Ordering::SeqCst);
        let path = std::env::temp_dir()
            .join(format!("litecord_store_test_{}_{}.json", std::process::id(), id));
        (TokenStore::new(path.clone()), path)
    }

    #[test]
    fn load_retourne_none_si_fichier_absent() {
        let (store, path) = tmp_store();
        let _ = std::fs::remove_file(&path);
        assert!(store.load().is_none());
    }

    #[test]
    fn save_puis_load_retourne_les_memes_tokens() {
        let (store, path) = tmp_store();
        let tokens = Tokens {
            token: "access_abc".to_string(),
            refresh_token: "refresh_xyz".to_string(),
        };
        store.save(&tokens).unwrap();
        let loaded = store.load().unwrap();
        assert_eq!(loaded.token, "access_abc");
        assert_eq!(loaded.refresh_token, "refresh_xyz");
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn save_ecrase_les_tokens_precedents() {
        let (store, path) = tmp_store();
        store.save(&Tokens { token: "old".to_string(), refresh_token: "old_r".to_string() }).unwrap();
        store.save(&Tokens { token: "new".to_string(), refresh_token: "new_r".to_string() }).unwrap();
        let loaded = store.load().unwrap();
        assert_eq!(loaded.token, "new");
        assert_eq!(loaded.refresh_token, "new_r");
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn clear_supprime_les_tokens() {
        let (store, path) = tmp_store();
        store.save(&Tokens { token: "t".to_string(), refresh_token: "r".to_string() }).unwrap();
        store.clear();
        assert!(store.load().is_none());
        let _ = std::fs::remove_file(&path);
    }
}
