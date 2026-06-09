import { createContext, useContext, useState } from "react";
import type { Guild, GuildChannel } from "../services/guilds";

interface LastVisited {
  channel: GuildChannel;
  path: string;
}

interface GuildState {
  selectedGuild: Guild | null;
  selectGuild: (guild: Guild | null) => void;
  lastVisited: Record<string, LastVisited>;
  setLastVisited: (guildId: string, channel: GuildChannel, path: string) => void;
}

const GuildContext = createContext<GuildState | null>(null);

export function GuildProvider({ children }: { children: React.ReactNode }) {
  const [selectedGuild, setSelectedGuild] = useState<Guild | null>(null);
  const [lastVisited, setLastVisitedState] = useState<Record<string, LastVisited>>({});

  function setLastVisited(guildId: string, channel: GuildChannel, path: string) {
    setLastVisitedState((prev) => ({ ...prev, [guildId]: { channel, path } }));
  }

  return (
    <GuildContext.Provider value={{ selectedGuild, selectGuild: setSelectedGuild, lastVisited, setLastVisited }}>
      {children}
    </GuildContext.Provider>
  );
}

export function useGuild(): GuildState {
  const ctx = useContext(GuildContext);
  if (!ctx) throw new Error("useGuild must be used within GuildProvider");
  return ctx;
}
