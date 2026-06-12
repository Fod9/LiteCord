import { useEffect, useState } from "react";
import {
  listGuildRoles,
  setChannelPermissions,
  type GuildChannel,
  type PermissionOverwrite,
  type Role,
} from "../../services/guilds";
import { PERMISSION_CATEGORIES, parseApiError } from "../../services/permissions";
import "../../styles/guild-settings.css";

type OverwriteState = Record<string, "allow" | "deny" | "inherit">;

interface Props {
  channel: GuildChannel;
  guildId: string;
  onClose: () => void;
  onSaved: (ch: GuildChannel) => void;
}

function targetLabel(targetId: string, roles: Role[]): string {
  const role = roles.find((r) => r.id === targetId);
  return role ? `@${role.name}` : targetId;
}

function overwriteToState(ow: PermissionOverwrite): OverwriteState {
  const state: OverwriteState = {};
  for (const p of ow.allow) state[p] = "allow";
  for (const p of ow.deny) state[p] = "deny";
  return state;
}

function stateToOverwrite(targetId: string, state: OverwriteState): PermissionOverwrite {
  const allow: string[] = [];
  const deny: string[] = [];
  for (const [perm, val] of Object.entries(state)) {
    if (val === "allow") allow.push(perm);
    else if (val === "deny") deny.push(perm);
  }
  return { target: targetId, allow, deny };
}

function TargetEditor({
  targetId,
  roles,
  initial,
  onChange,
}: {
  targetId: string;
  roles: Role[];
  initial: OverwriteState;
  onChange: (state: OverwriteState) => void;
}) {
  const [state, setState] = useState<OverwriteState>(initial);

  function toggle(permId: string, current: "allow" | "deny" | "inherit"): void {
    const next: "allow" | "deny" | "inherit" =
      current === "inherit" ? "allow" :
      current === "allow" ? "deny" : "inherit";
    const updated = { ...state, [permId]: next };
    setState(updated);
    onChange(updated);
  }

  const label = targetLabel(targetId, roles);

  return (
    <div className="settings-section" style={{ marginTop: 12 }}>
      <h4 className="settings-section-title" style={{ fontSize: "var(--text-sm)", marginBottom: 8 }}>
        {label}
      </h4>
      {PERMISSION_CATEGORIES.map((cat) => (
        <div key={cat.label} className="perm-category">
          <div className="perm-category-title">{cat.label}</div>
          {cat.permissions.map((p) => {
            const cur = state[p.id] ?? "inherit";
            return (
              <div key={p.id} className="perm-row" style={{ cursor: "pointer" }} onClick={() => toggle(p.id, cur)}>
                <span className="perm-texts">
                  <span className="perm-label">{p.label}</span>
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    width: 56,
                    textAlign: "center",
                    color:
                      cur === "allow" ? "#3ba55d" :
                      cur === "deny" ? "#ed4245" :
                      "var(--text-muted)",
                  }}
                >
                  {cur === "allow" ? "✓ Allow" : cur === "deny" ? "✕ Deny" : "— Hérite"}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function ChannelPermissionsModal({ channel, guildId, onClose, onSaved }: Props) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [overwrites, setOverwrites] = useState<Record<string, OverwriteState>>(() => {
    const init: Record<string, OverwriteState> = {};
    for (const ow of channel.permission_overwrites) {
      init[ow.target] = overwriteToState(ow);
    }
    return init;
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listGuildRoles(guildId).then(setRoles).catch(console.error);
  }, [guildId]);

  function addRole(roleId: string): void {
    if (overwrites[roleId]) return;
    setOverwrites((prev) => ({ ...prev, [roleId]: {} }));
    setSelectedTarget(roleId);
  }

  function removeTarget(targetId: string): void {
    setOverwrites((prev) => {
      const next = { ...prev };
      delete next[targetId];
      return next;
    });
    if (selectedTarget === targetId) setSelectedTarget(null);
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const owList = Object.entries(overwrites).map(([targetId, state]) =>
        stateToOverwrite(targetId, state)
      );
      const updated = await setChannelPermissions(guildId, channel.id, owList);
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(parseApiError(err));
    } finally {
      setSaving(false);
    }
  }

  const unaddedRoles = roles.filter((r) => !overwrites[r.id]);

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 700 }}>
        <div className="settings-sidebar" style={{ minWidth: 160 }}>
          <div className="settings-guild-name" style={{ fontSize: "var(--text-xs)" }}>
            #{channel.name}
          </div>
          <div style={{ padding: "8px 0", fontSize: "var(--text-xs)", color: "var(--text-muted)", paddingLeft: 12 }}>
            Overrides actifs
          </div>
          {Object.keys(overwrites).map((targetId) => (
            <div key={targetId} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button
                className={`settings-nav-item${selectedTarget === targetId ? " active" : ""}`}
                style={{ flex: 1, fontSize: "var(--text-xs)" }}
                onClick={() => setSelectedTarget(targetId)}
              >
                {targetLabel(targetId, roles)}
              </button>
              <button
                style={{ background: "none", color: "var(--text-muted)", cursor: "pointer", paddingRight: 8, fontSize: 11 }}
                onClick={() => removeTarget(targetId)}
                title="Supprimer l'override"
              >✕</button>
            </div>
          ))}
          {unaddedRoles.length > 0 && (
            <>
              <div style={{ padding: "8px 12px 4px", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                Ajouter un rôle
              </div>
              {unaddedRoles.map((r) => (
                <button
                  key={r.id}
                  className="settings-nav-item"
                  style={{ fontSize: "var(--text-xs)" }}
                  onClick={() => addRole(r.id)}
                >
                  <span className="role-dot" style={{ background: r.color, width: 8, height: 8, borderRadius: "50%", display: "inline-block", marginRight: 4 }} />
                  {r.name}
                </button>
              ))}
            </>
          )}
        </div>

        <div className="settings-content">
          <div className="settings-header">
            <h2 className="settings-title">Permissions — #{channel.name}</h2>
            <button className="settings-close-btn" onClick={onClose}>✕</button>
          </div>

          {selectedTarget ? (
            <TargetEditor
              targetId={selectedTarget}
              roles={roles}
              initial={overwrites[selectedTarget] ?? {}}
              onChange={(state) =>
                setOverwrites((prev) => ({ ...prev, [selectedTarget]: state }))
              }
            />
          ) : (
            <p className="settings-description">
              Sélectionnez un rôle pour configurer ses permissions sur ce channel.
              <br />
              <small>Les overrides remplacent les permissions globales du serveur pour ce channel uniquement.</small>
            </p>
          )}

          {error && <p className="modal-error">{error}</p>}

          <div className="modal-actions" style={{ marginTop: 16 }}>
            <button className="modal-btn-secondary" onClick={onClose}>Annuler</button>
            <button className="modal-btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
