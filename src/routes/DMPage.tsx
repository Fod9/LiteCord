import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "react-router";
import { listen } from "@tauri-apps/api/event";
import { Send, Paperclip, X } from "lucide-react";
import { getChannelMessages, uploadAttachment, type Message, type DmChannel, type Attachment } from "../services/channels";
import { sendWsMessage } from "../services/ws";
import { useAuth } from "../context/AuthContext";
import { useUnread } from "../context/UnreadContext";
import { useChatInput } from "../hooks/useChatInput";
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

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"]);
const AUDIO_EXTS = new Set(["mp3", "ogg", "wav", "flac", "m4a", "opus"]);

function AttachmentView({ att }: { att: Attachment }) {
  const ext = att.filename.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE_EXTS.has(ext)) {
    return <img src={att.url} alt={att.filename} className="att-image" />;
  }
  if (AUDIO_EXTS.has(ext)) {
    return (
      <div className="att-audio">
        <span className="att-filename">{att.filename}</span>
        <audio controls src={att.url} />
      </div>
    );
  }
  const kb = (att.size / 1024).toFixed(1);
  return (
    <a href={att.url} download={att.filename} className="att-file">
      <Paperclip size={14} />
      <span>{att.filename}</span>
      <span className="att-size">{kb} KB</span>
    </a>
  );
}

export default function DMPage() {
  const { channelId } = useParams<{ channelId: string }>();
  const { state } = useLocation();
  const channel = state?.channel as DmChannel | undefined;
  const { user } = useAuth();
  const { markRead, setActiveChannel, lockedChannels } = useUnread();
  const isLocked = channelId ? lockedChannels.has(channelId) : false;
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputFocused, setInputFocused] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function doSend(content: string) {
    if (!channelId) return;
    let attachments: Attachment[] | undefined;
    if (pendingFiles.length > 0) {
      setUploading(true);
      try {
        attachments = await Promise.all(
          pendingFiles.map(async (file) => {
            const buf = await file.arrayBuffer();
            return uploadAttachment(file.name, file.type || "application/octet-stream", Array.from(new Uint8Array(buf)));
          }),
        );
      } finally {
        setUploading(false);
      }
      setPendingFiles([]);
    }
    await sendWsMessage(channelId, content, attachments).catch((err) => {
      setSendError(String(err));
      setTimeout(() => setSendError(null), 5000);
    });
  }

  const { ref: inputRef, resize: resizeInput, onKeyDown: chatKeyDown } = useChatInput(doSend);

  const otherParticipants = channel?.participants.filter((p) => p.id !== user?.id) ?? [];
  const channelDisplayName =
    channel?.name ??
    (otherParticipants.map((p) => p.display_name || p.name).join(", ") || "DM");

  const channelInitials = getInitials(channelDisplayName);

  function resolveAuthor(author: { id: string; display_name: string; name: string }): string {
    if (user && author.id === user.id) return user.display_name || user.name;
    return author.display_name || author.name;
  }

  useEffect(() => {
    if (!channelId) return;
    setActiveChannel(channelId);
    return () => setActiveChannel(null);
  }, [channelId]);

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

    const unlistenErr = listen<string>("ws-error", (event) => {
      setSendError(event.payload);
      setTimeout(() => setSendError(null), 5000);
    });

    return () => {
      cancelled = true;
      unlistenFn?.();
      unlistenErr.then((fn) => fn());
    };
  }, [channelId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages]);

  function handleSendClick() {
    const el = inputRef.current;
    const content = el?.value.trim() ?? "";
    if (!content && pendingFiles.length === 0) return;
    doSend(content);
    if (el) { el.value = ""; resizeInput(); }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) setPendingFiles((prev) => [...prev, ...files]);
    e.target.value = "";
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
            const authorName = resolveAuthor(msg.author as { id: string; display_name: string; name: string });
            return (
              <div key={msg.id} className="msg">
                <div className="avatar avatar--sm">{getInitials(authorName)}</div>
                <div className="msg-body">
                  <div className="msg-head">
                    <span className="msg-author">{authorName}</span>
                    <span className="msg-ts">{formatTime(msg.created_at)}</span>
                  </div>
                  {msg.content && <div className="msg-content">{msg.content}</div>}
                  {msg.attachments?.length > 0 && (
                    <div className="msg-attachments">
                      {msg.attachments.map((att) => <AttachmentView key={att.url} att={att} />)}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="dm-input-bar">
        {sendError && <div className="send-error">{sendError}</div>}
        {isLocked ? (
          <div className="dm-locked-bar">
            Vous n'êtes plus amis — envoi de messages désactivé.
          </div>
        ) : (
          <>
            {pendingFiles.length > 0 && (
              <div className="att-chips">
                {pendingFiles.map((f, i) => (
                  <div key={i} className="att-chip">
                    <span className="att-chip-name">{f.name}</span>
                    <button className="att-chip-remove" onClick={() => setPendingFiles((p) => p.filter((_, j) => j !== i))}><X size={12} /></button>
                  </div>
                ))}
              </div>
            )}
            <div className={`dm-input-wrap ${inputFocused ? "focused" : ""}`}>
              <input type="file" multiple ref={fileInputRef} style={{ display: "none" }} onChange={handleFileChange} />
              <button className="dm-attach-btn" onClick={() => fileInputRef.current?.click()} title="Joindre un fichier">
                <Paperclip size={18} />
              </button>
              <textarea
                ref={inputRef}
                className="dm-input"
                rows={1}
                onInput={resizeInput}
                onKeyDown={chatKeyDown}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                placeholder={`Envoyer un message à ${channelDisplayName}`}
                disabled={isLocked || uploading}
              />
              <button
                className="dm-send-btn"
                onClick={handleSendClick}
                disabled={uploading}
              >
                <Send size={16} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
