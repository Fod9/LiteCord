import { createContext, useContext, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  initVoice,
  joinVoiceChannel as wsJoin,
  leaveVoiceChannel as wsLeave,
  connectToPeer,
  setMuted,
  startScreenShare,
  stopScreenShare,
  isScreenSharing,
  updateScreenQuality,
  type ScreenFps,
  type ScreenQuality,
  type VoiceUser,
  type VoiceStateUpdate,
} from "../services/voice";
import { useAuth } from "./AuthContext";

export type { ScreenFps, ScreenQuality };

interface VoiceContextValue {
  currentChannelId: string | null;
  currentGuildId: string | null;
  /** Map channelId → list of users in that channel */
  voiceStates: Record<string, VoiceUser[]>;
  isMuted: boolean;
  isSharing: boolean;
  screenQuality: ScreenQuality;
  screenFps: ScreenFps;
  /** Applicables à chaud pendant un partage en cours (pas de renégociation). */
  setScreenQuality: (q: ScreenQuality) => void;
  setScreenFps: (f: ScreenFps) => void;
  join: (guildId: string, channelId: string) => Promise<void>;
  leave: () => Promise<void>;
  toggleMute: () => void;
  toggleScreen: () => Promise<void>;
}

const VoiceContext = createContext<VoiceContextValue | null>(null);

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [currentChannelId, setCurrentChannelId] = useState<string | null>(null);
  const [currentGuildId, setCurrentGuildId] = useState<string | null>(null);
  const [voiceStates, setVoiceStates] = useState<Record<string, VoiceUser[]>>({});
  const [isMuted, setIsMuted] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [screenQuality, setScreenQualityState] = useState<ScreenQuality>(1080);
  const [screenFps, setScreenFpsState] = useState<ScreenFps>(30);

  function setScreenQuality(q: ScreenQuality): void {
    setScreenQualityState(q);
    updateScreenQuality(q, screenFps).catch(console.error);
  }

  function setScreenFps(f: ScreenFps): void {
    setScreenFpsState(f);
    updateScreenQuality(screenQuality, f).catch(console.error);
  }
  const currentChannelRef = useRef<string | null>(null);

  // Populate initial voice presence from the `authenticated` WS response
  useEffect(() => {
    if (!user) return;
    const unlisten = listen<Array<{ user: VoiceUser; guild_id: string; channel_id: string }>>(
      "voice-states-init",
      (event) => {
        const initial: Record<string, VoiceUser[]> = {};
        for (const entry of event.payload) {
          if (!entry.channel_id) continue;
          initial[entry.channel_id] = [...(initial[entry.channel_id] ?? []), entry.user];
        }
        setVoiceStates(initial);
      }
    );
    return () => { unlisten.then((fn) => fn()); };
  }, [user]);

  // Reflète l'arrêt du partage déclenché hors React (UI native de capture, leave…)
  useEffect(() => {
    const onLocalScreenEnded = () => setIsSharing(false);
    window.addEventListener("voice-local-screen-ended", onLocalScreenEnded);
    return () => window.removeEventListener("voice-local-screen-ended", onLocalScreenEnded);
  }, []);

  useEffect(() => {
    if (!user) return;

    const cleanup = initVoice(user.id, (update: VoiceStateUpdate) => {
      setVoiceStates((prev) => {
        const next = { ...prev };

        // Remove user from any channel they were previously in
        for (const chId of Object.keys(next)) {
          next[chId] = next[chId].filter((u) => u.id !== update.user.id);
          if (next[chId].length === 0) delete next[chId];
        }

        // Add user to their new channel (if they joined one)
        if (update.channel_id) {
          next[update.channel_id] = [...(next[update.channel_id] ?? []), update.user];

          // If we're already in this channel, initiate a WebRTC connection
          if (
            currentChannelRef.current === update.channel_id &&
            update.user.id !== user.id
          ) {
            connectToPeer(update.user.id).catch(console.error);
          }
        }

        return next;
      });
    });

    return cleanup;
  }, [user]);

  async function join(guildId: string, channelId: string): Promise<void> {
    if (currentChannelRef.current === channelId) return; // déjà dans ce salon
    if (currentChannelRef.current) await wsLeave().catch(console.error);
    await wsJoin(guildId, channelId);
    setCurrentChannelId(channelId);
    setCurrentGuildId(guildId);
    currentChannelRef.current = channelId;

    // Initiate connections to users already in the channel
    const currentUsers = voiceStates[channelId] ?? [];
    for (const u of currentUsers) {
      if (u.id !== user?.id) {
        connectToPeer(u.id).catch(console.error);
      }
    }
  }

  async function leave(): Promise<void> {
    const leftChannelId = currentChannelRef.current;
    try {
      await wsLeave();
    } catch (e) {
      // Même si le WS est tombé, l'UI doit refléter la déconnexion locale
      console.error("[voice] leave:", e);
    }
    setCurrentChannelId(null);
    setCurrentGuildId(null);
    setIsSharing(false);
    currentChannelRef.current = null;

    // Optimistic update: remove self immediately without waiting for the WS echo
    if (user && leftChannelId) {
      setVoiceStates((prev) => {
        const next = { ...prev };
        if (next[leftChannelId]) {
          next[leftChannelId] = next[leftChannelId].filter((u) => u.id !== user.id);
          if (next[leftChannelId].length === 0) delete next[leftChannelId];
        }
        return next;
      });
    }
  }

  function toggleMute(): void {
    setIsMuted((prev) => {
      setMuted(!prev);
      return !prev;
    });
  }

  async function toggleScreen(): Promise<void> {
    if (isScreenSharing()) {
      await stopScreenShare();
      setIsSharing(false);
    } else {
      try {
        await startScreenShare(screenQuality, screenFps);
        setIsSharing(true);
      } catch (e) {
        // L'utilisateur a annulé le sélecteur de capture — pas une erreur
        console.warn("[voice] partage d'écran annulé:", e);
      }
    }
  }

  return (
    <VoiceContext.Provider
      value={{ currentChannelId, currentGuildId, voiceStates, isMuted, isSharing, screenQuality, screenFps, setScreenQuality, setScreenFps, join, leave, toggleMute, toggleScreen }}
    >
      {children}
    </VoiceContext.Provider>
  );
}

export function useVoice(): VoiceContextValue {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error("useVoice must be used within VoiceProvider");
  return ctx;
}
