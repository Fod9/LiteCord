import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useParams, useLocation } from "react-router";
import { listen } from "@tauri-apps/api/event";
import { Send, Paperclip, X } from "lucide-react";
import { AttachmentView } from "../components/globals/AttachmentView";
import { getChannelMessages, uploadAttachment, type Message, type Attachment } from "../services/channels";
import { listGuildMembers, listGuildRoles, getGuildChannels, type GuildMember, type GuildChannel, type Role } from "../services/guilds";
import { useResize } from "../hooks/useResize";
import { useChatInput } from "../hooks/useChatInput";
import { sendWsMessage } from "../services/ws";
import { useAuth } from "../context/AuthContext";
import { useGuild } from "../context/GuildContext";
import { useUnread } from "../context/UnreadContext";
import "../styles/dm.css";
import "../styles/member-list.css";


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
  const channelFromState = state?.channel as GuildChannel | undefined;
  const [resolvedChannel, setResolvedChannel] = useState<GuildChannel | undefined>(channelFromState);
  const channel = resolvedChannel;
  const { user } = useAuth();

  // When state is absent (page refresh, direct URL), fetch channels to resolve the name
  useEffect(() => {
    if (channelFromState) { setResolvedChannel(channelFromState); return; }
    if (!guildId || !channelId) return;
    getGuildChannels(guildId)
      .then((chs) => setResolvedChannel(chs.find((c) => c.id === channelId)))
      .catch(console.error);
  }, [guildId, channelId, channelFromState]);
  const { setLastVisited } = useGuild();
  const { setActiveChannel } = useUnread();
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<{ name: string; path: string; contentType: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prependScrollRef = useRef<number | null>(null);
  const autoScrollRef = useRef(true);

  async function doSend(content: string) {
    if (!channelId) return;
    let attachments: Attachment[] | undefined;
    if (pendingFiles.length > 0) {
      setUploading(true);
      try {
        attachments = await Promise.all(
          pendingFiles.map((f) => uploadAttachment(f.name, f.contentType, f.path)),
        );
      } finally {
        setUploading(false);
      }
      setPendingFiles([]);
    }
    const err = await sendWsMessage(channelId, content, attachments).catch((e) => e);
    if (err) {
      setSendError(String(err));
      setTimeout(() => setSendError(null), 5000);
    } else if (attachments) {
      autoScrollRef.current = true;
      getChannelMessages(channelId, { limit: 50 }).then((msgs) => {
        setMessages(msgs);
        setHasMore(msgs.length === 50);
      }).catch(console.error);
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

  async function handleAttach() {
    const result = await open({ multiple: true });
    if (!result) return;
    const paths = Array.isArray(result) ? result : [result];
    const files = paths.map((p) => {
      const name = p.split(/[/\\]/).pop() ?? p;
      const ext = name.split(".").pop()?.toLowerCase() ?? "";
      const contentType: Record<string, string> = {
        png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
        webp: "image/webp", mp4: "video/mp4", webm: "video/webm", mp3: "audio/mpeg",
        pdf: "application/pdf", txt: "text/plain", zip: "application/zip",
      };
      return { name, path: p, contentType: contentType[ext] ?? "application/octet-stream" };
    });
    setPendingFiles((prev) => [...prev, ...files]);
  }

  return (
    <div className="guild-channel-layout">
      <div className="dm-page">
        <div className="dm-topbar">
          <span className="channel-topbar-prefix">#</span>
          <span className="dm-topbar-title">{channelDisplayName}</span>
          <div className="dm-topbar-spacer" />
        </div>

        <div className="dm-scroll" ref={scrollRef}>
          {loadingMore && <div className="dm-load-more">Chargement…</div>}
          <div ref={contentRef}>
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
