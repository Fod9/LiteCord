import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useResize } from "../../hooks/useResize";
import { useNavigate, useParams } from "react-router";
import UserBar from "./UserBar";
import { useGuild } from "../../context/GuildContext";
import {
  getGuildChannels,
  createGuildChannel,
  deleteGuildChannel,
  leaveGuild,
  type GuildChannel,
} from "../../services/guilds";
import GuildSettingsModal from "./GuildSettingsModal";
import ChannelPermissionsModal from "./ChannelPermissionsModal";
import VoiceHUD from "../voice/VoiceHUD";
import { useUnread } from "../../context/UnreadContext";
import { usePermissions } from "../../hooks/usePermissions";
import { useVoice } from "../../context/VoiceContext";
import { parseApiError } from "../../services/permissions";
import "../../styles/channels-sidebar.css";
import "../../styles/voice.css";


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
      setError(parseApiError(err));
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
                {t === "Text" ? "# Texte" : <img src="src/assets/icones/speaker.png" alt="Voice" className="voice-icon" />} Voix
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
  const { unread, registerChannel } = useUnread();
  const { width, onMouseDown } = useResize(220, 140, 400, "right", "sidebar-channels-width");
  const navigate = useNavigate();
  const { channelId: activeChannelId } = useParams<{ channelId: string }>();
  const [channels, setChannels] = useState<GuildChannel[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [permsChannel, setPermsChannel] = useState<GuildChannel | null>(null);

  const { can, isOwner } = usePermissions(selectedGuild);
  const { voiceStates, currentChannelId: voiceChannelId, join: joinVoice } = useVoice();

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

    const u3 = listen<GuildChannel>("channel-permissions-updated", (e) => {
      if (e.payload.guild !== guildId) return;
      setChannels((prev) => prev.map((c) => c.id === e.payload.id ? e.payload : c));
    });

    return () => {
      u1.then((fn) => fn());
      u2.then((fn) => fn());
      u3.then((fn) => fn());
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
    if (!selectedGuild) return;
    if (ch.channel_type === "Text") {
      navigate(`/guilds/${selectedGuild.id}/channels/${ch.id}`, {
        state: { channel: ch, guild: selectedGuild },
      });
    } else if (ch.channel_type === "Voice") {
      joinVoice(selectedGuild.id, ch.id).catch(console.error);
      navigate(`/guilds/${selectedGuild.id}/voice/${ch.id}`, {
        state: { channel: ch, guild: selectedGuild },
      });
    }
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
          {can("manage_channels") && (
            <button
              className="channels-icon-btn"
              aria-label="Créer un channel"
              onClick={() => setShowCreate(true)}
            >+</button>
          )}
          <button
            className="channels-icon-btn"
            aria-label="Paramètres du serveur"
            onClick={() => setShowSettings(true)}
          >⚙</button>
        </div>
      </div>

      <div className="channels-list">
        {Array.from(grouped.entries()).map(([category, chs]) => (
          <div key={category ?? "__none__"} className="channel-group">
            {category && <div className="channel-category">{category}</div>}
            {chs.map((ch) => {
              const voiceMembers = ch.channel_type === "Voice" ? (voiceStates[ch.id] ?? []) : [];
              const isInThisVoice = voiceChannelId === ch.id;
              return (
                <div key={ch.id} className="channel-group">
                  <div className="channel-row">
                    <button
                      className={`channel-item${activeChannelId === ch.id || isInThisVoice ? " active" : ""}${unread[ch.id] ? " channel-item--unread" : ""}`}
                      onClick={() => handleChannelClick(ch)}
                    >
                      <span className="channel-prefix">
                        {ch.channel_type === "Voice" ? <img src="src/assets/icones/speaker.png" alt="Voice" className="voice-icon"/> : "#"}
                      </span>
                      <span className="channel-item-name">{ch.name}</span>
                      {unread[ch.id] > 0 && ch.channel_type === "Text" && (
                        <span className="channel-unread-dot" />
                      )}
                      {ch.channel_type === "Voice" && voiceMembers.length > 0 && (
                        <span className="channel-voice-count">{voiceMembers.length}</span>
                      )}
                    </button>
                    {can("manage_channels") && (
                      <button
                        className="channel-perms-btn"
                        aria-label={`Permissions de ${ch.name}`}
                        title="Modifier les permissions"
                        onClick={(e) => { e.stopPropagation(); setPermsChannel(ch); }}
                      >🔒</button>
                    )}
                    {can("manage_channels") && (
                      <button
                        className="channel-delete-btn"
                        aria-label={`Supprimer ${ch.name}`}
                        onClick={() => handleDelete(ch)}
                      >✕</button>
                    )}
                  </div>
                  {ch.channel_type === "Voice" && voiceMembers.length > 0 && (
                    <div className="voice-members">
                      {voiceMembers.map((u) => {
                        const initials = (u.display_name || u.name)
                          .replace(/[^A-Za-z0-9À-ÿ]/g, " ").trim()
                          .split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();
                        return (
                          <div key={u.id} className="voice-member">
                            <div className="voice-member-avatar">{initials}</div>
                            <span>{u.display_name || u.name}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <VoiceHUD channelName={channels.find((c) => c.id === voiceChannelId)?.name} />
      <UserBar />

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

      {permsChannel && (
        <ChannelPermissionsModal
          channel={permsChannel}
          guildId={selectedGuild.id}
          onClose={() => setPermsChannel(null)}
          onSaved={(updated) => {
            setChannels((prev) => prev.map((c) => c.id === updated.id ? updated : c));
          }}
        />
      )}
    </div>
  );
}
