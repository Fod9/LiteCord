import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { listen } from "@tauri-apps/api/event";
import { listGuilds, createGuild, joinGuild, type Guild } from "../../services/guilds";
import { useGuild } from "../../context/GuildContext";
import { useUnread } from "../../context/UnreadContext";
import { useAuth } from "../../context/AuthContext";
import "../../styles/server-sidebar.css";
import "../../styles/guild-modal.css";

function guildLabel(guild: Guild): string {
  if (guild.icon) return guild.icon;
  return guild.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

type ModalView = "choice" | "create" | "join";

function GuildModal({
  onClose,
  onGuildAdded,
}: {
  onClose: () => void;
  onGuildAdded: (guild: Guild) => void;
}) {
  const [view, setView] = useState<ModalView>("choice");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const guild = await createGuild(name.trim(), "");
      onGuildAdded(guild);
      onClose();
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const guild = await joinGuild(code.trim());
      onGuildAdded(guild);
      onClose();
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" role="dialog" onClick={(e) => e.stopPropagation()}>
        {view === "choice" && (
          <>
            <h2 className="modal-title">Ajouter un serveur</h2>
            <div className="modal-choices">
              <button className="modal-choice-btn" onClick={() => setView("create")}>
                Créer un serveur
              </button>
              <button className="modal-choice-btn" onClick={() => setView("join")}>
                Rejoindre un serveur
              </button>
            </div>
          </>
        )}

        {view === "create" && (
          <>
            <h2 className="modal-title">Créer un serveur</h2>
            <form onSubmit={handleCreate} className="modal-form">
              <input
                className="modal-input"
                placeholder="Nom du serveur"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                required
              />
              {error && <p className="modal-error">{error}</p>}
              <div className="modal-actions">
                <button type="button" className="modal-btn-secondary" onClick={() => setView("choice")}>
                  Retour
                </button>
                <button type="submit" className="modal-btn-primary">
                  Créer le serveur
                </button>
              </div>
            </form>
          </>
        )}

        {view === "join" && (
          <>
            <h2 className="modal-title">Rejoindre un serveur</h2>
            <form onSubmit={handleJoin} className="modal-form">
              <input
                className="modal-input"
                placeholder="Code d'invitation"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
                required
              />
              {error && <p className="modal-error">{error}</p>}
              <div className="modal-actions">
                <button type="button" className="modal-btn-secondary" onClick={() => setView("choice")}>
                  Retour
                </button>
                <button type="submit" className="modal-btn-primary">
                  Rejoindre le serveur
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default function ServerSideBar() {
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const { selectedGuild, selectGuild, lastVisited } = useGuild();
  const { dmUnread, guildUnread } = useUnread();
  const { user } = useAuth();
  const navigate = useNavigate();

  function handleGuildClick(guild: Guild) {
    selectGuild(guild);
    const last = lastVisited[guild.id];
    if (last) {
      navigate(last.path, { state: { channel: last.channel } });
    }
  }

  useEffect(() => {
    listGuilds().then(setGuilds).catch(console.error);

    const u1 = listen<string>("guild-deleted", (e) => {
      setGuilds((prev) => prev.filter((g) => g.id !== e.payload));
      if (selectedGuild?.id === e.payload) {
        selectGuild(null);
        navigate("/");
      }
    });

    const u2 = listen<{ guild_id: string; user_id: string }>("guild-member-left", (e) => {
      if (e.payload.user_id !== user?.id) return;
      setGuilds((prev) => prev.filter((g) => g.id !== e.payload.guild_id));
      if (selectedGuild?.id === e.payload.guild_id) {
        selectGuild(null);
        navigate("/");
      }
    });

    return () => {
      u1.then((fn) => fn());
      u2.then((fn) => fn());
    };
  }, [user?.id, selectedGuild?.id]);

  return (
    <div className="rail">
      <button
        className={`rail-item rail-home${!selectedGuild ? " active" : ""}`}
        aria-label="Messages privés"
        onClick={() => selectGuild(null)}
      >
        <span style={{ fontSize: 18 }}>✦</span>
        {dmUnread && <span className="rail-badge" />}
      </button>
      <div className="rail-sep" />

      <div className="rail-guilds">
        {guilds.map((guild) => (
          <button
            key={guild.id}
            className={`rail-item${selectedGuild?.id === guild.id ? " active" : ""}`}
            aria-label={guild.name}
            data-tooltip={guild.name}
            onClick={() => handleGuildClick(guild)}
          >
            {guildLabel(guild)}
            {guildUnread.has(guild.id) && <span className="rail-badge" />}
          </button>
        ))}
      </div>

      <button
        className="rail-add rail-item"
        aria-label="Ajouter un serveur"
        data-tooltip="Ajouter un serveur"
        onClick={() => setModalOpen(true)}
      >
        +
      </button>

      {modalOpen && (
        <GuildModal
          onClose={() => setModalOpen(false)}
          onGuildAdded={(guild) => setGuilds((prev) => [...prev, guild])}
        />
      )}
    </div>
  );
}
