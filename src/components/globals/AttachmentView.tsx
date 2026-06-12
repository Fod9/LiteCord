import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Download, Loader2, CheckCircle, ImageOff, FileX, Music } from "lucide-react";
import type { Attachment } from "../../services/channels";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "svg"]);
const AUDIO_EXTS = new Set(["mp3", "ogg", "wav", "flac", "m4a", "opus"]);

type DlState = "idle" | "downloading" | "done";

function BrokenPlaceholder({ filename, type }: { filename: string; type: "image" | "audio" | "file" }) {
  const Icon = type === "image" ? ImageOff : type === "audio" ? Music : FileX;
  return (
    <div className="att-broken">
      <Icon size={16} className="att-broken-icon" />
      <span className="att-broken-name">{filename}</span>
      <span className="att-broken-label">Fichier indisponible</span>
    </div>
  );
}

export function AttachmentView({ att }: { att: Attachment }) {
  const ext = att.filename.split(".").pop()?.toLowerCase() ?? "";
  const [dlState, setDlState] = useState<DlState>("idle");
  const [broken, setBroken] = useState(false);

  async function handleDownload(e: React.MouseEvent) {
    e.preventDefault();
    if (dlState !== "idle") return;
    setDlState("downloading");
    try {
      await invoke("download_attachment", { url: att.url, filename: att.filename });
      setDlState("done");
      setTimeout(() => setDlState("idle"), 2000);
    } catch (err) {
      const msg = String(err).toLowerCase();
      if (msg.includes("indisponible") || msg.includes("404")) {
        setBroken(true);
      }
      setDlState("idle");
    }
  }

  if (broken) {
    const type = IMAGE_EXTS.has(ext) ? "image" : AUDIO_EXTS.has(ext) ? "audio" : "file";
    return <BrokenPlaceholder filename={att.filename} type={type} />;
  }

  if (IMAGE_EXTS.has(ext)) {
    return (
      <div className="att-image-wrap">
        <img
          src={att.url}
          alt={att.filename}
          className="att-image"
          onError={() => setBroken(true)}
        />
        <button
          className="att-image-dl"
          onClick={handleDownload}
          title={`Télécharger ${att.filename}`}
        >
          {dlState === "downloading" ? (
            <Loader2 size={14} className="att-spin" />
          ) : dlState === "done" ? (
            <CheckCircle size={14} />
          ) : (
            <Download size={14} />
          )}
        </button>
      </div>
    );
  }

  if (AUDIO_EXTS.has(ext)) {
    return (
      <div className="att-audio">
        <span className="att-filename">{att.filename}</span>
        <audio controls src={att.url} onError={() => setBroken(true)} />
      </div>
    );
  }

  const kb = (att.size / 1024).toFixed(1);
  return (
    <button
      className={`att-file att-file--${dlState}`}
      onClick={handleDownload}
      disabled={dlState !== "idle"}
    >
      <span className="att-file-icon">
        {dlState === "downloading" ? (
          <Loader2 size={14} className="att-spin" />
        ) : dlState === "done" ? (
          <CheckCircle size={14} className="att-done-icon" />
        ) : (
          <Download size={14} />
        )}
      </span>
      <span className="att-file-name">{att.filename}</span>
      <span className="att-size">{kb} KB</span>
      <span className="att-dl-label">
        {dlState === "downloading" ? "Téléchargement…" : dlState === "done" ? "Téléchargé !" : "Télécharger"}
      </span>
    </button>
  );
}
