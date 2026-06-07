import { UserRound } from "lucide-react";
import type { FriendTab } from "../../routes/FriendPage";

interface FriendHeaderProps {
  activeTab: FriendTab;
  onTabChange: (tab: FriendTab) => void;
  pendingCount: number;
}

export default function FriendHeader({ activeTab, onTabChange, pendingCount }: FriendHeaderProps) {
  return (
    <div className="friends-topbar">
      <UserRound size={20} color="var(--text-muted)" />
      <span className="friends-topbar-title">Amis</span>
      <div className="friends-topbar-divider" />
      <div className="tabs">
        {(["En ligne", "Tous", "En attente"] as FriendTab[]).map((tab) => (
          <button
            key={tab}
            className={`tab ${activeTab === tab ? "active" : ""}`}
            onClick={() => onTabChange(tab)}
          >
            {tab}
            {tab === "En attente" && pendingCount > 0 && (
              <span className="pending-badge">{pendingCount}</span>
            )}
          </button>
        ))}
        <button
          className={`tab tab-add ${activeTab === "Ajouter" ? "active" : ""}`}
          onClick={() => onTabChange("Ajouter")}
        >
          Ajouter un ami
        </button>
      </div>
    </div>
  );
}
