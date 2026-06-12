import { Mic, Headphones, Settings } from "lucide-react";
import { useAuth, type WsStatus } from "../../context/AuthContext";
import "../../styles/userbar.css";

const WS_LABELS: Record<WsStatus, string> = {
  connecting: "Connexion…",
  connected: "En ligne",
  reconnecting: "Reconnexion…",
  error: "Hors ligne",
};

export default function UserBar() {
  const { user, wsStatus } = useAuth();
  if (!user) return null;

  const initials = (user.display_name || user.name)
    .replace(/[^A-Za-z0-9À-ÿ]/g, " ").trim()
    .split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="userbar">
      <div className="avatar avatar--sm">{initials}</div>
      <div className="userbar-meta">
        <div className="userbar-name">{user.display_name || user.name}</div>
        <div className={`userbar-tag userbar-tag--ws-${wsStatus}`}>{WS_LABELS[wsStatus]}</div>
      </div>
      <button className="icon-btn" title="Micro"><Mic size={15} /></button>
      <button className="icon-btn" title="Casque"><Headphones size={15} /></button>
      <button className="icon-btn" title="Paramètres"><Settings size={15} /></button>
    </div>
  );
}
