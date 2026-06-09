import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useResize } from "../../hooks/useResize";
import { useNavigate, useParams } from "react-router";
import { useGuild } from "../../context/GuildContext";
import { useAuth } from "../../context/AuthContext";
import {
  getGuildChannels,
  createGuildChannel,
  deleteGuildChannel,
  leaveGuild,
  type GuildChannel,
} from "../../services/guilds";
import GuildSettingsModal from "./GuildSettingsModal";
import { useUnread } from "../../context/UnreadContext";
import "../../styles/channels-sidebar.css";

function groupByCategory(channels: GuildChannel[]): Map<string | null, GuildChannel[]> {
  const map = new Map<string | null, GuildChannel[]>();
  for (const ch of channels) {
    const key = ch.category ?? null;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(ch);
  }
  return map;
}

type ChannelType = "Text" | "Voice";

function CreateChannelModal({
  guildId,
  onClose,
  onCreated,
}: {
  guildId: string;
  onClose: () => void;
  onCreated: (ch: GuildChannel) => void;
}) {
  const [name, setName] = useState("");
  const [channelType, setChannelType] = useState<ChannelType>("Text");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const ch = await createGuildChannel(guildId, name.trim(), channelType, category.trim() || null);
      onCreated(ch);
      onClose();
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" role="dialog" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Créer un channel</h2>
        <form onSubmit={handleSubmit} className="modal-form">
          <input
            className="modal-input"
            placeholder="Nom du channel"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            required
          />
          <div className="channel-type-selector">
            {(["Text", "Voice"] as ChannelType[]).map((t) => (
              <button
                key={t}
                type="button"
                className={`channel-type-btn${channelType === t ? " selected" : ""}`}
                onClick={() => setChannelType(t)}
              >
                {t === "Text" ? "# Texte" : "🔊 Vocal"}
              </button>
            ))}
          </div>
          <input
            className="modal-input"
            placeholder="Catégorie (optionnel)"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
          {error && <p className="modal-error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="modal-btn-secondary" onClick={onClose}>Annuler</button>
            <button type="submit" className="modal-btn-primary">Créer le channel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ChannelsSideBar() {
  const { selectedGuild, selectGuild } = useGuild();
  const { user } = useAuth();
  const { unread, registerChannel } = useUnread();
  const { width, onMouseDown } = useResize(220, 140, 400, "right", "sidebar-channels-width");
  const navigate = useNavigate();
  const { channelId: activeChannelId } = useParams<{ channelId: string }>();
  const [channels, setChannels] = useState<GuildChannel[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const isOwner = !!selectedGuild && !!user && selectedGuild.owner === user.id;

  useEffect(() => {
    if (!selectedGuild) return;
    const guildId = selectedGuild.id;
    setChannels([]);
    getGuildChannels(guildId).then((chs) => {
      setChannels(chs);
      chs.forEach((c) => registerChannel(c.id, "guild", guildId));
    }).catch(console.error);

    const u1 = listen<GuildChannel>("channel-created", (e) => {
      if (e.payload.guild !== guildId) return;
      registerChannel(e.payload.id, "guild", guildId);
      setChannels((prev) =>
        prev.some((c) => c.id === e.payload.id) ? prev : [...prev, e.payload]
      );
    });

    const u2 = listen<{ guild_id: string; channel_id: string }>("channel-deleted", (e) => {
      if (e.payload.guild_id !== guildId) return;
      setChannels((prev) => prev.filter((c) => c.id !== e.payload.channel_id));
    });

    return () => {
      u1.then((fn) => fn());
      u2.then((fn) => fn());
    };
  }, [selectedGuild?.id]);

  async function handleDelete(ch: GuildChannel) {
    if (!selectedGuild) return;
    await deleteGuildChannel(selectedGuild.id, ch.id);
    setChannels((prev) => prev.filter((c) => c.id !== ch.id));
  }

  async function handleLeave() {
    if (!selectedGuild) return;
    await leaveGuild(selectedGuild.id);
    selectGuild(null);
    navigate("/");
  }

  function handleChannelClick(ch: GuildChannel) {
    if (!selectedGuild || ch.channel_type !== "Text") return;
    navigate(`/guilds/${selectedGuild.id}/channels/${ch.id}`, {
      state: { channel: ch, guild: selectedGuild },
    });
  }

  if (!selectedGuild) return null;

  const grouped = groupByCategory(channels);

  return (
    <div className="channels-sidebar" style={{ width, minWidth: width, maxWidth: width }}>
      <div className="resize-handle" onMouseDown={onMouseDown} />
      <div className="channels-header">
        <span className="channels-guild-name">{selectedGuild.name}</span>
        <div className="channels-header-actions">
          {!isOwner && (
            <button
              className="channels-icon-btn channels-icon-btn--leave"
              aria-label="Quitter le serveur"
              title="Quitter le serveur"
              onClick={handleLeave}
            >⬡</button>
          )}
          {isOwner && (
            <button
              className="channels-icon-btn"
              aria-label="Créer un channel"
              onClick={() => setShowCreate(true)}
            >+</button>
          )}
          {isOwner && (
            <button
              className="channels-icon-btn"
              aria-label="Paramètres du serveur"
              onClick={() => setShowSettings(true)}
            >⚙</button>
          )}
        </div>
      </div>

      <div className="channels-list">
        {Array.from(grouped.entries()).map(([category, chs]) => (
          <div key={category ?? "__none__"} className="channel-group">
            {category && <div className="channel-category">{category}</div>}
            {chs.map((ch) => (
              <div key={ch.id} className="channel-row">
                <button
                  className={`channel-item${activeChannelId === ch.id ? " active" : ""}${unread[ch.id] ? " channel-item--unread" : ""}`}
                  onClick={() => handleChannelClick(ch)}
                >
                  <span className="channel-prefix">
                    {ch.channel_type === "Voice" ? "🔊" : "#"}
                  </span>
                  <span className="channel-item-name">{ch.name}</span>
                  {unread[ch.id] > 0 && (
                    <span className="channel-unread-dot" />
                  )}
                </button>
                {isOwner && (
                  <button
                    className="channel-delete-btn"
                    aria-label={`Supprimer ${ch.name}`}
                    onClick={() => handleDelete(ch)}
                  >✕</button>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {showCreate && (
        <CreateChannelModal
          guildId={selectedGuild.id}
          onClose={() => setShowCreate(false)}
          onCreated={(ch) => setChannels((prev) => prev.some((c) => c.id === ch.id) ? prev : [...prev, ch])}
        />
      )}

      {showSettings && (
        <GuildSettingsModal
          guild={selectedGuild}
          onClose={() => setShowSettings(false)}
          onDeleted={() => selectGuild(null)}
        />
      )}
    </div>
  );
}
