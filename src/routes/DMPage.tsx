import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "react-router";
import { listen } from "@tauri-apps/api/event";
import { Send } from "lucide-react";
import { getChannelMessages, type Message, type DmChannel } from "../services/channels";
import { sendWsMessage } from "../services/ws";
import { useAuth } from "../context/AuthContext";
import "../styles/dm.css";

function getInitials(name: string) {
  return name.replace(/[^A-Za-z0-9À-ÿ]/g, " ").trim()
    .split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function DMPage() {
  const { channelId } = useParams<{ channelId: string }>();
  const { state } = useLocation();
  const channel = state?.channel as DmChannel | undefined;
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const otherParticipants = channel?.participants.filter((p) => p.id !== user?.id) ?? [];
  const channelDisplayName =
    channel?.name ??
    (otherParticipants.map((p) => p.display_name || p.name).join(", ") || "DM");

  const channelInitials = getInitials(channelDisplayName);

  function resolveAuthor(authorId: string): string {
    if (user && authorId === user.id) return user.display_name || user.name;
    const participant = channel?.participants.find((p) => p.id === authorId);
    return (participant?.display_name || participant?.name) ?? authorId.split(":")[1] ?? authorId;
  }

  useEffect(() => {
    if (!channelId) return;

    let cancelled = false;
    let unlistenFn: (() => void) | undefined;

    getChannelMessages(channelId).then(setMessages).catch(console.error);

    listen<Message>("new-message", (event) => {
      if (event.payload.channel === channelId) {
        setMessages((prev) => [...prev, event.payload]);
      }
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenFn = fn;
    });

    return () => {
      cancelled = true;
      unlistenFn?.();
    };
  }, [channelId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!channelId || !input.trim()) return;
    const content = input.trim();
    setInput("");
    await sendWsMessage(channelId, content);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSend();
  }

  return (
    <div className="dm-page">
      <div className="dm-topbar">
        <div className="avatar avatar--sm">{channelInitials}</div>
        <span className="dm-topbar-title">{channelDisplayName}</span>
        <div className="dm-topbar-spacer" />
      </div>

      <div className="dm-scroll">
        <div className="dm-intro">
          <div className="avatar avatar--lg" style={{ marginBottom: 12 }}>{channelInitials}</div>
          <h2>{channelDisplayName}</h2>
          <p>Ceci est le début de ta conversation avec {channelDisplayName}.</p>
        </div>

        <div className="day-sep">Aujourd'hui</div>

        {messages.length === 0 ? (
          <p className="dm-empty">Aucun message pour le moment.</p>
        ) : (
          messages.map((msg) => {
            const authorName = resolveAuthor(msg.author);
            return (
              <div key={msg.id} className="msg">
                <div className="avatar avatar--sm">{getInitials(authorName)}</div>
                <div className="msg-body">
                  <div className="msg-head">
                    <span className="msg-author">{authorName}</span>
                    <span className="msg-ts">{formatTime(msg.created_at)}</span>
                  </div>
                  <div className="msg-content">{msg.content}</div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="dm-input-bar">
        <div className={`dm-input-wrap ${inputFocused ? "focused" : ""}`}>
          <input
            className="dm-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder={`Envoyer un message à ${channelDisplayName}`}
          />
          <button
            className="dm-send-btn"
            onClick={handleSend}
            disabled={!input.trim()}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
