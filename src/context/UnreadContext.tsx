import { createContext, useContext, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { Message } from "../services/channels";

interface ChannelMeta {
  type: "dm" | "guild";
  guildId?: string;
}

interface UnreadContextValue {
  unread: Record<string, number>;
  dmUnread: boolean;
  guildUnread: Set<string>;
  lockedChannels: Set<string>;
  markRead: (channelId: string) => void;
  setActiveChannel: (channelId: string | null) => void;
  registerChannel: (channelId: string, type: "dm" | "guild", guildId?: string) => void;
  setChannelLocked: (channelId: string, locked: boolean) => void;
}

const UnreadContext = createContext<UnreadContextValue>({
  unread: {},
  dmUnread: false,
  guildUnread: new Set(),
  lockedChannels: new Set(),
  markRead: () => {},
  setActiveChannel: () => {},
  registerChannel: () => {},
  setChannelLocked: () => {},
});

export function UnreadProvider({ children }: { children: React.ReactNode }) {
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [lockedChannels, setLockedChannels] = useState<Set<string>>(new Set());
  const activeChannelRef = useRef<string | null>(null);
  const channelMetaRef = useRef<Record<string, ChannelMeta>>({});

  useEffect(() => {
    const unlisten = listen<Message>("new-message", (event) => {
      const channelId = event.payload.channel;
      if (channelId === activeChannelRef.current) return;
      setUnread((prev) => ({ ...prev, [channelId]: (prev[channelId] ?? 0) + 1 }));
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  function markRead(channelId: string) {
    setUnread((prev) => {
      if (!prev[channelId]) return prev;
      const next = { ...prev };
      delete next[channelId];
      return next;
    });
  }

  function setActiveChannel(channelId: string | null) {
    activeChannelRef.current = channelId;
    if (channelId) markRead(channelId);
  }

  function registerChannel(channelId: string, type: "dm" | "guild", guildId?: string) {
    channelMetaRef.current[channelId] = { type, guildId };
  }

  function setChannelLocked(channelId: string, locked: boolean) {
    setLockedChannels((prev) => {
      const next = new Set(prev);
      if (locked) next.add(channelId);
      else next.delete(channelId);
      return next;
    });
  }

  const dmUnread = Object.keys(unread).some(
    (id) => channelMetaRef.current[id]?.type === "dm"
  );

  const guildUnread = new Set(
    Object.keys(unread)
      .map((id) => channelMetaRef.current[id])
      .filter((m): m is ChannelMeta & { guildId: string } => m?.type === "guild" && !!m.guildId)
      .map((m) => m.guildId)
  );

  return (
    <UnreadContext.Provider value={{ unread, dmUnread, guildUnread, lockedChannels, markRead, setActiveChannel, registerChannel, setChannelLocked }}>
      {children}
    </UnreadContext.Provider>
  );
}

export function useUnread() {
  return useContext(UnreadContext);
}
