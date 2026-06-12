import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => undefined),
}));

// Capture les handlers d'événements Tauri par nom d'événement
const eventHandlers = new Map<string, (event: { payload: unknown }) => void>();
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (name: string, handler: (event: { payload: unknown }) => void) => {
    eventHandlers.set(name, handler);
    return () => eventHandlers.delete(name);
  }),
}));

import { invoke } from "@tauri-apps/api/core";

// ─── Mock RTCPeerConnection ──────────────────────────────────────────────────

class MockRTCPeerConnection {
  static instances: MockRTCPeerConnection[] = [];

  signalingState = "stable";
  connectionState = "new";
  iceConnectionState = "new";
  localDescription: { type: string; sdp: string } | null = null;

  onnegotiationneeded: (() => void) | null = null;
  onicecandidate: ((e: unknown) => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  ontrack: ((e: unknown) => void) | null = null;

  setRemoteDescription = vi.fn(async (desc: { type: string }) => {
    this.signalingState = desc.type === "offer" ? "have-remote-offer" : "stable";
  });
  setLocalDescription = vi.fn(async () => {
    const type = this.signalingState === "have-remote-offer" ? "answer" : "offer";
    this.localDescription = { type, sdp: `mock-${type}-sdp` };
    this.signalingState = type === "offer" ? "have-local-offer" : "stable";
  });
  addIceCandidate = vi.fn(async () => undefined);
  addTrack = vi.fn(() => ({ track: null }));
  getSenders = vi.fn(() => []);
  getTransceivers = vi.fn(() => []);
  restartIce = vi.fn();
  close = vi.fn();

  constructor() {
    MockRTCPeerConnection.instances.push(this);
  }
}

function fakeMediaStream(): MediaStream {
  return {
    getTracks: () => [],
    getAudioTracks: () => [],
    getVideoTracks: () => [],
  } as unknown as MediaStream;
}

async function emitSignal(from: string, signal: object): Promise<void> {
  const handler = eventHandlers.get("p2p-signal");
  expect(handler).toBeDefined();
  await handler!({ payload: { from, content: JSON.stringify(signal), message_type: "relay" } });
}

function relayedSignals(): Array<{ to: string; signal: { type: string; sdp?: string } }> {
  return vi
    .mocked(invoke)
    .mock.calls.filter(([cmd]) => cmd === "relay_signal")
    .map(([, args]) => {
      const a = args as { to: string; content: string };
      return { to: a.to, signal: JSON.parse(a.content) };
    });
}

// Chaque test repart d'un module neuf (le service a un état module-level)
async function freshVoiceModule() {
  vi.resetModules();
  return import("../voice");
}

beforeEach(() => {
  vi.clearAllMocks();
  eventHandlers.clear();
  MockRTCPeerConnection.instances = [];
  vi.stubGlobal("RTCPeerConnection", MockRTCPeerConnection);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => fakeMediaStream()) },
  });
});

describe("computeScreenEncoding", () => {
  it("réduit la résolution de capture native vers le preset choisi", async () => {
    const voice = await freshVoiceModule();
    // Écran Retina capturé en 2160 de haut, preset 1080 → scale 2
    expect(voice.computeScreenEncoding(2160, 1080, 30).scaleResolutionDownBy).toBe(2);
    // Capture 1964 (MacBook 16"), preset 720
    expect(voice.computeScreenEncoding(1964, 720, 30).scaleResolutionDownBy).toBeCloseTo(1964 / 720);
  });

  it("ne fait jamais d'upscale (scale >= 1)", async () => {
    const voice = await freshVoiceModule();
    // Capture 1080, preset 1440 → on garde la capture telle quelle
    expect(voice.computeScreenEncoding(1080, 1440, 30).scaleResolutionDownBy).toBe(1);
  });

  it("retombe sur scale 1 quand la hauteur de capture est inconnue", async () => {
    const voice = await freshVoiceModule();
    expect(voice.computeScreenEncoding(undefined, 1080, 30).scaleResolutionDownBy).toBe(1);
  });

  it("augmente le bitrate en 60 fps et cape le framerate au choix utilisateur", async () => {
    const voice = await freshVoiceModule();
    const at30 = voice.computeScreenEncoding(2160, 1080, 30);
    const at60 = voice.computeScreenEncoding(2160, 1080, 60);
    expect(at60.maxBitrate).toBeGreaterThan(at30.maxBitrate);
    expect(at30.maxFramerate).toBe(30);
    expect(at60.maxFramerate).toBe(60);
  });

  it("alloue plus de bitrate aux presets plus hauts", async () => {
    const voice = await freshVoiceModule();
    const bitrates = ([480, 720, 1080, 1440] as const).map(
      (q) => voice.computeScreenEncoding(2160, q, 30).maxBitrate,
    );
    for (let i = 1; i < bitrates.length; i++) {
      expect(bitrates[i]).toBeGreaterThan(bitrates[i - 1]);
    }
  });
});

describe("boostVideoSdp", () => {
  const SDP = [
    "v=0",
    "m=audio 9 UDP/TLS/RTP/SAVPF 111",
    "a=rtpmap:111 opus/48000/2",
    "a=fmtp:111 minptime=10;useinbandfec=1",
    "m=video 9 UDP/TLS/RTP/SAVPF 96 97 98",
    "a=rtpmap:96 H264/90000",
    "a=fmtp:96 profile-level-id=42e01f;packetization-mode=1",
    "a=rtpmap:97 rtx/90000",
    "a=fmtp:97 apt=96",
    "a=rtpmap:98 VP8/90000",
    "",
  ].join("\r\n");

  it("ajoute les bitrates x-google aux fmtp des codecs vidéo existants", async () => {
    const voice = await freshVoiceModule();
    const out = voice.boostVideoSdp(SDP);
    const h264Fmtp = out.split("\r\n").find((l) => l.startsWith("a=fmtp:96"));
    expect(h264Fmtp).toContain("profile-level-id=42e01f");
    expect(h264Fmtp).toContain("x-google-start-bitrate");
    expect(h264Fmtp).toContain("x-google-min-bitrate");
  });

  it("crée une ligne fmtp pour les codecs vidéo qui n'en ont pas (VP8)", async () => {
    const voice = await freshVoiceModule();
    const out = voice.boostVideoSdp(SDP);
    const vp8Fmtp = out.split("\r\n").find((l) => l.startsWith("a=fmtp:98"));
    expect(vp8Fmtp).toContain("x-google-start-bitrate");
  });

  it("ne touche ni à l'audio ni aux codecs RTX", async () => {
    const voice = await freshVoiceModule();
    const out = voice.boostVideoSdp(SDP);
    const opusFmtp = out.split("\r\n").find((l) => l.startsWith("a=fmtp:111"));
    const rtxFmtp = out.split("\r\n").find((l) => l.startsWith("a=fmtp:97"));
    expect(opusFmtp).toBe("a=fmtp:111 minptime=10;useinbandfec=1");
    expect(rtxFmtp).toBe("a=fmtp:97 apt=96");
  });

  it("retourne le SDP inchangé s'il n'y a pas de vidéo", async () => {
    const voice = await freshVoiceModule();
    const audioOnly = "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\n";
    expect(voice.boostVideoSdp(audioOnly)).toBe(audioOnly);
  });
});

describe("orderScreenCodecs", () => {
  const codecs = [
    { mimeType: "video/rtx" },
    { mimeType: "video/VP8" },
    { mimeType: "video/H264", sdpFmtpLine: "profile-level-id=42e01f" },
    { mimeType: "video/H264", sdpFmtpLine: "profile-level-id=640c1f" },
    { mimeType: "video/VP9", sdpFmtpLine: "profile-id=0" },
  ];

  it("en 30 fps (netteté) : VP9 > VP8 > H264 — libvpx raffine le texte statique", async () => {
    const voice = await freshVoiceModule();
    const ordered = voice.orderScreenCodecs(codecs, 30).map((c) => c.mimeType);
    expect(ordered.slice(0, 3)).toEqual(["video/VP9", "video/VP8", "video/H264"]);
  });

  it("en 60 fps (fluidité) : H264 d'abord (GPU), profil High avant Baseline", async () => {
    const voice = await freshVoiceModule();
    const ordered = voice.orderScreenCodecs(codecs, 60);
    expect(ordered[0].mimeType).toBe("video/H264");
    expect(ordered[0].sdpFmtpLine).toContain("640c1f"); // High
    expect(ordered[1].sdpFmtpLine).toContain("42e01f"); // Baseline ensuite
  });

  it("conserve tous les codecs (rtx inclus, relégué en fin)", async () => {
    const voice = await freshVoiceModule();
    const ordered = voice.orderScreenCodecs(codecs, 30);
    expect(ordered).toHaveLength(codecs.length);
    expect(ordered[ordered.length - 1].mimeType).toBe("video/rtx");
  });
});

describe("isPolitePeer", () => {
  it("est déterministe et asymétrique entre deux pairs", async () => {
    const voice = await freshVoiceModule();
    expect(voice.isPolitePeer("user:aaa", "user:bbb")).not.toBe(
      voice.isPolitePeer("user:bbb", "user:aaa"),
    );
    // Stable d'un appel à l'autre
    expect(voice.isPolitePeer("user:aaa", "user:bbb")).toBe(
      voice.isPolitePeer("user:aaa", "user:bbb"),
    );
  });
});

describe("négociation entrante", () => {
  it("répond à une voice-offer par une voice-answer", async () => {
    const voice = await freshVoiceModule();
    voice.initVoice("user:me", () => {});
    await voice.joinVoiceChannel("guild:1", "channel:1");

    await emitSignal("user:them", { type: "voice-offer", sdp: "their-offer-sdp" });

    const answers = relayedSignals().filter((s) => s.signal.type === "voice-answer");
    expect(answers).toHaveLength(1);
    expect(answers[0].to).toBe("user:them");
    expect(answers[0].signal.sdp).toBe("mock-answer-sdp");
  });

  it("ignore les offres reçues hors d'un salon vocal", async () => {
    const voice = await freshVoiceModule();
    voice.initVoice("user:me", () => {});
    // Pas de joinVoiceChannel → pas de micro → pas en vocal

    await emitSignal("user:them", { type: "voice-offer", sdp: "their-offer-sdp" });

    expect(relayedSignals()).toHaveLength(0);
    expect(MockRTCPeerConnection.instances).toHaveLength(0);
  });

  it("le pair impoli ignore une offre en collision, le pair poli l'accepte", async () => {
    // "user:zzz" > "user:aaa" → face à user:aaa, nous (zzz) sommes impolis
    const voice = await freshVoiceModule();
    voice.initVoice("user:zzz", () => {});
    await voice.joinVoiceChannel("guild:1", "channel:1");

    // Simule une offre locale en cours (signalingState non stable)
    await emitSignal("user:aaa", { type: "voice-offer", sdp: "first-offer" });
    const pc = MockRTCPeerConnection.instances[0];
    pc.signalingState = "have-local-offer"; // collision artificielle
    pc.setRemoteDescription.mockClear();

    await emitSignal("user:aaa", { type: "voice-offer", sdp: "colliding-offer" });
    expect(pc.setRemoteDescription).not.toHaveBeenCalled();

    // Pair poli ("user:aaa" < tout) : même collision → il accepte (rollback implicite)
    const voice2 = await freshVoiceModule();
    eventHandlers.clear();
    MockRTCPeerConnection.instances = [];
    voice2.initVoice("user:aaa", () => {});
    await voice2.joinVoiceChannel("guild:1", "channel:1");

    await emitSignal("user:zzz", { type: "voice-offer", sdp: "first-offer" });
    const pc2 = MockRTCPeerConnection.instances[0];
    pc2.signalingState = "have-local-offer";
    pc2.setRemoteDescription.mockClear();

    await emitSignal("user:zzz", { type: "voice-offer", sdp: "colliding-offer" });
    expect(pc2.setRemoteDescription).toHaveBeenCalledWith({ type: "offer", sdp: "colliding-offer" });
  });

  it("ignore une voice-answer inattendue (pair inconnu ou état stable)", async () => {
    const voice = await freshVoiceModule();
    voice.initVoice("user:me", () => {});
    await voice.joinVoiceChannel("guild:1", "channel:1");

    // Pair inconnu → ne crash pas
    await emitSignal("user:ghost", { type: "voice-answer", sdp: "stray" });

    // Pair connu mais en état stable (answer périmée) → ignorée
    await emitSignal("user:them", { type: "voice-offer", sdp: "offer" });
    const pc = MockRTCPeerConnection.instances[0];
    pc.setRemoteDescription.mockClear();
    await emitSignal("user:them", { type: "voice-answer", sdp: "stale" });
    expect(pc.setRemoteDescription).not.toHaveBeenCalled();
  });

  it("applique les candidats ICE reçus après l'offre", async () => {
    const voice = await freshVoiceModule();
    voice.initVoice("user:me", () => {});
    await voice.joinVoiceChannel("guild:1", "channel:1");

    await emitSignal("user:them", { type: "voice-offer", sdp: "offer" });
    const pc = MockRTCPeerConnection.instances[0];

    await emitSignal("user:them", { type: "voice-ice", candidate: { candidate: "c1" } });
    expect(pc.addIceCandidate).toHaveBeenCalledWith({ candidate: "c1" });
  });

  it("ferme la connexion quand le pair quitte le vocal", async () => {
    const voice = await freshVoiceModule();
    voice.initVoice("user:me", () => {});
    await voice.joinVoiceChannel("guild:1", "channel:1");

    await emitSignal("user:them", { type: "voice-offer", sdp: "offer" });
    const pc = MockRTCPeerConnection.instances[0];

    await emitSignal("user:them", { type: "voice-leave" });
    expect(pc.close).toHaveBeenCalled();
  });
});
