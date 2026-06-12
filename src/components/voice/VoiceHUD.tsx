import { Mic, MicOff, Monitor, MonitorOff, PhoneOff } from "lucide-react";
import { useVoice } from "../../context/VoiceContext";
import "../../styles/voice.css";

interface Props {
  channelName?: string;
}

export default function VoiceHUD({ channelName }: Props) {
  const { currentChannelId, isMuted, isSharing, leave, toggleMute, toggleScreen } = useVoice();

  if (!currentChannelId) return null;

  return (
    <div className="voice-hud">
      <div className="voice-hud-info">
        <div className="voice-hud-connected">
          <span className="voice-hud-dot" />
          Vocal connecté
        </div>
        <div className="voice-hud-channel-name">
          🔊 {channelName ?? "…"}
        </div>
      </div>

      <div className="voice-hud-actions">
        <button
          className={`voice-hud-btn${isMuted ? " voice-hud-btn--muted" : ""}`}
          title={isMuted ? "Réactiver le micro" : "Couper le micro"}
          onClick={toggleMute}
        >
          {isMuted ? <MicOff size={15} /> : <Mic size={15} />}
        </button>

        <button
          className={`voice-hud-btn${isSharing ? " voice-hud-btn--active" : ""}`}
          title={isSharing ? "Arrêter le partage" : "Partager l'écran"}
          onClick={toggleScreen}
        >
          {isSharing ? <MonitorOff size={15} /> : <Monitor size={15} />}
        </button>

        <button
          className="voice-hud-btn voice-hud-btn--leave"
          title="Quitter le vocal"
          onClick={leave}
        >
          <PhoneOff size={15} />
        </button>
      </div>
    </div>
  );
}
