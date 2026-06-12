import { useEffect, useState } from "react";
import { MessageCircle, UserMinus, Check, X } from "lucide-react";
import { listFriends, listPendingRequests, updateFriendRequest, deleteFriend } from "../../services/friends";
import { createDmChannel } from "../../services/channels";
import type { Friendship } from "../../services/friends";
import { sendWsMessage } from "../../services/ws";
import { useAuth } from "../../context/AuthContext";
import { usePresence } from "../../context/PresenceContext";
import type { FriendTab } from "../../routes/FriendPage";
import type { FriendUser } from "../../services/friends";

interface FriendListProps {
  filter: Exclude<FriendTab, "Ajouter">;
  query?: string;
  onPendingCountChange?: (count: number) => void;
  onRegisterRefreshPending?: (fn: () => void) => void;
  onRegisterRefreshFriends?: (fn: () => void) => void;
}

function getInitials(name: string) {
  return name.replace(/[^A-Za-z0-9À-ÿ]/g, " ").trim()
    .split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function FriendRow({
  friendship,
  currentUserId,
  onDelete,
  online,
}: {
  friendship: Friendship;
  currentUserId: string;
  onDelete: () => void;
  online: boolean;
}) {
  const other: FriendUser =
    friendship.in_user.id === currentUserId ? friendship.out_user : friendship.in_user;
  const displayName = other.display_name || other.name;
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [showInput, setShowInput] = useState(false);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    try {
      // createDmChannel est idempotent — crée ou retourne le channel existant.
      // On l'appelle AVANT d'envoyer pour garantir que le channel existe
      // côté serveur quand le sidebar se rafraîchit.
      const channel = await createDmChannel([other.id]);
      await sendWsMessage(channel.id, message.trim());
      setMessage("");
      setShowInput(false);
      window.dispatchEvent(new CustomEvent("refresh-dm-channels"));
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div className="fr-row">
        <div className="avatar avatar--md">
          {getInitials(displayName)}
          {online && <span className="status-dot" />}
        </div>
        <div className="fr-row-info">
          <div className="fr-row-name">{displayName}</div>
          <div className="fr-row-status">{online ? "En ligne" : "Hors ligne"}</div>
        </div>
        <div className="fr-row-actions">
          <button
            className="round-btn"
            title="Envoyer un message"
            onClick={() => setShowInput((v) => !v)}
          >
            <MessageCircle size={17} />
          </button>
          <button
            className="round-btn no"
            title="Supprimer cet ami"
            onClick={() => deleteFriend(friendship.id).then(() => {
              onDelete();
              window.dispatchEvent(new CustomEvent("refresh-dm-channels"));
            }).catch(console.error)}
          >
            <UserMinus size={17} />
          </button>
        </div>
      </div>
      {showInput && (
        <form className="fr-inline-form" onSubmit={handleSend}>
          <input
            type="text"
            placeholder={`Message à ${displayName}…`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={sending}
            autoFocus
          />
          <button type="submit" className="btn-primary" style={{ padding: "6px 14px", fontSize: "var(--text-sm)" }} disabled={sending || !message.trim()}>
            {sending ? "…" : "Envoyer"}
          </button>
        </form>
      )}
    </div>
  );
}

function PendingRow({
  friendship,
  onAction,
}: {
  friendship: Friendship;
  onAction: () => void;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const sender = friendship.in_user;
  const displayName = sender.display_name || sender.name;

  async function handleAction(action: "accept" | "reject") {
    setIsLoading(true);
    try {
      await updateFriendRequest(friendship.id, action);
      if (action === "accept") {
        createDmChannel([friendship.in_user.id])
          .finally(() => window.dispatchEvent(new CustomEvent("refresh-dm-channels")));
      }
      onAction();
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="fr-row">
      <div className="avatar avatar--md">{getInitials(displayName)}</div>
      <div className="fr-row-info">
        <div className="fr-row-name">{displayName}</div>
        <div className="fr-row-status">Demande entrante</div>
      </div>
      <div className="fr-row-actions">
        <button className="round-btn ok" title="Accepter" onClick={() => handleAction("accept")} disabled={isLoading}>
          <Check size={17} />
        </button>
        <button className="round-btn no" title="Refuser" onClick={() => handleAction("reject")} disabled={isLoading}>
          <X size={17} />
        </button>
      </div>
    </div>
  );
}

export default function FriendList({
  filter,
  query = "",
  onPendingCountChange,
  onRegisterRefreshPending,
  onRegisterRefreshFriends,
}: FriendListProps) {
  const { user } = useAuth();
  const { isOnline } = usePresence();
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [pending, setPending] = useState<Friendship[]>([]);

  function loadFriends() {
    if (!user) return;
    listFriends().then(setFriends).catch(console.error);
  }

  function loadPending() {
    if (!user) return;
    listPendingRequests()
      .then((data) => {
        setPending(data);
        onPendingCountChange?.(data.length);
      })
      .catch(console.error);
  }

  useEffect(() => {
    loadFriends();
    loadPending();
    onRegisterRefreshPending?.(loadPending);
    onRegisterRefreshFriends?.(loadFriends);
  }, [user]);

  if (filter === "En attente") {
    return (
      <div>
        <div className="fr-section-label">En attente — {pending.length}</div>
        {pending.map((f) => (
          <PendingRow
            key={f.id}
            friendship={f}
            onAction={() => { loadPending(); loadFriends(); }}
          />
        ))}
      </div>
    );
  }

  const lowerQuery = query.toLowerCase();
  const displayed = friends.filter((f) => {
    if (f.status !== "accepted") return false;
    const other = f.in_user.id === user?.id ? f.out_user : f.in_user;
    if (filter === "En ligne" && !isOnline(other.id)) return false;
    if (!lowerQuery) return true;
    return (other.display_name || other.name).toLowerCase().includes(lowerQuery);
  });

  const label = filter === "En ligne" ? "En ligne" : "Tous les amis";

  return (
    <div>
      <div className="fr-section-label">{label} — {displayed.length}</div>
      {displayed.map((f) => {
        const other = f.in_user.id === user?.id ? f.out_user : f.in_user;
        return (
          <FriendRow
            key={f.id}
            friendship={f}
            currentUserId={user!.id}
            onDelete={loadFriends}
            online={isOnline(other.id)}
          />
        );
      })}
    </div>
  );
}
