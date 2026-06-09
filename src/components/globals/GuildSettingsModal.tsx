import { useEffect, useState } from "react";
import {
  listGuildRoles,
  createGuildRole,
  deleteGuildRole,
  createGuildInvite,
  listGuildInvites,
  revokeGuildInvite,
  listGuildMembers,
  kickGuildMember,
  assignGuildRole,
  removeGuildRole,
  updateGuild,
  type Role,
  type Guild,
  type GuildInvite,
  type GuildMember,
} from "../../services/guilds";
import "../../styles/guild-settings.css";

type Tab = "overview" | "invitations" | "roles" | "members" | "danger";

interface Props {
  guild: Guild;
  onClose: () => void;
  onDeleted: () => void;
}

function OverviewTab({ guild, onClose }: { guild: Guild; onClose: () => void }) {
  const [name, setName] = useState(guild.name);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await updateGuild(guild.id, name.trim() || null, null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">Vue d'ensemble</h3>
      <form onSubmit={handleSave} className="modal-form">
        <label className="settings-label">Nom du serveur</label>
        <input
          className="modal-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {error && <p className="modal-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="modal-btn-secondary" onClick={onClose}>Annuler</button>
          <button type="submit" className="modal-btn-primary">
            {saved ? "Enregistré !" : "Enregistrer"}
          </button>
        </div>
      </form>
    </div>
  );
}

function InvitationsTab({ guild }: { guild: Guild }) {
  const [invites, setInvites] = useState<GuildInvite[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listGuildInvites(guild.id).then(setInvites).catch(console.error);
  }, [guild.id]);

  async function handleGenerate() {
    setError(null);
    try {
      const invite = await createGuildInvite(guild.id);
      setInvites((prev) => [...prev, invite]);
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleRevoke(invite: GuildInvite) {
    await revokeGuildInvite(guild.id, invite.id);
    setInvites((prev) => prev.filter((i) => i.id !== invite.id));
  }

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">Invitations</h3>
      <button className="modal-btn-primary" onClick={handleGenerate} style={{ alignSelf: "flex-start" }}>
        Générer un lien
      </button>
      {error && <p className="modal-error">{error}</p>}
      <div className="invite-list">
        {invites.map((inv) => (
          <div key={inv.id} className="invite-code-box">
            <span className="invite-code">{inv.code}</span>
            <button
              className="invite-copy-btn"
              onClick={() => navigator.clipboard.writeText(inv.code)}
            >Copier</button>
            <button
              className="invite-revoke-btn"
              aria-label={`Révoquer ${inv.code}`}
              onClick={() => handleRevoke(inv)}
            >✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function RolesTab({ guild }: { guild: Guild }) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [roleName, setRoleName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listGuildRoles(guild.id).then(setRoles).catch(console.error);
  }, [guild.id]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const role = await createGuildRole(guild.id, roleName.trim(), "#99AAB5");
      setRoles((prev) => [...prev, role]);
      setRoleName("");
    } catch (err) {
      setError(String(err));
    }
  }

  async function handleDelete(role: Role) {
    await deleteGuildRole(guild.id, role.id);
    setRoles((prev) => prev.filter((r) => r.id !== role.id));
  }

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">Rôles</h3>
      <div className="roles-list">
        {roles.map((role) => (
          <div key={role.id} className="role-row">
            <span className="role-dot" style={{ background: role.color }} />
            <span className="role-name">{role.name}</span>
            <button
              className="role-delete-btn"
              aria-label={`Supprimer ${role.name}`}
              onClick={() => handleDelete(role)}
            >✕</button>
          </div>
        ))}
      </div>
      <form onSubmit={handleCreate} className="role-create-form">
        <input
          className="modal-input"
          placeholder="Nom du rôle"
          value={roleName}
          onChange={(e) => setRoleName(e.target.value)}
          required
        />
        {error && <p className="modal-error">{error}</p>}
        <button type="submit" className="modal-btn-primary">Ajouter le rôle</button>
      </form>
    </div>
  );
}

function MembersTab({ guild }: { guild: Guild }) {
  const [members, setMembers] = useState<GuildMember[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);

  useEffect(() => {
    listGuildMembers(guild.id).then(setMembers).catch(console.error);
    listGuildRoles(guild.id).then(setRoles).catch(console.error);
  }, [guild.id]);

  async function handleKick(member: GuildMember) {
    await kickGuildMember(guild.id, member.user.id);
    setMembers((prev) => prev.filter((m) => m.id !== member.id));
  }

  async function handleToggleRole(member: GuildMember, role: Role) {
    const hasRole = member.roles.includes(role.id);
    if (hasRole) {
      await removeGuildRole(guild.id, member.user.id, role.id);
    } else {
      await assignGuildRole(guild.id, member.user.id, role.id);
    }
    setMembers((prev) =>
      prev.map((m) =>
        m.id !== member.id ? m : {
          ...m,
          roles: hasRole
            ? m.roles.filter((r) => r !== role.id)
            : [...m.roles, role.id],
        }
      )
    );
  }

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">Membres</h3>
      <div className="members-list">
        {members.map((m) => (
          <div key={m.id} className="member-settings-row">
            <div className="member-settings-header">
              <div className="avatar avatar--sm">
                {(m.user.display_name || m.user.name)[0].toUpperCase()}
              </div>
              <span className="member-name">{m.user.display_name || m.user.name}</span>
              {m.user.id !== guild.owner && (
                <button
                  className="member-kick-btn"
                  aria-label={`Expulser ${m.user.display_name || m.user.name}`}
                  onClick={() => handleKick(m)}
                >Expulser</button>
              )}
            </div>
            {roles.length > 0 && (
              <div className="member-roles">
                {roles.map((role) => (
                  <button
                    key={role.id}
                    className={`role-tag${m.roles.includes(role.id) ? " role-tag--active" : ""}`}
                    style={m.roles.includes(role.id) ? { borderColor: role.color, color: role.color } : {}}
                    onClick={() => handleToggleRole(m, role)}
                  >
                    {role.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DangerTab({ guild, onDeleted, onClose }: { guild: Guild; onDeleted: () => void; onClose: () => void }) {
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setError(null);
    try {
      const { deleteGuild } = await import("../../services/guilds");
      await deleteGuild(guild.id);
      onDeleted();
      onClose();
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div className="settings-section">
      <h3 className="settings-section-title settings-danger-title">Zone de danger</h3>
      <p className="settings-description">
        La suppression du serveur est irréversible. Tous les channels et messages seront perdus.
      </p>
      {error && <p className="modal-error">{error}</p>}
      <button className="settings-danger-btn" onClick={handleDelete}>
        Supprimer le serveur
      </button>
    </div>
  );
}

const TAB_LABELS: Record<Tab, string> = {
  overview: "Vue d'ensemble",
  invitations: "Invitations",
  roles: "Rôles",
  members: "Membres",
  danger: "Danger",
};

export default function GuildSettingsModal({ guild, onClose, onDeleted }: Props) {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-sidebar">
          <div className="settings-guild-name">{guild.name}</div>
          <nav className="settings-nav">
            {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
              <button
                key={t}
                role="tab"
                className={`settings-nav-item${tab === t ? " active" : ""}${t === "danger" ? " danger" : ""}`}
                aria-selected={tab === t}
                onClick={() => setTab(t)}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </nav>
        </div>
        <div className="settings-content">
          <div className="settings-header">
            <h2 className="settings-title">{TAB_LABELS[tab]}</h2>
            <button className="settings-close-btn" onClick={onClose}>✕</button>
          </div>
          {tab === "overview"     && <OverviewTab guild={guild} onClose={onClose} />}
          {tab === "invitations"  && <InvitationsTab guild={guild} />}
          {tab === "roles"        && <RolesTab guild={guild} />}
          {tab === "members"      && <MembersTab guild={guild} />}
          {tab === "danger"       && <DangerTab guild={guild} onDeleted={onDeleted} onClose={onClose} />}
        </div>
      </div>
    </div>
  );
}
