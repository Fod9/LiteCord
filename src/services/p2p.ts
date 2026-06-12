import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const CHUNK_SIZE = 256 * 1024; // 256 KB
const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

export const P2P_THRESHOLD = 200 * 1024 * 1024; // 200 MB

// ─── Types ────────────────────────────────────────────────────────────────────

interface Signal {
  type: "p2p-offer" | "p2p-answer" | "p2p-ice" | "p2p-cancel";
  transferId: string;
  sdp?: string;
  candidate?: RTCIceCandidateInit;
  filename?: string;
  fileSize?: number;
}

interface ActiveTransfer {
  pc: RTCPeerConnection;
  transferId: string;
  fromUserId?: string;
  toUserId?: string;
  filename: string;
  fileSize: number;
  bytesTransferred: number;
  pendingCandidates: RTCIceCandidateInit[];
  remoteSet: boolean;
  onProgress: (bytes: number, total: number) => void;
  onDone: () => void;
  onError: (err: string) => void;
}

export interface P2PCallbacks {
  onProgress: (bytes: number, total: number) => void;
  onDone: () => void;
  onError: (err: string) => void;
}

export type IncomingFactory = (
  transferId: string,
  filename: string,
  fileSize: number,
  fromUserId: string,
) => P2PCallbacks;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Encode un ArrayBuffer en base64 pour l'IPC Tauri (payload ~33% vs ~300% pour JSON array). */
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const len = bytes.length;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// ─── State ────────────────────────────────────────────────────────────────────

const transfers = new Map<string, ActiveTransfer>();
let unlistenSignal: (() => void) | null = null;

// ─── Signal helpers ───────────────────────────────────────────────────────────

async function sendSignal(to: string, signal: Signal): Promise<void> {
  await invoke("relay_signal", { to, content: JSON.stringify(signal) });
}

async function addIceCandidate(transfer: ActiveTransfer, candidate: RTCIceCandidateInit): Promise<void> {
  if (transfer.remoteSet) {
    await transfer.pc.addIceCandidate(candidate).catch(console.error);
  } else {
    transfer.pendingCandidates.push(candidate);
  }
}

async function flushCandidates(transfer: ActiveTransfer): Promise<void> {
  for (const c of transfer.pendingCandidates) {
    await transfer.pc.addIceCandidate(c).catch(console.error);
  }
  transfer.pendingCandidates = [];
}

// ─── Incoming signal handlers ─────────────────────────────────────────────────

async function handleOffer(fromUserId: string, signal: Signal, factory?: IncomingFactory): Promise<void> {
  const { transferId, sdp, filename, fileSize } = signal;
  if (!sdp || !filename || fileSize == null) return;

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

  const callbacks: P2PCallbacks = factory
    ? factory(transferId, filename, fileSize, fromUserId)
    : { onProgress: () => {}, onDone: () => {}, onError: () => {} };

  const transfer: ActiveTransfer = {
    pc, transferId, fromUserId, filename, fileSize,
    bytesTransferred: 0,
    pendingCandidates: [],
    remoteSet: false,
    ...callbacks,
  };
  transfers.set(transferId, transfer);

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      sendSignal(fromUserId, { type: "p2p-ice", transferId, candidate: e.candidate.toJSON() });
    }
  };

  pc.ondatachannel = (e) => {
    const ch = e.channel;
    ch.binaryType = "arraybuffer";

    // Queue ensures chunks are written to disk one at a time — no concurrent IPC calls.
    const queue: (ArrayBuffer | string)[] = [];
    let draining = false;
    let finished = false;

    async function drain() {
      if (draining) return;
      draining = true;
      while (queue.length > 0) {
        const item = queue.shift()!;
        if (typeof item === "string") {
          let ctrl: { type: string };
          try { ctrl = JSON.parse(item); } catch { continue; }
          if (ctrl.type === "done") {
            await invoke("p2p_receive_finish", { transferId }).catch(console.error);
            finished = true;
            transfers.delete(transferId);
            transfer.onDone();
            // Acknowledge to sender then close our side cleanly
            try { ch.send(JSON.stringify({ type: "done-ack" })); } catch {}
            setTimeout(() => { try { pc.close(); } catch {} }, 500);
            break;
          }
        } else {
          const buf = item as ArrayBuffer;
          transfer.bytesTransferred += buf.byteLength;
          transfer.onProgress(transfer.bytesTransferred, transfer.fileSize);
          await invoke("p2p_receive_chunk", {
            transferId,
            data: bufferToBase64(buf),
          }).catch(console.error);
        }
      }
      draining = false;
    }

    ch.onmessage = (ev) => {
      queue.push(ev.data as ArrayBuffer | string);
      drain();
    };

    ch.onerror = () => {
      if (finished) return;
      transfer.onError("Erreur DataChannel");
      cleanupReceive(transferId);
    };

    ch.onclose = () => {
      if (!finished && transfers.has(transferId)) {
        transfer.onError("Connexion fermée avant la fin du transfert");
        cleanupReceive(transferId);
      }
    };
  };

  await pc.setRemoteDescription({ type: "offer", sdp });
  transfer.remoteSet = true;
  await flushCandidates(transfer);

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  await invoke("p2p_receive_start", { transferId, filename });
  await sendSignal(fromUserId, { type: "p2p-answer", transferId, sdp: answer.sdp ?? "" });
}

async function handleAnswer(transferId: string, signal: Signal): Promise<void> {
  const transfer = transfers.get(transferId);
  if (!transfer || !signal.sdp) return;
  await transfer.pc.setRemoteDescription({ type: "answer", sdp: signal.sdp });
  transfer.remoteSet = true;
  await flushCandidates(transfer);
}

async function handleIce(transferId: string, signal: Signal): Promise<void> {
  const transfer = transfers.get(transferId);
  if (!transfer || !signal.candidate) return;
  await addIceCandidate(transfer, signal.candidate);
}

async function handleRemoteCancel(transferId: string): Promise<void> {
  const transfer = transfers.get(transferId);
  if (!transfer) return;
  transfer.pc.close();
  transfers.delete(transferId);
  await invoke("p2p_cancel", { transferId }).catch(console.error);
  transfer.onError("Transfert annulé par l'expéditeur");
}

function cleanupReceive(transferId: string): void {
  const transfer = transfers.get(transferId);
  if (!transfer) return;
  transfer.pc.close();
  transfers.delete(transferId);
  invoke("p2p_cancel", { transferId }).catch(console.error);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * À appeler une fois au démarrage (ex: quand l'utilisateur est authentifié).
 * Idempotent — plusieurs appels n'enregistrent qu'un seul listener.
 *
 * @param factory Appelé quand un offer entrant arrive — retourne les callbacks de progression.
 */
export function initP2P(factory?: IncomingFactory): () => void {
  if (unlistenSignal) {
    // Re-register factory by replacing the listener
    unlistenSignal();
    unlistenSignal = null;
  }

  const listenerPromise = listen<{ from: string; content: unknown; message_type: string }>(
    "p2p-signal",
    async (event) => {
      const { from, content } = event.payload;
      let signal: Signal;
      try {
        signal = typeof content === "string" ? JSON.parse(content) : (content as Signal);
      } catch {
        return;
      }

      const { type, transferId } = signal;
      if (type === "p2p-offer") {
        await handleOffer(from, signal, factory);
      } else if (type === "p2p-answer") {
        await handleAnswer(transferId, signal);
      } else if (type === "p2p-ice") {
        await handleIce(transferId, signal);
      } else if (type === "p2p-cancel") {
        await handleRemoteCancel(transferId);
      }
    },
  );

  listenerPromise.then((fn) => { unlistenSignal = fn; });

  return () => {
    listenerPromise.then((fn) => fn());
    unlistenSignal = null;
  };
}

/**
 * Envoie un fichier >200 MB en P2P via WebRTC Data Channels.
 * Lit le fichier par chunks dans Rust (pas de chargement en RAM).
 *
 * @returns transferId — à passer à cancelP2P() si besoin d'annuler
 */
export async function sendFileP2P(
  toUserId: string,
  filePath: string,
  filename: string,
  fileSize: number,
  callbacks: P2PCallbacks,
): Promise<string> {
  const transferId = crypto.randomUUID();
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const channel = pc.createDataChannel("file", { ordered: true });
  channel.binaryType = "arraybuffer";
  channel.bufferedAmountLowThreshold = CHUNK_SIZE * 4;

  const transfer: ActiveTransfer = {
    pc, transferId, toUserId, filename, fileSize,
    bytesTransferred: 0,
    pendingCandidates: [],
    remoteSet: false,
    ...callbacks,
  };
  transfers.set(transferId, transfer);

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      sendSignal(toUserId, { type: "p2p-ice", transferId, candidate: e.candidate.toJSON() });
    }
  };

  // Sender waits for done-ack from receiver before closing
  channel.onmessage = (ev) => {
    if (typeof ev.data === "string") {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "done-ack") {
          channel.close();
          pc.close();
          transfers.delete(transferId);
          callbacks.onDone();
        }
      } catch {}
    }
  };

  channel.onopen = async () => {
    let offset = 0;

    const waitForDrain = (): Promise<void> =>
      new Promise((resolve) => {
        if (channel.bufferedAmount <= channel.bufferedAmountLowThreshold) {
          resolve();
        } else {
          const handler = () => { channel.removeEventListener("bufferedamountlow", handler); resolve(); };
          channel.addEventListener("bufferedamountlow", handler);
        }
      });

    // Pipelining : lit le chunk N+1 en IPC pendant qu'on envoie le chunk N.
    // ipc::Response retourne un ArrayBuffer binaire — pas de JSON, pas de conversion.
    const readChunk = (off: number): Promise<ArrayBuffer> =>
      invoke<ArrayBuffer>("p2p_read_chunk", { path: filePath, offset: off, chunkSize: CHUNK_SIZE });

    try {
      let nextPromise: Promise<ArrayBuffer> = readChunk(offset);

      while (offset < fileSize) {
        const buffer = await nextPromise;
        if (buffer.byteLength === 0) break;

        const nextOffset = offset + buffer.byteLength;
        transfer.bytesTransferred = nextOffset;

        // Lancer la lecture suivante pendant qu'on gère le flow control + send
        if (nextOffset < fileSize) {
          nextPromise = readChunk(nextOffset);
        }

        if (channel.bufferedAmount > CHUNK_SIZE * 8) {
          await waitForDrain();
        }

        channel.send(buffer); // ArrayBuffer direct, aucune conversion
        offset = nextOffset;
        callbacks.onProgress(offset, fileSize);
      }

      channel.send(JSON.stringify({ type: "done", transferId }));
    } catch (e) {
      callbacks.onError(String(e));
      cancelP2P(transferId);
    }
  };

  channel.onerror = () => {
    callbacks.onError("Erreur DataChannel");
    cancelP2P(transferId);
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  await sendSignal(toUserId, {
    type: "p2p-offer",
    transferId,
    filename,
    fileSize,
    sdp: offer.sdp ?? "",
  });

  return transferId;
}

/** Annule un transfert en cours (envoi ou réception). */
export function cancelP2P(transferId: string): void {
  const transfer = transfers.get(transferId);
  if (!transfer) return;

  const target = transfer.toUserId ?? transfer.fromUserId;
  if (target) {
    sendSignal(target, { type: "p2p-cancel", transferId }).catch(console.error);
  }

  transfer.pc.close();
  transfers.delete(transferId);
  invoke("p2p_cancel", { transferId }).catch(console.error);
}
