import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

// ─── Qualités de partage d'écran ────────────────────────────────────────────

export type ScreenQuality = 480 | 720 | 1080 | 1440;
export type ScreenFps = 30 | 60;

/** Bitrates de référence à 30 fps — en 60 fps on applique ×1.5. */
const QUALITY_PRESETS: Record<ScreenQuality, { height: number; bitrate: number }> = {
  480:  { height: 480,  bitrate: 3_000_000 },
  720:  { height: 720,  bitrate: 5_000_000 },
  1080: { height: 1080, bitrate: 8_000_000 },
  1440: { height: 1440, bitrate: 12_000_000 },
};

export interface ScreenEncoding {
  scaleResolutionDownBy: number;
  maxBitrate: number;
  maxFramerate: number;
}

/**
 * Calcule l'encodage cible : on capture l'écran en résolution native (évite le
 * double redimensionnement flou sur Retina) et c'est l'encodeur qui réduit
 * vers le preset via scaleResolutionDownBy. Jamais d'upscale.
 */
export function computeScreenEncoding(
  captureHeight: number | undefined,
  quality: ScreenQuality,
  fps: ScreenFps,
): ScreenEncoding {
  const preset = QUALITY_PRESETS[quality];
  const scale = captureHeight ? Math.max(1, captureHeight / preset.height) : 1;
  return {
    scaleResolutionDownBy: scale,
    maxBitrate: Math.round(preset.bitrate * (fps === 60 ? 1.5 : 1)),
    maxFramerate: fps,
  };
}

export interface ScreenShareStats {
  /** Résolution de la capture source (avant réduction encodeur) */
  captureWidth: number | undefined;
  captureHeight: number | undefined;
  /** Résolution réellement encodée/envoyée */
  width: number | undefined;
  height: number | undefined;
  fps: number | undefined;
  bitrateKbps: number;
  /** "none" | "bandwidth" | "cpu" | "other" — pourquoi l'encodeur bride, le cas échéant */
  limitation: string | undefined;
  /** Implémentation encodeur (ex: "VideoToolbox" = matériel/GPU) — absent sur WebKit */
  encoder: string | undefined;
}

const MAX_RESTART_ATTEMPTS = 5;
const DISCONNECT_GRACE_MS = 4000;

// ─── Types ─────────────────────────────────────────────────────────────────

export interface VoiceUser {
  id: string;
  name: string;
  display_name: string;
  profile_picture: string;
}

export interface VoiceStateUpdate {
  user: VoiceUser;
  guild_id: string;
  channel_id: string | null;
}

interface VoiceSignal {
  type: "voice-offer" | "voice-answer" | "voice-ice" | "voice-leave" | "voice-screen";
  sdp?: string;
  candidate?: RTCIceCandidateInit;
  hasScreen?: boolean;
}

interface PeerState {
  pc: RTCPeerConnection;
  userId: string;
  /** Perfect negotiation : le pair poli accepte les offres en collision (rollback),
   *  l'impoli les ignore. Déterminé par comparaison des user IDs — toujours
   *  opposé des deux côtés, donc une collision se résout au premier échange. */
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  audioEl: HTMLAudioElement;
  pendingCandidates: RTCIceCandidateInit[];
  remoteSet: boolean;
  restartAttempts: number;
  restartTimer: ReturnType<typeof setTimeout> | null;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
}

// ─── State ──────────────────────────────────────────────────────────────────

const peers = new Map<string, PeerState>();
let localStream: MediaStream | null = null;
let screenStream: MediaStream | null = null;
let localUserId: string | null = null;
let currentScreenQuality: ScreenQuality = 1080;
let currentScreenFps: ScreenFps = 30;
/** Hauteur de capture utilisée au dernier calcul d'échelle — pour détecter un resize de la source. */
let lastTunedCaptureHeight: number | null = null;
let statsTimer: ReturnType<typeof setInterval> | null = null;
let statsLastBytes: number | null = null;
let unlistenSignal: (() => void) | null = null;
let onVoiceStateUpdate: ((update: VoiceStateUpdate) => void) | null = null;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Le pair "poli" est celui dont l'ID est lexicographiquement inférieur. */
export function isPolitePeer(localId: string, remoteId: string): boolean {
  return localId < remoteId;
}

async function sendSignal(toUserId: string, signal: VoiceSignal): Promise<void> {
  await invoke("relay_signal", { to: toUserId, content: JSON.stringify(signal) });
}

async function addIceCandidate(peer: PeerState, candidate: RTCIceCandidateInit): Promise<void> {
  if (peer.remoteSet) {
    try {
      await peer.pc.addIceCandidate(candidate);
    } catch (e) {
      // Attendu si on vient d'ignorer une offre en collision (pair impoli)
      if (!peer.ignoreOffer) console.error("[voice] addIceCandidate:", e);
    }
  } else {
    peer.pendingCandidates.push(candidate);
  }
}

async function flushCandidates(peer: PeerState): Promise<void> {
  const pending = peer.pendingCandidates;
  peer.pendingCandidates = [];
  for (const c of pending) {
    await peer.pc.addIceCandidate(c).catch(console.error);
  }
}

function safePlay(el: HTMLAudioElement): void {
  const p = el.play();
  if (p) p.catch(() => { /* autoplay bloqué — reprendra au prochain geste utilisateur */ });
}

/**
 * L'estimateur de bande passante (BWE) de libwebrtc démarre bas (~300 kbps)
 * et plafonne souvent bien avant le maxBitrate demandé. Les paramètres
 * x-google-* dans le fmtp des codecs vidéo forcent les bornes du BWE du
 * pair qui REÇOIT ce SDP. Non standard, mais respecté par libwebrtc (Chrome
 * et WebKit) — et les deux extrémités sont notre app, donc on contrôle tout.
 * À appliquer sur les SDP qu'on ENVOIE (jamais sur ceux qu'on applique).
 */
const X_GOOGLE_BITRATES =
  "x-google-start-bitrate=5000;x-google-min-bitrate=1500;x-google-max-bitrate=15000";
const VIDEO_CODEC_RE = /^a=rtpmap:(\d+) (H264|VP8|VP9|AV1)\//i;

export function boostVideoSdp(sdp: string): string {
  const lines = sdp.split("\r\n");

  const videoPts = new Set<string>();
  for (const line of lines) {
    const m = VIDEO_CODEC_RE.exec(line);
    if (m) videoPts.add(m[1]);
  }
  if (videoPts.size === 0) return sdp;

  const withFmtp = new Set<string>();
  const augmented = lines.map((line) => {
    const m = /^a=fmtp:(\d+) (.+)$/.exec(line);
    if (m && videoPts.has(m[1])) {
      withFmtp.add(m[1]);
      return `a=fmtp:${m[1]} ${m[2]};${X_GOOGLE_BITRATES}`;
    }
    return line;
  });

  // Les codecs vidéo sans fmtp (VP8 typiquement) en reçoivent une
  const out: string[] = [];
  for (const line of augmented) {
    out.push(line);
    const m = VIDEO_CODEC_RE.exec(line);
    if (m && !withFmtp.has(m[1])) {
      out.push(`a=fmtp:${m[1]} ${X_GOOGLE_BITRATES}`);
      withFmtp.add(m[1]);
    }
  }
  return out.join("\r\n");
}

/** High (64) > Main (4d) > Baseline (42) : meilleure qualité à bitrate égal. */
function h264ProfileRank(codec: { sdpFmtpLine?: string }): number {
  const profile = /profile-level-id=([0-9a-f]{2})/i.exec(codec.sdpFmtpLine ?? "")?.[1]?.toLowerCase();
  if (profile === "64") return 0;
  if (profile === "4d") return 1;
  return 2;
}

/**
 * Ordre des codecs selon le mode :
 *
 * - 30 fps (netteté) → VP9 > VP8 > H.264. Les encodeurs libvpx ont un vrai
 *   mode screencast dans libwebrtc : ils continuent de RAFFINER l'image
 *   quand elle est statique, jusqu'à un texte parfaitement net. H.264 via
 *   VideoToolbox (matériel) encode chaque frame une fois et n'y revient
 *   jamais — un écran de texte figé reste flou indéfiniment.
 * - 60 fps (fluidité) → H.264 d'abord (encodage GPU, indispensable pour du
 *   60 fps haute résolution sans cramer le CPU), profil High avant Baseline
 *   (CABAC + transformées 8×8 = plus net à bitrate égal).
 */
export function orderScreenCodecs<T extends { mimeType: string; sdpFmtpLine?: string }>(
  codecs: T[],
  fps: ScreenFps,
): T[] {
  const rank = (c: T): number => {
    const mt = c.mimeType.toLowerCase();
    if (fps === 60) {
      if (mt === "video/h264") return h264ProfileRank(c); // 0..2
      if (mt === "video/vp9") return 3;
      if (mt === "video/vp8") return 4;
      return 5;
    }
    if (mt === "video/vp9") return 0;
    if (mt === "video/vp8") return 1;
    if (mt === "video/h264") return 2 + h264ProfileRank(c); // 2..4
    return 5;
  };
  return [...codecs].sort((a, b) => rank(a) - rank(b));
}

function preferScreenCodecs(transceiver: RTCRtpTransceiver | undefined): void {
  try {
    const caps = RTCRtpSender.getCapabilities?.("video");
    if (transceiver?.setCodecPreferences && caps) {
      transceiver.setCodecPreferences(orderScreenCodecs(caps.codecs, currentScreenFps));
    }
  } catch (e) {
    console.warn("[voice] setCodecPreferences non supporté:", e);
  }
}

/**
 * Applique le preset de qualité courant sur un sender vidéo déjà négocié.
 * IMPORTANT : avant négociation, getParameters().encodings est vide et
 * setParameters ne peut pas en créer — le preset initial passe donc par
 * sendEncodings dans addTransceiver, et cette fonction sert aux mises à
 * jour live + au re-passage après négociation (ceinture et bretelles).
 */
async function applyScreenEncoding(sender: RTCRtpSender): Promise<void> {
  const settings = screenStream?.getVideoTracks()[0]?.getSettings();
  const enc = computeScreenEncoding(settings?.height, currentScreenQuality, currentScreenFps);
  lastTunedCaptureHeight = settings?.height ?? null;

  const params = sender.getParameters() as RTCRtpSendParameters & {
    degradationPreference?: string;
  };
  if (!params.encodings || params.encodings.length === 0) return; // pas encore négocié

  params.encodings[0].maxBitrate = enc.maxBitrate;
  params.encodings[0].maxFramerate = enc.maxFramerate;
  params.encodings[0].scaleResolutionDownBy = enc.scaleResolutionDownBy;
  // 30 fps → priorité netteté (texte) ; 60 fps → priorité fluidité
  params.degradationPreference =
    currentScreenFps === 60 ? "maintain-framerate" : "maintain-resolution";

  try {
    await sender.setParameters(params);
  } catch (e) {
    // scaleResolutionDownBy non supporté par certains moteurs → on retombe
    // sur une réduction côté capture
    console.warn("[voice] setParameters avec scale échoué, fallback applyConstraints:", e);
    delete params.encodings[0].scaleResolutionDownBy;
    await sender.setParameters(params).catch((e2) => console.error("[voice] setParameters:", e2));
    const track = screenStream?.getVideoTracks()[0];
    const preset = QUALITY_PRESETS[currentScreenQuality];
    await track?.applyConstraints({ height: { ideal: preset.height } }).catch(() => {});
  }
}

/** Re-applique le preset sur les senders vidéo d'un pair (post-négociation). */
function retuneScreenSenders(peer: PeerState): void {
  if (!screenStream) return;
  for (const sender of peer.pc.getSenders()) {
    if (sender.track?.kind === "video") {
      applyScreenEncoding(sender).catch(console.error);
    }
  }
}

function attachScreenTrackToPeer(peer: PeerState, stream: MediaStream): void {
  const track = stream.getVideoTracks()[0];
  if (!track) return;

  const existing = peer.pc.getSenders().find((s) => s.track?.kind === "video");
  if (existing) {
    // replaceTrack ne renégocie pas — la connexion reste stable
    if (existing.track !== track) existing.replaceTrack(track).catch(console.error);
    applyScreenEncoding(existing).catch(console.error);
    return;
  }

  const settings = track.getSettings();
  const enc = computeScreenEncoding(settings.height, currentScreenQuality, currentScreenFps);
  lastTunedCaptureHeight = settings.height ?? null;
  // sendEncodings à la création : seule façon fiable de poser maxBitrate/scale
  // AVANT la première négociation (setParameters échoue tant que les
  // encodings n'existent pas → l'encodeur resterait bridé à ~2.5 Mbps)
  const transceiver = peer.pc.addTransceiver(track, {
    direction: "sendrecv",
    streams: [stream],
    sendEncodings: [{
      maxBitrate: enc.maxBitrate,
      maxFramerate: enc.maxFramerate,
      scaleResolutionDownBy: enc.scaleResolutionDownBy,
    }],
  });
  preferScreenCodecs(transceiver);
}

function addLocalTracksToPeer(peer: PeerState): void {
  if (localStream) {
    for (const track of localStream.getTracks()) {
      if (!peer.pc.getSenders().some((s) => s.track === track)) {
        peer.pc.addTrack(track, localStream);
      }
    }
  }
  if (screenStream) {
    attachScreenTrackToPeer(peer, screenStream);
  }
}

// ─── Reconnexion automatique ────────────────────────────────────────────────

function scheduleRestart(peer: PeerState): void {
  if (!peers.has(peer.userId)) return;

  if (peer.restartAttempts >= MAX_RESTART_ATTEMPTS) {
    console.error(`[voice] connexion vers ${peer.userId} abandonnée après ${MAX_RESTART_ATTEMPTS} tentatives`);
    closePeer(peer.userId);
    return;
  }

  peer.restartAttempts += 1;
  const delay = Math.min(1000 * peer.restartAttempts, 5000);

  if (peer.restartTimer) clearTimeout(peer.restartTimer);
  peer.restartTimer = setTimeout(() => {
    peer.restartTimer = null;
    if (!peers.has(peer.userId)) return;
    if (peer.pc.connectionState === "connected") return;
    console.warn(`[voice] ICE restart vers ${peer.userId} (tentative ${peer.restartAttempts})`);
    try {
      // Déclenche onnegotiationneeded avec de nouveaux credentials ICE
      peer.pc.restartIce();
    } catch (e) {
      console.error("[voice] restartIce échoué:", e);
    }
  }, delay);
}

// ─── Peer lifecycle ─────────────────────────────────────────────────────────

function createPeerConnection(userId: string): PeerState {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  const audioEl = document.createElement("audio");
  audioEl.autoplay = true;
  audioEl.volume = 1.0;
  audioEl.style.display = "none";
  document.body.appendChild(audioEl);

  const peer: PeerState = {
    pc,
    userId,
    polite: isPolitePeer(localUserId ?? "", userId),
    makingOffer: false,
    ignoreOffer: false,
    audioEl,
    pendingCandidates: [],
    remoteSet: false,
    restartAttempts: 0,
    restartTimer: null,
    disconnectTimer: null,
  };
  peers.set(userId, peer);

  pc.onnegotiationneeded = async () => {
    try {
      peer.makingOffer = true;
      // setLocalDescription sans argument : crée l'offre adaptée à l'état courant
      await pc.setLocalDescription();
      // boostVideoSdp sur le SDP envoyé : force le BWE du pair distant
      await sendSignal(userId, { type: "voice-offer", sdp: boostVideoSdp(pc.localDescription?.sdp ?? "") });
    } catch (e) {
      console.error("[voice] négociation échouée:", e);
    } finally {
      peer.makingOffer = false;
    }
  };

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      sendSignal(userId, { type: "voice-ice", candidate: e.candidate.toJSON() }).catch(console.error);
    }
  };

  pc.oniceconnectionstatechange = () => {
    if (pc.iceConnectionState === "failed") scheduleRestart(peer);
  };

  pc.onconnectionstatechange = () => {
    const st = pc.connectionState;
    if (st === "connected") {
      peer.restartAttempts = 0;
      if (peer.disconnectTimer) {
        clearTimeout(peer.disconnectTimer);
        peer.disconnectTimer = null;
      }
    } else if (st === "disconnected") {
      // Souvent transitoire (changement réseau) — on laisse une période de grâce
      if (peer.disconnectTimer) clearTimeout(peer.disconnectTimer);
      peer.disconnectTimer = setTimeout(() => {
        peer.disconnectTimer = null;
        if (pc.connectionState === "disconnected") scheduleRestart(peer);
      }, DISCONNECT_GRACE_MS);
    } else if (st === "failed") {
      scheduleRestart(peer);
    }
  };

  pc.ontrack = (e) => {
    const stream = e.streams[0];
    if (e.track.kind === "audio") {
      peer.audioEl.srcObject = stream;
      safePlay(peer.audioEl);
    } else {
      window.dispatchEvent(new CustomEvent("voice-screen-track", {
        detail: { userId, stream },
      }));
      startRxStatsLoop();
      // Filet de sécurité si le signal voice-screen { hasScreen: false } se perd
      stream.onremovetrack = () => {
        if (stream.getVideoTracks().length === 0) {
          window.dispatchEvent(new CustomEvent("voice-screen-ended", { detail: { userId } }));
        }
      };
    }
  };

  return peer;
}

function closePeer(userId: string): void {
  const peer = peers.get(userId);
  if (!peer) return;
  if (peer.restartTimer) clearTimeout(peer.restartTimer);
  if (peer.disconnectTimer) clearTimeout(peer.disconnectTimer);
  peer.pc.close();
  peer.audioEl.srcObject = null;
  peer.audioEl.remove();
  peers.delete(userId);
  rxLastBytes.delete(userId);
  // Notify UI that any screen share from this peer is gone
  window.dispatchEvent(new CustomEvent("voice-screen-ended", { detail: { userId } }));
}

// ─── Signal handlers (perfect negotiation, cf. MDN) ─────────────────────────

async function handleOffer(fromUserId: string, signal: VoiceSignal): Promise<void> {
  if (!signal.sdp) return;
  // Pas en vocal → ignore les offres parasites (signaux en retard, reconnexions…)
  if (!localStream) return;

  let peer = peers.get(fromUserId);
  if (!peer) peer = createPeerConnection(fromUserId);
  addLocalTracksToPeer(peer);

  const collision = peer.makingOffer || peer.pc.signalingState !== "stable";
  peer.ignoreOffer = !peer.polite && collision;
  if (peer.ignoreOffer) return;

  // En cas de collision côté poli, setRemoteDescription(offer) effectue un
  // rollback implicite de notre offre locale avant d'appliquer la leur.
  await peer.pc.setRemoteDescription({ type: "offer", sdp: signal.sdp });
  peer.remoteSet = true;
  await flushCandidates(peer);

  await peer.pc.setLocalDescription();
  await sendSignal(fromUserId, {
    type: "voice-answer",
    sdp: boostVideoSdp(peer.pc.localDescription?.sdp ?? ""),
  });
}

async function handleAnswer(fromUserId: string, signal: VoiceSignal): Promise<void> {
  const peer = peers.get(fromUserId);
  if (!peer || !signal.sdp) return;
  // Answer périmée (offre rollbackée ou déjà répondue) → ignorer évite de casser l'état
  if (peer.pc.signalingState !== "have-local-offer") return;
  await peer.pc.setRemoteDescription({ type: "answer", sdp: signal.sdp });
  peer.remoteSet = true;
  await flushCandidates(peer);
  // Les encodings existent maintenant — re-applique le preset au cas où
  // sendEncodings n'aurait pas été honoré par le moteur
  retuneScreenSenders(peer);
}

async function handleIce(fromUserId: string, signal: VoiceSignal): Promise<void> {
  const peer = peers.get(fromUserId);
  if (!peer || !signal.candidate) return;
  await addIceCandidate(peer, signal.candidate);
}

function handleScreenSignal(fromUserId: string, signal: VoiceSignal): void {
  if (signal.hasScreen === false) {
    window.dispatchEvent(new CustomEvent("voice-screen-ended", { detail: { userId: fromUserId } }));
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function initVoice(
  userId: string,
  onUpdate: (update: VoiceStateUpdate) => void,
): () => void {
  localUserId = userId;
  onVoiceStateUpdate = onUpdate;

  if (unlistenSignal) {
    unlistenSignal();
    unlistenSignal = null;
  }

  const p1 = listen<{ from: string; content: unknown; message_type: string }>(
    "p2p-signal",
    async (event) => {
      const { from, content } = event.payload;
      let signal: VoiceSignal;
      try {
        signal = typeof content === "string" ? JSON.parse(content) : (content as VoiceSignal);
      } catch {
        return;
      }
      if (!signal.type?.startsWith("voice-")) return;

      try {
        if (signal.type === "voice-offer") await handleOffer(from, signal);
        else if (signal.type === "voice-answer") await handleAnswer(from, signal);
        else if (signal.type === "voice-ice") await handleIce(from, signal);
        else if (signal.type === "voice-leave") closePeer(from);
        else if (signal.type === "voice-screen") handleScreenSignal(from, signal);
      } catch (e) {
        console.error(`[voice] signal ${signal.type} de ${from}:`, e);
      }
    },
  );

  const p2 = listen<VoiceStateUpdate>("voice-state-update", (event) => {
    onVoiceStateUpdate?.(event.payload);
  });

  p1.then((fn) => { unlistenSignal = fn; });

  return () => {
    p1.then((fn) => fn());
    p2.then((fn) => fn());
    unlistenSignal = null;
  };
}

export async function joinVoiceChannel(guildId: string, channelId: string): Promise<void> {
  if (!localStream) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
    } catch {
      // Contraintes refusées par certains périphériques → retente en mode simple
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }
  }
  await invoke("join_voice_channel", { guildId, channelId });
}

/**
 * Initie une connexion WebRTC vers un utilisateur déjà dans le channel.
 * Les deux côtés peuvent appeler ceci simultanément : la collision d'offres
 * est résolue par le pattern perfect negotiation (pair poli/impoli).
 */
export async function connectToPeer(userId: string): Promise<void> {
  if (!localStream) return; // pas en vocal
  let peer = peers.get(userId);
  if (!peer) peer = createPeerConnection(userId);
  addLocalTracksToPeer(peer);
  // onnegotiationneeded déclenche l'offre automatiquement
}

export async function leaveVoiceChannel(): Promise<void> {
  for (const userId of [...peers.keys()]) {
    sendSignal(userId, { type: "voice-leave" }).catch(() => {});
    closePeer(userId);
  }
  if (localStream) {
    localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
  }
  await stopScreenShare();
  await invoke("leave_voice_channel");
}

export async function startScreenShare(
  quality: ScreenQuality = 1080,
  fps: ScreenFps = 30,
): Promise<MediaStream> {
  if (screenStream) return screenStream;

  currentScreenQuality = quality;
  currentScreenFps = fps;

  // width/height très hauts en "ideal" : le navigateur les borne à la taille
  // réelle de la source et choisit donc la résolution PHYSIQUE (backing
  // Retina, ex: 1602×1202 pour une fenêtre de 801×601 points) plutôt que la
  // taille logique. Sans ces contraintes, WebKit capture en points logiques
  // → moitié de la résolution sur Retina → flou irrécupérable. La réduction
  // vers le preset se fait ensuite à l'encodage (scaleResolutionDownBy).
  const stream = await (navigator.mediaDevices as MediaDevices & {
    getDisplayMedia(opts?: object): Promise<MediaStream>;
  }).getDisplayMedia({
    video: {
      width: { ideal: 7680 },
      height: { ideal: 4320 },
      frameRate: { ideal: 60, max: 60 },
      // Si le moteur capture en physique puis réduit vers la taille logique,
      // "none" lui demande de livrer la capture brute (pixels Retina)
      resizeMode: { ideal: "none" },
    },
    audio: false,
  });

  const track = stream.getVideoTracks()[0];
  applyContentHint(track);
  screenStream = stream;

  for (const peer of peers.values()) {
    attachScreenTrackToPeer(peer, stream);
    sendSignal(peer.userId, { type: "voice-screen", hasScreen: true }).catch(() => {});
  }

  // Arrêt via l'UI native (barre système / bouton navigateur)
  track.onended = () => { stopScreenShare().catch(console.error); };

  startStatsLoop();

  return stream;
}

function applyContentHint(track: MediaStreamTrack): void {
  // 30 fps → "detail" (netteté du texte) ; 60 fps → "motion" (fluidité)
  track.contentHint = currentScreenFps === 60 ? "motion" : "detail";
}

/**
 * Change la qualité/fps en cours de partage. La résolution/bitrate sont
 * appliqués à chaud (setParameters) ; un changement 30↔60 fps change aussi
 * le codec préféré (VP9 ↔ H.264), ce qui demande une renégociation — on la
 * déclenche manuellement, le perfect negotiation absorbe les collisions.
 */
export async function updateScreenQuality(quality: ScreenQuality, fps: ScreenFps): Promise<void> {
  const codecChanged = fps !== currentScreenFps;
  currentScreenQuality = quality;
  currentScreenFps = fps;
  if (!screenStream) return;

  applyContentHint(screenStream.getVideoTracks()[0]);
  for (const peer of peers.values()) {
    retuneScreenSenders(peer);
    if (codecChanged) {
      const transceiver = peer.pc
        .getTransceivers()
        .find((t) => t.sender.track?.kind === "video");
      preferScreenCodecs(transceiver);
      peer.pc.onnegotiationneeded?.call(peer.pc, new Event("negotiationneeded"));
    }
  }
}

// ─── Stats d'encodage (diagnostic qualité) ──────────────────────────────────

const STATS_INTERVAL_MS = 2000;

function startStatsLoop(): void {
  stopStatsLoop();
  statsTimer = setInterval(async () => {
    // La source a changé de taille (fenêtre redimensionnée) → recalcule l'échelle
    const captureSettings = screenStream?.getVideoTracks()[0]?.getSettings();
    if (
      captureSettings?.height &&
      lastTunedCaptureHeight !== null &&
      Math.abs(captureSettings.height - lastTunedCaptureHeight) > 2
    ) {
      for (const p of peers.values()) retuneScreenSenders(p);
    }

    const peer = [...peers.values()].find((p) =>
      p.pc.getSenders().some((s) => s.track?.kind === "video"),
    );
    if (!peer) return;
    const sender = peer.pc.getSenders().find((s) => s.track?.kind === "video")!;

    let report: RTCStatsReport;
    try {
      report = await sender.getStats();
    } catch {
      return;
    }

    let out: Record<string, unknown> | null = null;
    report.forEach((r) => {
      if (r.type === "outbound-rtp" && (r as { kind?: string }).kind === "video") {
        out = r as unknown as Record<string, unknown>;
      }
    });
    if (!out) return;
    const o = out as Record<string, unknown>;

    const bytes = (o.bytesSent as number) ?? 0;
    const bitrateKbps = statsLastBytes !== null
      ? Math.max(0, Math.round(((bytes - statsLastBytes) * 8) / STATS_INTERVAL_MS))
      : 0;
    statsLastBytes = bytes;

    const stats: ScreenShareStats = {
      captureWidth: captureSettings?.width,
      captureHeight: captureSettings?.height,
      width: o.frameWidth as number | undefined,
      height: o.frameHeight as number | undefined,
      fps: o.framesPerSecond as number | undefined,
      bitrateKbps,
      limitation: o.qualityLimitationReason as string | undefined,
      encoder: o.encoderImplementation as string | undefined,
    };
    window.dispatchEvent(new CustomEvent("voice-screen-stats", { detail: stats }));
  }, STATS_INTERVAL_MS);
}

function stopStatsLoop(): void {
  if (statsTimer) {
    clearInterval(statsTimer);
    statsTimer = null;
  }
  statsLastBytes = null;
}

// ─── Stats de réception (tuiles distantes) ──────────────────────────────────

let rxStatsTimer: ReturnType<typeof setInterval> | null = null;
const rxLastBytes = new Map<string, number>();

function startRxStatsLoop(): void {
  if (rxStatsTimer) return;
  rxStatsTimer = setInterval(async () => {
    let anyVideo = false;

    for (const peer of peers.values()) {
      const receiver = peer.pc.getReceivers().find((r) => r.track?.kind === "video");
      if (!receiver) continue;
      anyVideo = true;

      let report: RTCStatsReport;
      try {
        report = await receiver.getStats();
      } catch {
        continue;
      }

      let inb: Record<string, unknown> | null = null;
      report.forEach((r) => {
        if (r.type === "inbound-rtp" && (r as { kind?: string }).kind === "video") {
          inb = r as unknown as Record<string, unknown>;
        }
      });
      if (!inb) continue;
      const i = inb as Record<string, unknown>;

      const bytes = (i.bytesReceived as number) ?? 0;
      const last = rxLastBytes.get(peer.userId);
      const bitrateKbps = last !== undefined
        ? Math.max(0, Math.round(((bytes - last) * 8) / STATS_INTERVAL_MS))
        : 0;
      rxLastBytes.set(peer.userId, bytes);

      const stats: ScreenShareStats = {
        captureWidth: undefined,
        captureHeight: undefined,
        width: i.frameWidth as number | undefined,
        height: i.frameHeight as number | undefined,
        fps: i.framesPerSecond as number | undefined,
        bitrateKbps,
        limitation: undefined,
        encoder: undefined,
      };
      window.dispatchEvent(new CustomEvent("voice-screen-remote-stats", {
        detail: { userId: peer.userId, stats },
      }));
    }

    if (!anyVideo) stopRxStatsLoop();
  }, STATS_INTERVAL_MS);
}

function stopRxStatsLoop(): void {
  if (rxStatsTimer) {
    clearInterval(rxStatsTimer);
    rxStatsTimer = null;
  }
  rxLastBytes.clear();
}

export async function stopScreenShare(): Promise<void> {
  if (!screenStream) return;
  const stream = screenStream;
  screenStream = null;
  lastTunedCaptureHeight = null;
  stopStatsLoop();

  stream.getTracks().forEach((t) => t.stop());
  for (const peer of peers.values()) {
    const sender = peer.pc.getSenders().find((s) => s.track?.kind === "video");
    if (sender) {
      try {
        // removeTrack déclenche onnegotiationneeded → renégociation sans vidéo
        peer.pc.removeTrack(sender);
      } catch (e) {
        console.error("[voice] removeTrack:", e);
      }
    }
    sendSignal(peer.userId, { type: "voice-screen", hasScreen: false }).catch(() => {});
  }

  // Permet à l'UI (VoiceContext) de refléter l'arrêt même quand il vient
  // de l'UI native de capture et non du bouton de l'app
  window.dispatchEvent(new Event("voice-local-screen-ended"));
}

export function setMuted(muted: boolean): void {
  if (!localStream) return;
  localStream.getAudioTracks().forEach((t) => { t.enabled = !muted; });
}

export function isScreenSharing(): boolean {
  return screenStream !== null;
}

export function getScreenStream(): MediaStream | null {
  return screenStream;
}
