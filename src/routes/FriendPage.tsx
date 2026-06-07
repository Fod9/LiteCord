import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import FriendHeader from "../components/friends/FriendHeader";
import FriendList from "../components/friends/FriendList";
import FriendSearchBar from "../components/friends/FriendSearchBar";
import AddFriendPanel from "../components/friends/AddFriendPanel";
import { updateTitle } from "../utils/windows-helper";
import { createDmChannel } from "../services/channels";
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
  const [pendingCount, setPendingCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [userCache, setUserCache] = useState<Record<string, SimpleUser>>({});

  const refreshPendingRef = useRef<(() => void) | null>(null);
  const refreshFriendsRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const unlistenRequest = listen<{ friendship: unknown; from_user: SimpleUser }>(
      "friend-request",
      (event) => {
        const { from_user } = event.payload;
        setUserCache((prev) => ({ ...prev, [from_user.id]: from_user }));
        setPendingCount((prev) => prev + 1);
        refreshPendingRef.current?.();
      }
    );

    const unlistenUpdated = listen<{ friendship: unknown; from_user: SimpleUser }>(
      "friend-request-updated",
      (event) => {
        const { from_user } = event.payload;
        setUserCache((prev) => ({ ...prev, [from_user.id]: from_user }));
        refreshFriendsRef.current?.();
        refreshPendingRef.current?.();
        // L'autre a accepté notre demande → créer le DM channel automatiquement
        createDmChannel([from_user.id])
          .then(() => window.dispatchEvent(new CustomEvent("refresh-dm-channels")))
          .catch(console.error);
      }
    );

    return () => {
      unlistenRequest.then((fn) => fn());
      unlistenUpdated.then((fn) => fn());
    };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <FriendHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        pendingCount={pendingCount}
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
              onPendingCountChange={setPendingCount}
              onRegisterRefreshPending={(fn) => { refreshPendingRef.current = fn; }}
              onRegisterRefreshFriends={(fn) => { refreshFriendsRef.current = fn; }}
            />
          </>
        )}
      </div>
    </div>
  );
}
