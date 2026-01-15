import FriendHeader from "../components/friends/FriendHeader";
import { updateTitle } from "../utils/windows-helper";

import "../styles/friends.css";
import FriendSearchBar from "../components/friends/FriendSearchBar";
import FriendList from "../components/friends/FriendList";
import WebSocketTest from "../components/websocket/WebsocketButton";

export default function FriendPage() {
  updateTitle('Amis - LiteCord');

  return (
    <div className="content">
      <FriendHeader />
      <FriendSearchBar />
      <FriendList filter="En ligne" />
      <WebSocketTest />
    </div>
  )
}
