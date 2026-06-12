import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useParams, useLocation } from "react-router";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Send, Paperclip, X, ArrowUpDown } from "lucide-react";
import { AttachmentView } from "../components/globals/AttachmentView";
import { getChannelMessages, uploadAttachment, type Message, type DmChannel, type Attachment } from "../services/channels";
import { initP2P, sendFileP2P, cancelP2P, P2P_THRESHOLD, type P2PCallbacks } from "../services/p2p";
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

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} Go`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${bytes} o`;
}

interface PendingFile {
  name: string;
  path: string;
  contentType: string;
  size: number;
  p2p: boolean; // true if >200MB
}

interface P2PEntry {
  filename: string;
  fileSize: number;
  bytes: number;
  direction: "send" | "receive";
  fromUserId?: string;
  done: boolean;
  error?: string;
}

export default function DMPage() {
  const { channelId } = useParams<{ channelId: string }>();
  const { state } = useLocation();
  const channel = state?.channel as DmChannel | undefined;
  const { user } = useAuth();
  const { markRead, setActiveChannel, lockedChannels } = useUnread();
  const isLocked = channelId ? lockedChannels.has(channelId) : false;
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [p2pMap, setP2PMap] = useState<Map<string, P2PEntry>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prependScrollRef = useRef<number | null>(null);
  const autoScrollRef = useRef(true);

  const otherParticipants = channel?.participants.filter((p) => p.id !== user?.id) ?? [];
  const channelDisplayName = otherParticipants.length > 0
    ? otherParticipants.map((p) => p.display_name || p.name).join(", ")
    : (channel?.name ?? "DM");
  const channelInitials = getInitials(channelDisplayName);
  // P2P only for 1-on-1 DMs
  const otherUserId = otherParticipants.length === 1 ? otherParticipants[0].id : null;

  function updateP2P(transferId: string, patch: Partial<P2PEntry>) {
    setP2PMap((prev) => {
      const next = new Map(prev);
      const cur = next.get(transferId);
      if (cur) next.set(transferId, { ...cur, ...patch });
      return next;
    });
  }

  // Register P2P incoming handler whenever otherUserId changes
  useEffect(() => {
    if (!otherUserId) return;

    const cleanup = initP2P((transferId, filename, fileSize, fromUserId) => {
      // Only handle signals from the person we're chatting with
      if (fromUserId !== otherUserId) {
        return { onProgress: () => {}, onDone: () => {}, onError: () => {} };
      }

      setP2PMap((prev) => {
        const next = new Map(prev);
        next.set(transferId, { filename, fileSize, bytes: 0, direction: "receive", fromUserId, done: false });
        return next;
      });

      const callbacks: P2PCallbacks = {
        onProgress: (bytes) => updateP2P(transferId, { bytes }),
        onDone: () => updateP2P(transferId, { done: true }),
        onError: (error) => updateP2P(transferId, { error }),
      };
      return callbacks;
    });

    return cleanup;
  }, [otherUserId]);

  async function doSend(content: string) {
    if (!channelId) return;

    // Separate CDN files from P2P files
    const cdnFiles = pendingFiles.filter((f) => !f.p2p);
    const p2pFiles = pendingFiles.filter((f) => f.p2p);
    setPendingFiles([]);

    // Upload CDN files
    let attachments: Attachment[] | undefined;
    if (cdnFiles.length > 0) {
      setUploading(true);
      try {
        attachments = await Promise.all(
          cdnFiles.map((f) => uploadAttachment(f.name, f.contentType, f.path)),
        );
      } finally {
        setUploading(false);
      }
    }

    // Send text + CDN attachments via WS
    if (content || attachments) {
      const err = await sendWsMessage(channelId, content, attachments).catch((e) => e);
      if (err) {
        setSendError(String(err));
        setTimeout(() => setSendError(null), 5000);
      } else if (attachments) {
        // Avec pièces jointes le serveur ne renvoie pas new_message à l'expéditeur
        autoScrollRef.current = true;
        getChannelMessages(channelId, { limit: 50 }).then((msgs) => {
          setMessages(msgs);
          setHasMore(msgs.length === 50);
        }).catch(console.error);
      }
    }

    // Start P2P transfers
    if (p2pFiles.length > 0 && otherUserId) {
      for (const f of p2pFiles) {
        const transferId = crypto.randomUUID();
        setP2PMap((prev) => {
          const next = new Map(prev);
          next.set(transferId, { filename: f.name, fileSize: f.size, bytes: 0, direction: "send", done: false });
          return next;
        });

        sendFileP2P(otherUserId, f.path, f.name, f.size, {
          onProgress: (bytes) => updateP2P(transferId, { bytes }),
          onDone: () => updateP2P(transferId, { done: true }),
          onError: (error) => updateP2P(transferId, { error }),
        }).catch((e) => updateP2P(transferId, { error: String(e) }));
      }
    }
  }

  async function loadOlder() {
    if (!channelId || !hasMore || loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const older = await getChannelMessages(channelId, { limit: 50, before: messages[0].id });
      if (older.length === 0) {
        setHasMore(false);
      } else {
        prependScrollRef.current = scrollRef.current?.scrollHeight ?? null;
        setMessages((prev) => [...older, ...prev]);
        if (older.length < 50) setHasMore(false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  }

  const { ref: inputRef, resize: resizeInput, onKeyDown: chatKeyDown } = useChatInput(doSend);

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

    setHasMore(false);
    autoScrollRef.current = true;
    getChannelMessages(channelId, { limit: 50 }).then((msgs) => {
      setMessages(msgs);
      setHasMore(msgs.length === 50);
    }).catch(console.error);

    listen<Message>("new-message", (event) => {
      if (event.payload.channel === channelId) {
        const scroll = scrollRef.current;
        const nearBottom = !scroll || scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 150;
        autoScrollRef.current = nearBottom;
        setMessages((prev) => [...prev, event.payload]);
      }
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenFn = fn;
    });

    const unlistenErr = listen<string>("server-error", (event) => {
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
    if (prependScrollRef.current !== null && scrollRef.current) {
      scrollRef.current.scrollTop += scrollRef.current.scrollHeight - prependScrollRef.current;
      prependScrollRef.current = null;
    } else if (autoScrollRef.current && messages.length > 0) {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Re-scroll when images/content load and expand the height
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const ro = new ResizeObserver(() => {
      if (autoScrollRef.current && scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const onScroll = () => {
      if (container.scrollTop < 100 && hasMore && !loadingMore) loadOlder();
      const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      if (!atBottom && prependScrollRef.current === null) autoScrollRef.current = false;
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [hasMore, loadingMore]);

  function handleSendClick() {
    const el = inputRef.current;
    const content = el?.value.trim() ?? "";
    if (!content && pendingFiles.length === 0) return;
    doSend(content);
    if (el) { el.value = ""; resizeInput(); }
  }

  async function handleAttach() {
    const result = await open({ multiple: true });
    if (!result) return;
    const paths = Array.isArray(result) ? result : [result];
    const files = await Promise.all(paths.map(async (p) => {
      const name = p.split(/[/\\]/).pop() ?? p;
      const ext = name.split(".").pop()?.toLowerCase() ?? "";
      const contentTypeMap: Record<string, string> = {
        png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
        webp: "image/webp", mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg",
        pdf: "application/pdf", txt: "text/plain", zip: "application/zip",
      };
      const contentType = contentTypeMap[ext] ?? "application/octet-stream";
      const size: number = await invoke<number>("get_file_size", { path: p }).catch(() => 0);
      const p2p = size > P2P_THRESHOLD;
      return { name, path: p, contentType, size, p2p };
    }));
    setPendingFiles((prev) => [...prev, ...files]);
  }

  const p2pEntries = Array.from(p2pMap.entries());

  return (
    <div className="dm-page">
      <div className="dm-topbar">
        <div className="avatar avatar--sm">{channelInitials}</div>
        <span className="dm-topbar-title">{channelDisplayName}</span>
        <div className="dm-topbar-spacer" />
      </div>

      <div className="dm-scroll" ref={scrollRef}>
        {loadingMore && <div className="dm-load-more">Chargement…</div>}
        <div ref={contentRef}>
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

        {/* P2P transfer progress indicators */}
        {p2pEntries.map(([id, t]) => (
          <div key={id} className="p2p-transfer">
            <ArrowUpDown size={14} className={t.direction === "send" ? "p2p-icon--send" : "p2p-icon--recv"} />
            <div className="p2p-info">
              <div className="p2p-name">{t.filename}</div>
              {t.error ? (
                <div className="p2p-error">{t.error}</div>
              ) : t.done ? (
                <div className="p2p-done">
                  {t.direction === "receive" ? "Enregistré dans Téléchargements" : "Envoyé"} — {formatSize(t.fileSize)}
                </div>
              ) : (
                <>
                  <div className="p2p-bar">
                    <div
                      className="p2p-bar-fill"
                      style={{ width: `${t.fileSize > 0 ? Math.round((t.bytes / t.fileSize) * 100) : 0}%` }}
                    />
                  </div>
                  <div className="p2p-stats">
                    {formatSize(t.bytes)} / {formatSize(t.fileSize)}
                  </div>
                </>
              )}
            </div>
            {(t.done || t.error) && (
              <button className="p2p-dismiss" onClick={() => setP2PMap((p) => { const n = new Map(p); n.delete(id); return n; })}>
                <X size={12} />
              </button>
            )}
            {!t.done && !t.error && t.direction === "send" && (
              <button className="p2p-cancel" onClick={() => { cancelP2P(id); updateP2P(id, { error: "Annulé" }); }}>
                <X size={12} />
              </button>
            )}
          </div>
        ))}

        <div ref={bottomRef} />
        </div>
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
                  <div key={i} className={`att-chip${f.p2p ? " att-chip--p2p" : ""}`}>
                    {f.p2p && <ArrowUpDown size={10} />}
                    <span className="att-chip-name">{f.name}</span>
                    {f.p2p && <span className="att-chip-size">{formatSize(f.size)} · P2P</span>}
                    <button className="att-chip-remove" onClick={() => setPendingFiles((p) => p.filter((_, j) => j !== i))}><X size={12} /></button>
                  </div>
                ))}
              </div>
            )}
            <div className={`dm-input-wrap ${inputFocused ? "focused" : ""}`}>
              <button className="dm-attach-btn" onClick={handleAttach} title="Joindre un fichier">
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
