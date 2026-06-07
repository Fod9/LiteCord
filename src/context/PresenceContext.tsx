import { createContext, useContext, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";

interface PresenceContextValue {
  isOnline: (userId: string) => boolean;
}

const PresenceContext = createContext<PresenceContextValue>({ isOnline: () => false });

export function usePresence() {
  return useContext(PresenceContext);
}

export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const unlisteners: Array<() => void> = [];

    listen<string[]>("friends-online-init", (e) => {
      setOnlineIds(new Set(e.payload));
    }).then((fn) => { if (cancelled) fn(); else unlisteners.push(fn); });

    listen<string>("user-online", (e) => {
      setOnlineIds((prev) => new Set([...prev, e.payload]));
    }).then((fn) => { if (cancelled) fn(); else unlisteners.push(fn); });

    listen<string>("user-offline", (e) => {
      setOnlineIds((prev) => {
        const next = new Set(prev);
        next.delete(e.payload);
        return next;
      });
    }).then((fn) => { if (cancelled) fn(); else unlisteners.push(fn); });

    return () => {
      cancelled = true;
      unlisteners.forEach((fn) => fn());
    };
  }, []);

  return (
    <PresenceContext.Provider value={{ isOnline: (id) => onlineIds.has(id) }}>
      {children}
    </PresenceContext.Provider>
  );
}
