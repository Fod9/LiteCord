import { useState } from "react";
import FriendHeader from "../components/friends/FriendHeader";
import FriendList from "../components/friends/FriendList";
import FriendSearchBar from "../components/friends/FriendSearchBar";
import AddFriendPanel from "../components/friends/AddFriendPanel";
import { updateTitle } from "../utils/windows-helper";
import { useUnread } from "../context/UnreadContext";
import "../styles/friends.css";

export type FriendTab = "Tous" | "En ligne" | "En attente" | "Ajouter";

export interface SimpleUser {
  id: string;
  name: string;
  display_name: string;
  profile_picture: string;
}

export default function FriendPage() {
  updateTitle("Amis - LiteCord");
  const [activeTab, setActiveTab] = useState<FriendTab>("En ligne");
  const [searchQuery, setSearchQuery] = useState("");
  const { pendingFriendRequests, setPendingFriendRequests, registerFriendPendingRefresh, registerFriendListRefresh } = useUnread();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <FriendHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        pendingCount={pendingFriendRequests}
      />
      <div className="fr-body">
        {activeTab === "Ajouter" ? (
          <AddFriendPanel />
        ) : (
          <>
            {activeTab !== "En attente" && (
              <FriendSearchBar value={searchQuery} onChange={setSearchQuery} />
            )}
            <FriendList
              filter={activeTab}
              query={searchQuery}
              onPendingCountChange={setPendingFriendRequests}
              onRegisterRefreshPending={registerFriendPendingRefresh}
              onRegisterRefreshFriends={registerFriendListRefresh}
            />
          </>
        )}
      </div>
    </div>
  );
}
