import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "react-router";
import { listen } from "@tauri-apps/api/event";
import { Send, Paperclip, X } from "lucide-react";
import { getChannelMessages, uploadAttachment, type Message, type Attachment } from "../services/channels";
import { listGuildMembers, listGuildRoles, type GuildMember, type GuildChannel, type Role } from "../services/guilds";
import { useResize } from "../hooks/useResize";
import { useChatInput } from "../hooks/useChatInput";
import { sendWsMessage } from "../services/ws";
import { useAuth } from "../context/AuthContext";
import { useGuild } from "../context/GuildContext";
import { useUnread } from "../context/UnreadContext";
import "../styles/dm.css";
import "../styles/member-list.css";

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

function groupMembersByRole(members: GuildMember[], roles: Role[]): { label: string; color?: string; members: GuildMember[] }[] {
  const sorted = [...roles].sort((a, b) => a.position - b.position);
  const assigned = new Set<string>();
  const groups: { label: string; color?: string; members: GuildMember[] }[] = [];

  for (const role of sorted) {
    const inRole = members.filter((m) => m.roles.includes(role.id) && !assigned.has(m.id));
    if (inRole.length === 0) continue;
    inRole.forEach((m) => assigned.add(m.id));
    groups.push({ label: role.name, color: role.color, members: inRole });
  }

  const rest = members.filter((m) => !assigned.has(m.id));
  if (rest.length > 0) groups.push({ label: "Membres", members: rest });

  return groups;
}

function MemberList({ guildId }: { guildId: string }) {
  const [members, setMembers] = useState<GuildMember[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const { width, onMouseDown } = useResize(240, 140, 400, "left", "sidebar-members-width");

  function reload() {
    listGuildMembers(guildId).then(setMembers).catch(console.error);
  }

  useEffect(() => {
    reload();
    listGuildRoles(guildId).then(setRoles).catch(console.error);

    const u1 = listen("guild-member-joined", reload);
    const u2 = listen("guild-member-left", reload);
    const u3 = listen<{ guild_id: string }>("role-updated", (e) => {
      if (e.payload.guild_id === guildId) reload();
    });

    return () => {
      u1.then((fn) => fn());
      u2.then((fn) => fn());
      u3.then((fn) => fn());
    };
  }, [guildId]);

  const groups = groupMembersByRole(members, roles);

  return (
    <div className="member-list" style={{ width, minWidth: width, maxWidth: width }}>
      <div className="resize-handle resize-handle--left" onMouseDown={onMouseDown} />
      <div className="member-list-scroll">
        {groups.map((group) => (
          <div key={group.label} className="member-group">
            <div className="member-group-label" style={group.color ? { color: group.color } : undefined}>
              {group.label} — {group.members.length}
            </div>
            {group.members.map((m) => {
              const name = m.nickname || m.user.display_name || m.user.name;
              return (
                <div key={m.id} className="member-row">
                  <div className="avatar avatar--sm">{getInitials(name)}</div>
                  <span className="member-name">{name}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function GuildChannelPage() {
  const { guildId, channelId } = useParams<{ guildId: string; channelId: string }>();
  const { state } = useLocation();
  const channel = state?.channel as GuildChannel | undefined;
  const { user } = useAuth();
  const { setLastVisited } = useGuild();
  const { setActiveChannel } = useUnread();
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

  const channelDisplayName = channel?.name ?? channelId ?? "channel";

  useEffect(() => {
    if (!channelId || !guildId || !channel) return;
    setActiveChannel(channelId);
    setLastVisited(guildId, channel, `/guilds/${guildId}/channels/${channelId}`);
    return () => setActiveChannel(null);
  }, [channelId, guildId]);

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

  function resolveAuthor(author: { id: string; display_name: string; name: string }): string {
    if (user && author.id === user.id) return user.display_name || user.name;
    return author.display_name || author.name;
  }

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
    <div className="guild-channel-layout">
      <div className="dm-page">
        <div className="dm-topbar">
          <span className="channel-topbar-prefix">#</span>
          <span className="dm-topbar-title">{channelDisplayName}</span>
          <div className="dm-topbar-spacer" />
        </div>

        <div className="dm-scroll">
          <div className="dm-intro">
            <div className="channel-intro-icon">#</div>
            <h2>{channelDisplayName}</h2>
            <p>Bienvenue dans <strong>#{channelDisplayName}</strong> !</p>
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
              placeholder={`Envoyer un message dans #${channelDisplayName}`}
              disabled={uploading}
            />
            <button className="dm-send-btn" onClick={handleSendClick} disabled={uploading}>
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>

      {guildId && <MemberList guildId={guildId} />}
    </div>
  );
}
