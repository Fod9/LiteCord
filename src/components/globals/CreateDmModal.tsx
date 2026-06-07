import { useEffect, useState } from "react";
import { X, Check } from "lucide-react";
import { listFriends } from "../../services/friends";
import type { Friendship } from "../../services/friends";
import { createDmChannel } from "../../services/channels";
import type { DmChannel } from "../../services/channels";
import { useAuth } from "../../context/AuthContext";
import "../../styles/create-dm-modal.css";

interface CreateDmModalProps {
  onClose: () => void;
  onCreated: (channel: DmChannel) => void;
}

function getInitials(name: string) {
  return name.replace(/[^A-Za-z0-9À-ÿ]/g, " ").trim()
    .split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

export default function CreateDmModal({ onClose, onCreated }: CreateDmModalProps) {
  const { user } = useAuth();
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listFriends()
      .then((fs) => setFriends(fs.filter((f) => f.status === "accepted")))
      .catch(console.error);
  }, []);

  function toggle(userId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(userId) ? next.delete(userId) : next.add(userId);
      return next;
    });
  }

  async function handleCreate() {
    if (selected.size === 0) return;
    setLoading(true);
    setError(null);
    try {
      const channel = await createDmChannel([...selected]);
      onCreated(channel);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Nouvelle conversation</h2>
          <button className="modal-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <p className="modal-hint">Sélectionne des amis pour démarrer un message privé ou un groupe.</p>

        <span className="modal-label">Sélectionner des amis</span>

        <div className="modal-friend-list">
          {friends.length === 0 && (
            <p className="modal-empty">Aucun ami pour l'instant.</p>
          )}
          {friends.map((f) => {
            const other = f.in_user.id === user?.id ? f.out_user : f.in_user;
            const name = other.display_name || other.name;
            const isSelected = selected.has(other.id);
            return (
              <button
                key={f.id}
                className="modal-friend-row"
                onClick={() => toggle(other.id)}
              >
                <div className="avatar avatar--sm">{getInitials(name)}</div>
                <span className="modal-friend-name">{name}</span>
                <span className={`modal-check ${isSelected ? "checked" : ""}`}>
                  {isSelected && <Check size={12} />}
                </span>
              </button>
            );
          })}
        </div>

        {error && <p className="modal-error">{error}</p>}

        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>Annuler</button>
          <button
            className="btn-primary"
            onClick={handleCreate}
            disabled={selected.size === 0 || loading}
          >
            {loading ? "Création…" : `Créer${selected.size > 1 ? " le groupe" : ""}${selected.size > 0 ? ` (${selected.size})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
