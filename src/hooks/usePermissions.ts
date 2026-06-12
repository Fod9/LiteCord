import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useAuth } from "../context/AuthContext";
import { getMyGuildMember, type Guild } from "../services/guilds";

interface PermissionsState {
  /** Permissions effectives de l'utilisateur courant, calculées par le serveur. */
  permissions: Set<string>;
  can: (permission: string) => boolean;
  isOwner: boolean;
  refresh: () => void;
}

/** Événements WS qui peuvent changer les permissions effectives. */
const ROLE_EVENTS = ["role-updated", "role-modified", "role-deleted"] as const;

export function usePermissions(guild: Guild | null): PermissionsState {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [reloadKey, setReloadKey] = useState(0);

  const isOwner = !!guild && !!user && guild.owner === user.id;

  useEffect(() => {
    if (!guild || !user) {
      setPermissions(new Set());
      return;
    }

    let cancelled = false;
    getMyGuildMember(guild.id)
      .then(({ permissions }) => {
        if (!cancelled) setPermissions(new Set(permissions));
      })
      .catch(console.error);

    return () => { cancelled = true; };
  }, [guild?.id, user?.id, reloadKey]);

  useEffect(() => {
    if (!guild) return;
    // role-updated/role-deleted portent guild_id ; role-modified porte le Role complet (champ guild)
    const unlistens = ROLE_EVENTS.map((event) =>
      listen<{ guild_id?: string; guild?: string }>(event, (e) => {
        if ((e.payload.guild_id ?? e.payload.guild) === guild.id) setReloadKey((k) => k + 1);
      })
    );
    return () => { unlistens.forEach((p) => p.then((fn) => fn())); };
  }, [guild?.id]);

  const can = useCallback((permission: string) => permissions.has(permission), [permissions]);
  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  return { permissions, can, isOwner, refresh };
}
