import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  listGuildRoles,
  createGuildRole,
  updateGuildRole,
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
import { PERMISSION_CATEGORIES, parseApiError } from "../../services/permissions";
import { usePermissions } from "../../hooks/usePermissions";
import { useAuth } from "../../context/AuthContext";
import "../../styles/guild-settings.css";

type Tab = "overview" | "invitations" | "roles" | "members" | "danger";

interface Props {
  guild: Guild;
  onClose: () => void;
  onDeleted: () => void;
}

function OverviewTab({ guild, onClose, canManage }: { guild: Guild; onClose: () => void; canManage: boolean }) {
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
      setError(parseApiError(err));
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
          disabled={!canManage}
        />
        {error && <p className="modal-error">{error}</p>}
        {canManage && (
          <div className="modal-actions">
            <button type="button" className="modal-btn-secondary" onClick={onClose}>Annuler</button>
            <button type="submit" className="modal-btn-primary">
              {saved ? "Enregistré !" : "Enregistrer"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

function InvitationsTab({ guild, can }: { guild: Guild; can: (p: string) => boolean }) {
  const [invites, setInvites] = useState<GuildInvite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const canManage = can("manage_invites");

  useEffect(() => {
    if (!canManage) return;
    listGuildInvites(guild.id).then(setInvites).catch(console.error);
  }, [guild.id, canManage]);

  async function handleGenerate() {
    setError(null);
    try {
      const invite = await createGuildInvite(guild.id);
      setInvites((prev) => [...prev, invite]);
    } catch (err) {
      setError(parseApiError(err));
    }
  }

  async function handleRevoke(invite: GuildInvite) {
    await revokeGuildInvite(guild.id, invite.id);
    setInvites((prev) => prev.filter((i) => i.id !== invite.id));
  }

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">Invitations</h3>
      {can("create_invite") && (
        <button className="modal-btn-primary" onClick={handleGenerate} style={{ alignSelf: "flex-start" }}>
          Générer un lien
        </button>
      )}
      {error && <p className="modal-error">{error}</p>}
      <div className="invite-list">
        {invites.map((inv) => (
          <div key={inv.id} className="invite-code-box">
            <span className="invite-code">{inv.code}</span>
            <button
              className="invite-copy-btn"
              onClick={() => navigator.clipboard.writeText(inv.code)}
            >Copier</button>
            {canManage && (
              <button
                className="invite-revoke-btn"
                aria-label={`Révoquer ${inv.code}`}
                onClick={() => handleRevoke(inv)}
              >✕</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function RolePermissionEditor({
  guild,
  role,
  userPerms,
  onSaved,
}: {
  guild: Guild;
  role: Role;
  /** Permissions effectives de l'utilisateur courant — on ne peut pas accorder ce qu'on n'a pas. */
  userPerms: Set<string>;
  onSaved: (r: Role) => void;
}) {
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(role.color);
  const [perms, setPerms] = useState<Set<string>>(new Set(role.permissions));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Resynchronise le brouillon quand on change de rôle sélectionné
  useEffect(() => {
    setName(role.name);
    setColor(role.color);
    setPerms(new Set(role.permissions));
    setError(null);
    setSaved(false);
  }, [role.id]);

  function togglePerm(id: string) {
    setPerms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const updated = await updateGuildRole(guild.id, role.id, {
        name: name.trim() || role.name,
        color,
        permissions: [...perms],
      });
      onSaved(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(parseApiError(err));
    }
  }

  const isAdmin = perms.has("administrator");

  // Cocher une permission qu'on ne possède pas serait refusé par le serveur (anti-escalade)
  function isToggleDisabled(id: string): boolean {
    if (isAdmin && id !== "administrator") return true;
    return !perms.has(id) && !userPerms.has(id);
  }

  return (
    <form className="role-perm-editor" onSubmit={handleSave}>
      <div className="role-perm-identity">
        <input
          className="modal-input"
          aria-label="Nom du rôle sélectionné"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="color"
          className="role-color-input"
          aria-label="Couleur du rôle"
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />
      </div>
      {PERMISSION_CATEGORIES.map((cat) => (
        <div key={cat.label} className="perm-category">
          <div className="perm-category-title">{cat.label}</div>
          {cat.permissions.map((p) => (
            <label key={p.id} className="perm-row">
              <span className="perm-texts">
                <span className="perm-label">{p.label}</span>
                <span className="perm-description">{p.description}</span>
              </span>
              <input
                type="checkbox"
                className="perm-toggle"
                checked={perms.has(p.id) || (isAdmin && p.id !== "administrator")}
                disabled={isToggleDisabled(p.id)}
                title={!userPerms.has(p.id) && !perms.has(p.id) ? "Vous ne possédez pas cette permission" : undefined}
                onChange={() => togglePerm(p.id)}
              />
            </label>
          ))}
        </div>
      ))}
      {error && <p className="modal-error">{error}</p>}
      <div className="modal-actions">
        <button type="submit" className="modal-btn-primary">
          {saved ? "Enregistré !" : "Enregistrer le rôle"}
        </button>
      </div>
    </form>
  );
}

function RolesTab({ guild, userPerms }: { guild: Guild; userPerms: Set<string> }) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [roleName, setRoleName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listGuildRoles(guild.id).then(setRoles).catch(console.error);
  }, [guild.id]);

  // Synchro temps réel — modifications faites par d'autres membres
  useEffect(() => {
    const u1 = listen<Role>("role-created", (e) => {
      if (e.payload.guild !== guild.id) return;
      setRoles((prev) => prev.some((r) => r.id === e.payload.id) ? prev : [...prev, e.payload]);
    });
    const u2 = listen<Role>("role-modified", (e) => {
      if (e.payload.guild !== guild.id) return;
      setRoles((prev) => prev.map((r) => (r.id === e.payload.id ? e.payload : r)));
    });
    const u3 = listen<{ guild_id: string; role_id: string }>("role-deleted", (e) => {
      if (e.payload.guild_id !== guild.id) return;
      setRoles((prev) => prev.filter((r) => r.id !== e.payload.role_id));
      setSelectedId((sel) => (sel === e.payload.role_id ? null : sel));
    });
    return () => { [u1, u2, u3].forEach((p) => p.then((fn) => fn())); };
  }, [guild.id]);

  const sorted = [...roles].sort((a, b) => a.position - b.position);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      // Créé en queue de hiérarchie : un nouveau rôle ne domine personne
      const position = roles.length ? Math.max(...roles.map((r) => r.position)) + 1 : 0;
      const role = await createGuildRole(guild.id, roleName.trim(), "#99AAB5", [], position);
      // L'écho WebSocket role-created peut arriver avant la réponse HTTP — dédupliquer
      setRoles((prev) => prev.some((r) => r.id === role.id) ? prev : [...prev, role]);
      setRoleName("");
      setSelectedId(role.id);
    } catch (err) {
      setError(parseApiError(err));
    }
  }

  async function handleDelete(role: Role) {
    setError(null);
    try {
      await deleteGuildRole(guild.id, role.id);
      setRoles((prev) => prev.filter((r) => r.id !== role.id));
      if (selectedId === role.id) setSelectedId(null);
    } catch (err) {
      setError(parseApiError(err));
    }
  }

  /** Échange la position du rôle avec son voisin (delta -1 = monter, +1 = descendre). */
  async function handleMove(role: Role, delta: -1 | 1) {
    const idx = sorted.findIndex((r) => r.id === role.id);
    const neighbor = sorted[idx + delta];
    if (!neighbor) return;
    setError(null);
    try {
      const [a, b] = await Promise.all([
        updateGuildRole(guild.id, role.id, { position: neighbor.position }),
        updateGuildRole(guild.id, neighbor.id, { position: role.position }),
      ]);
      setRoles((prev) => prev.map((r) => (r.id === a.id ? a : r.id === b.id ? b : r)));
    } catch (err) {
      setError(parseApiError(err));
    }
  }

  const selected = roles.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">Rôles</h3>
      <div className="roles-editor">
        <div className="roles-editor-list">
          <div className="roles-list">
            {sorted.map((role, idx) => (
              <div key={role.id} className={`role-row${selectedId === role.id ? " role-row--selected" : ""}`}>
                <span className="role-dot" style={{ background: role.color }} />
                <button
                  type="button"
                  className="role-name"
                  onClick={() => setSelectedId(role.id)}
                >{role.name}</button>
                <button
                  type="button"
                  className="role-move-btn"
                  aria-label={`Monter ${role.name}`}
                  disabled={idx === 0}
                  onClick={() => handleMove(role, -1)}
                >▲</button>
                <button
                  type="button"
                  className="role-move-btn"
                  aria-label={`Descendre ${role.name}`}
                  disabled={idx === sorted.length - 1}
                  onClick={() => handleMove(role, 1)}
                >▼</button>
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
        {selected ? (
          <RolePermissionEditor
            guild={guild}
            role={selected}
            userPerms={userPerms}
            onSaved={(updated) =>
              setRoles((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
            }
          />
        ) : (
          <p className="settings-description roles-editor-placeholder">
            Sélectionnez un rôle pour configurer ses permissions.
          </p>
        )}
      </div>
    </div>
  );
}

function MembersTab({ guild, can, currentUserId }: { guild: Guild; can: (p: string) => boolean; currentUserId: string | null }) {
  const [members, setMembers] = useState<GuildMember[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState<string | null>(null);
  const canManageRoles = can("manage_roles");

  useEffect(() => {
    listGuildMembers(guild.id).then(setMembers).catch(console.error);
    listGuildRoles(guild.id).then(setRoles).catch(console.error);
  }, [guild.id]);

  async function handleKick(member: GuildMember) {
    setError(null);
    try {
      await kickGuildMember(guild.id, member.user.id);
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
    } catch (err) {
      setError(parseApiError(err));
    }
  }

  async function handleToggleRole(member: GuildMember, role: Role) {
    const hasRole = member.roles.includes(role.id);
    setError(null);
    try {
      if (hasRole) {
        await removeGuildRole(guild.id, member.user.id, role.id);
      } else {
        await assignGuildRole(guild.id, member.user.id, role.id);
      }
    } catch (err) {
      setError(parseApiError(err));
      return;
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
      {error && <p className="modal-error">{error}</p>}
      <div className="members-list">
        {members.map((m) => (
          <div key={m.id} className="member-settings-row">
            <div className="member-settings-header">
              <div className="avatar avatar--sm">
                {(m.user.display_name || m.user.name)[0].toUpperCase()}
              </div>
              <span className="member-name">{m.user.display_name || m.user.name}</span>
              {can("kick_members") && m.user.id !== guild.owner && m.user.id !== currentUserId && (
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
                    disabled={!canManageRoles}
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
  const { can, isOwner, permissions } = usePermissions(guild);
  const { user } = useAuth();

  const visibleTabs = (Object.keys(TAB_LABELS) as Tab[]).filter((t) => {
    if (t === "invitations") return can("create_invite") || can("manage_invites");
    if (t === "roles") return can("manage_roles");
    if (t === "danger") return isOwner;
    return true;
  });

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-sidebar">
          <div className="settings-guild-name">{guild.name}</div>
          <nav className="settings-nav">
            {visibleTabs.map((t) => (
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
          {tab === "overview"     && <OverviewTab guild={guild} onClose={onClose} canManage={can("manage_guild")} />}
          {tab === "invitations"  && <InvitationsTab guild={guild} can={can} />}
          {tab === "roles"        && <RolesTab guild={guild} userPerms={permissions} />}
          {tab === "members"      && <MembersTab guild={guild} can={can} currentUserId={user?.id ?? null} />}
          {tab === "danger"       && <DangerTab guild={guild} onDeleted={onDeleted} onClose={onClose} />}
        </div>
      </div>
    </div>
  );
}
