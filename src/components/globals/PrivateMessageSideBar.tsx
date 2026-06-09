import { useEffect, useState } from "react";
import { useResize } from "../../hooks/useResize";
import { useNavigate, useParams, useLocation } from "react-router";
import { listen } from "@tauri-apps/api/event";
import { Plus, UserRound, Settings, Mic, Headphones } from "lucide-react";
import { listDmChannels, createDmChannel, lockChannel, unlockChannel } from "../../services/channels";
import type { DmChannel } from "../../services/channels";
import { useAuth } from "../../context/AuthContext";
import { usePresence } from "../../context/PresenceContext";
import { useUnread } from "../../context/UnreadContext";
import CreateDmModal from "./CreateDmModal";
import "../../styles/friend-sidebar.css";

interface DmEntryProps {
  channel: DmChannel;
  selected: boolean;
  onClick: () => void;
  currentUserId: string;
}

function DmEntry({ channel, selected, onClick, currentUserId }: DmEntryProps) {
  const { isOnline } = usePresence();
  const { unread } = useUnread();
  const others = channel.participants.filter((p) => p.id !== currentUserId);
  const displayName = channel.name ?? (others.map((p) => p.display_name || p.name).join(", ") || "DM");
  const initials = displayName.replace(/[^A-Za-z0-9À-ÿ]/g, " ").trim().split(" ")
    .map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();
  const showDot = others.length === 1 && isOnline(others[0].id);
  const unreadCount = unread[channel.id] ?? 0;

  return (
    <button className={`entry ${selected ? "active" : ""}`} onClick={onClick}>
      <div className="avatar avatar--md">
        {initials}
        {showDot && <span className="status-dot" />}
      </div>
      <div className="entry-col">
        <span className="entry-name">{displayName}</span>
      </div>
      {unreadCount > 0 && (
        <span className="unread-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
      )}
    </button>
  );
}

export default function PrivateMessageSideBar() {
  const { user } = useAuth();
  const { registerChannel, setChannelLocked } = useUnread();
  const { width, onMouseDown } = useResize(280, 160, 480, "right", "sidebar-pm-width");
  const [channels, setChannels] = useState<DmChannel[]>([]);
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();
  const { channelId: activeChannelId } = useParams<{ channelId: string }>();
  const { pathname } = useLocation();
  const friendsActive = pathname === "/";

  function loadChannels() {
    if (!user) return;
    listDmChannels().then(({ channels, friendships }) => {
      setChannels(channels);
      channels.forEach((c) => registerChannel(c.id, "dm"));

      const friendIds = new Set(
        friendships.map((f) => (f.in_user === user.id ? f.out_user : f.in_user))
      );
      channels.forEach((ch) => {
        const others = ch.participants.filter((p) => p.id !== user.id);
        if (others.length === 1) {
          const locked = !friendIds.has(others[0].id);
          setChannelLocked(ch.id, locked);
          if (locked) lockChannel(ch.id).catch(() => {});
          else unlockChannel(ch.id).catch(() => {});
        }
      });
    }).catch(console.error);
  }

  useEffect(() => {
    loadChannels();
    const unlisten1 = listen("dm-channel-created", () => loadChannels());
    const unlistenFriendRemoved = listen("friend-removed", () => loadChannels());
    const unlisten2 = listen<{ from_user: { id: string } }>("friend-request-updated", (e) => {
      createDmChannel([e.payload.from_user.id])
        .then(() => loadChannels())
        .catch(() => loadChannels());
    });
    window.addEventListener("refresh-dm-channels", loadChannels);
    return () => {
      unlisten1.then((fn) => fn());
      unlistenFriendRemoved.then((fn) => fn());
      unlisten2.then((fn) => fn());
      window.removeEventListener("refresh-dm-channels", loadChannels);
    };
  }, [user]);

  const userInitials = user
    ? (user.display_name || user.name).replace(/[^A-Za-z0-9À-ÿ]/g, " ").trim()
        .split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  return (
    <div className="friend-sidebar" style={{ width, minWidth: width, maxWidth: width }}>
      <div className="resize-handle" onMouseDown={onMouseDown} />
      <div className="sb-search">
        <input placeholder="Rechercher une conversation" />
      </div>

      <div className="sb-nav">
        <button
          className={`sb-nav-item ${friendsActive ? "active" : ""}`}
          onClick={() => navigate("/")}
        >
          <UserRound size={18} />
          Amis
        </button>
      </div>

      <div className="sb-header">
        Messages privés
        <button className="sb-plus" onClick={() => setShowModal(true)} title="Créer un DM">
          <Plus size={16} />
        </button>
      </div>

      <div className="sb-list">
        {channels.map((channel) => (
          <DmEntry
            key={channel.id}
            channel={channel}
            selected={activeChannelId === channel.id}
            onClick={() => navigate(`/channels/${channel.id}`, { state: { channel } })}
            currentUserId={user!.id}
          />
        ))}
      </div>

      {user && (
        <div className="userbar">
          <div className="avatar avatar--sm">{userInitials}</div>
          <div className="userbar-meta">
            <div className="userbar-name">{user.display_name || user.name}</div>
            <div className="userbar-tag">En ligne</div>
          </div>
          <button className="icon-btn" title="Micro"><Mic size={15} /></button>
          <button className="icon-btn" title="Casque"><Headphones size={15} /></button>
          <button className="icon-btn" title="Paramètres"><Settings size={15} /></button>
        </div>
      )}

      {showModal && (
        <CreateDmModal
          onClose={() => setShowModal(false)}
          onCreated={(channel) => {
            setShowModal(false);
            setChannels((prev) =>
              prev.some((c) => c.id === channel.id) ? prev : [...prev, channel]
            );
            navigate(`/channels/${channel.id}`, { state: { channel } });
          }}
        />
      )}
    </div>
  );
}
