import { useEffect, useRef, useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router";
import { Expand, Maximize2, Mic, MicOff, Minimize2, Monitor, MonitorOff, PhoneOff } from "lucide-react";
import { useVoice, type ScreenFps, type ScreenQuality } from "../context/VoiceContext";
import { useAuth } from "../context/AuthContext";
import { useGuild } from "../context/GuildContext";
import { getScreenStream, type ScreenShareStats } from "../services/voice";
import { getGuildChannels, type GuildChannel } from "../services/guilds";
import "../styles/voice-page.css";

function getInitials(name: string) {
  return name.replace(/[^A-Za-z0-9À-ÿ]/g, " ").trim()
    .split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function requestTileFullscreen(el: HTMLElement | null): void {
  if (!el) return;
  const anyEl = el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
  const req = anyEl.requestFullscreen ?? anyEl.webkitRequestFullscreen;
  req?.call(anyEl)?.catch?.(console.error);
}

const LIMITATION_LABELS: Record<string, string> = {
  bandwidth: "limité par le réseau",
  cpu: "limité par le CPU",
  other: "limité",
};

function ScreenTile({
  stream,
  label,
  focused = false,
  thumb = false,
  stats,
  onToggleFocus,
}: {
  stream: MediaStream;
  label: string;
  focused?: boolean;
  thumb?: boolean;
  stats?: ScreenShareStats | null;
  onToggleFocus?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const tileRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  const className =
    "voice-screen-tile" +
    (focused ? " voice-screen-tile--focused" : "") +
    (thumb ? " voice-screen-tile--thumb" : "");

  return (
    <div
      ref={tileRef}
      className={className}
      onClick={thumb ? onToggleFocus : undefined}
      onDoubleClick={thumb ? undefined : () => requestTileFullscreen(tileRef.current)}
    >
      <video ref={videoRef} autoPlay playsInline muted className="voice-screen-video" />
      <div className="voice-screen-label">{label}</div>
      {!thumb && stats && (
        <div className="voice-screen-stats">
          {stats.captureWidth && stats.captureHeight && `${stats.captureWidth}×${stats.captureHeight} → `}
          {stats.width && stats.height ? `${stats.width}×${stats.height}` : "…"}
          {stats.fps != null && ` • ${Math.round(stats.fps)} fps`}
          {` • ${(stats.bitrateKbps / 1000).toFixed(1)} Mbps`}
          {stats.encoder && ` • ${stats.encoder}`}
          {stats.limitation && stats.limitation !== "none" && (
            <span className="voice-screen-stats-warn">
              {" "}({LIMITATION_LABELS[stats.limitation] ?? stats.limitation})
            </span>
          )}
        </div>
      )}
      {!thumb && (
        <div className="voice-screen-controls">
          <button
            className="voice-screen-ctrl"
            title={focused ? "Réduire" : "Agrandir"}
            onClick={onToggleFocus}
          >
            {focused ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button
            className="voice-screen-ctrl"
            title="Plein écran"
            onClick={() => requestTileFullscreen(tileRef.current)}
          >
            <Expand size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function VoiceChannelPage() {
  const { guildId, channelId } = useParams<{ guildId: string; channelId: string }>();
  const { state } = useLocation();
  const navigate = useNavigate();
  const channelFromState = state?.channel as GuildChannel | undefined;
  const [resolvedChannel, setResolvedChannel] = useState<GuildChannel | undefined>(channelFromState);
  const channel = resolvedChannel;
  const { user } = useAuth();
  const { lastVisited } = useGuild();

  useEffect(() => {
    if (channelFromState) { setResolvedChannel(channelFromState); return; }
    if (!guildId || !channelId) return;
    getGuildChannels(guildId)
      .then((chs) => setResolvedChannel(chs.find((c) => c.id === channelId)))
      .catch(console.error);
  }, [guildId, channelId, channelFromState]);

  const {
    voiceStates,
    currentChannelId,
    isMuted,
    isSharing,
    screenQuality,
    screenFps,
    setScreenQuality,
    setScreenFps,
    leave,
    toggleMute,
    toggleScreen,
    join,
  } = useVoice();

  const QUALITY_OPTIONS: ScreenQuality[] = [480, 720, 1080, 1440];
  const FPS_OPTIONS: ScreenFps[] = [30, 60];

  // Stats d'encodage du partage local (résolution, fps, bitrate, encodeur)
  const [screenStats, setScreenStats] = useState<ScreenShareStats | null>(null);
  useEffect(() => {
    if (!isSharing) { setScreenStats(null); return; }
    const onStats = (e: Event) => setScreenStats((e as CustomEvent<ScreenShareStats>).detail);
    window.addEventListener("voice-screen-stats", onStats);
    return () => window.removeEventListener("voice-screen-stats", onStats);
  }, [isSharing]);

  // Stats de réception des partages distants (ce qui ARRIVE réellement)
  const [remoteStats, setRemoteStats] = useState<Record<string, ScreenShareStats>>({});
  useEffect(() => {
    const onStats = (e: Event) => {
      const { userId, stats } = (e as CustomEvent<{ userId: string; stats: ScreenShareStats }>).detail;
      setRemoteStats((prev) => ({ ...prev, [userId]: stats }));
    };
    const onEnded = (e: Event) => {
      const { userId } = (e as CustomEvent<{ userId: string }>).detail;
      setRemoteStats((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    };
    window.addEventListener("voice-screen-remote-stats", onStats);
    window.addEventListener("voice-screen-ended", onEnded);
    return () => {
      window.removeEventListener("voice-screen-remote-stats", onStats);
      window.removeEventListener("voice-screen-ended", onEnded);
    };
  }, []);

  // Track whether we were ever connected on this page mount
  const wasConnectedRef = useRef(false);

  // Auto-join when navigating here directly (e.g. page refresh)
  useEffect(() => {
    if (!guildId || !channelId) return;
    if (currentChannelId !== channelId) {
      join(guildId, channelId).catch(console.error);
    }
  }, [channelId, guildId]);

  // Navigate away once the connection ends
  useEffect(() => {
    if (currentChannelId === channelId) {
      wasConnectedRef.current = true;
    } else if (wasConnectedRef.current) {
      // We were in this channel but left — go to last visited text channel or home
      const dest = guildId ? (lastVisited[guildId]?.path ?? "/") : "/";
      navigate(dest, { replace: true });
    }
  }, [currentChannelId]);

  // Incoming screen streams from peers
  const [peerScreens, setPeerScreens] = useState<Record<string, MediaStream>>({});

  useEffect(() => {
    function onScreenTrack(e: Event) {
      const { userId, stream } = (e as CustomEvent<{ userId: string; stream: MediaStream }>).detail;
      setPeerScreens((prev) => ({ ...prev, [userId]: stream }));
    }
    function onScreenEnded(e: Event) {
      const { userId } = (e as CustomEvent<{ userId: string }>).detail;
      setPeerScreens((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    }
    window.addEventListener("voice-screen-track", onScreenTrack);
    window.addEventListener("voice-screen-ended", onScreenEnded);
    return () => {
      window.removeEventListener("voice-screen-track", onScreenTrack);
      window.removeEventListener("voice-screen-ended", onScreenEnded);
    };
  }, []);

  const members = channelId ? (voiceStates[channelId] ?? []) : [];
  const channelName = channel?.name ?? channelId ?? "Vocal";

  // Include local user in the tile list until the server echo removes them
  const participantIds = new Set(members.map((m) => m.id));
  const allParticipants = user && !participantIds.has(user.id)
    ? [{ id: user.id, name: user.name, display_name: user.display_name, profile_picture: "" }, ...members]
    : members;

  const localScreenStream = isSharing ? getScreenStream() : null;

  const screenTiles: { id: string; stream: MediaStream; label: string }[] = [];
  if (localScreenStream) {
    screenTiles.push({ id: "__local__", stream: localScreenStream, label: user?.display_name ?? "Moi" });
  }
  for (const [userId, stream] of Object.entries(peerScreens)) {
    const member = members.find((m) => m.id === userId);
    const label = member?.display_name || member?.name || userId;
    screenTiles.push({ id: userId, stream, label });
  }

  const hasScreens = screenTiles.length > 0;

  // Tuile mise en avant (clic sur "Agrandir") — façon Discord
  const [focusedScreenId, setFocusedScreenId] = useState<string | null>(null);
  const focusedTile = screenTiles.find((t) => t.id === focusedScreenId) ?? null;

  // Si le partage focusé s'arrête, on revient à la grille
  useEffect(() => {
    if (focusedScreenId && !screenTiles.some((t) => t.id === focusedScreenId)) {
      setFocusedScreenId(null);
    }
  }, [focusedScreenId, screenTiles]);

  return (
    <div className="voice-page">
      <div className="voice-page-topbar">
        <span className="voice-page-topbar-icon">🔊</span>
        <span className="voice-page-topbar-name">{channelName}</span>
      </div>

      <div className="voice-page-stage">
        {hasScreens && focusedTile ? (
          <div className="voice-screen-area voice-screen-area--focused">
            <ScreenTile
              key={focusedTile.id}
              stream={focusedTile.stream}
              label={focusedTile.label}
              focused
              stats={focusedTile.id === "__local__" ? screenStats : remoteStats[focusedTile.id] ?? null}
              onToggleFocus={() => setFocusedScreenId(null)}
            />
            {screenTiles.length > 1 && (
              <div className="voice-screen-thumbs">
                {screenTiles
                  .filter((t) => t.id !== focusedTile.id)
                  .map((t) => (
                    <ScreenTile
                      key={t.id}
                      stream={t.stream}
                      label={t.label}
                      thumb
                      onToggleFocus={() => setFocusedScreenId(t.id)}
                    />
                  ))}
              </div>
            )}
          </div>
        ) : hasScreens ? (
          <div className="voice-screen-area">
            {screenTiles.map((t) => (
              <ScreenTile
                key={t.id}
                stream={t.stream}
                label={t.label}
                stats={t.id === "__local__" ? screenStats : remoteStats[t.id] ?? null}
                onToggleFocus={() => setFocusedScreenId(t.id)}
              />
            ))}
          </div>
        ) : null}

        {allParticipants.length === 0 ? (
          <p className="voice-page-empty">Personne ici pour l'instant.</p>
        ) : (
          <div className="voice-participants">
            {allParticipants.map((u) => {
              const name = u.display_name || u.name;
              const isMe = u.id === user?.id;
              return (
                <div key={u.id} className="voice-participant">
                  <div className="voice-participant-avatar">
                    {getInitials(name)}
                    {isMe && isMuted && (
                      <div className="voice-participant-muted">
                        <MicOff size={10} />
                      </div>
                    )}
                  </div>
                  <span className="voice-participant-name">{isMe ? `${name} (moi)` : name}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="voice-page-controls">
        <button
          className={`voice-ctrl-btn${isMuted ? " voice-ctrl-btn--muted" : ""}`}
          onClick={toggleMute}
        >
          {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
          {isMuted ? "Micro coupé" : "Micro"}
        </button>

        <div className="voice-ctrl-share-group">
          <button
            className={`voice-ctrl-btn${isSharing ? " voice-ctrl-btn--active" : ""}`}
            onClick={toggleScreen}
          >
            {isSharing ? <MonitorOff size={20} /> : <Monitor size={20} />}
            {isSharing ? "Arrêter" : "Partager"}
          </button>
          <div className="voice-quality-picker" title="Appliqué en direct pendant le partage">
            {QUALITY_OPTIONS.map((q) => (
              <button
                key={q}
                className={`voice-quality-btn${q === screenQuality ? " voice-quality-btn--active" : ""}`}
                onClick={() => setScreenQuality(q)}
              >
                {q}p
              </button>
            ))}
            <span className="voice-quality-sep" />
            {FPS_OPTIONS.map((f) => (
              <button
                key={f}
                className={`voice-quality-btn${f === screenFps ? " voice-quality-btn--active" : ""}`}
                onClick={() => setScreenFps(f)}
              >
                {f} fps
              </button>
            ))}
          </div>
        </div>

        <button className="voice-ctrl-btn voice-ctrl-btn--leave" onClick={leave}>
          <PhoneOff size={20} />
          Raccrocher
        </button>
      </div>
    </div>
  );
}
