import FriendHeader from "../components/friends/FriendHeader";
import { updateTitle } from "../utils/windows-helper";

import "../styles/friends.css";
import FriendSearchBar from "../components/friends/FriendSearchBar";

export default function FriendPage() {
  updateTitle('Amis - LiteCord');

  return (
    <div className="content">
      <FriendHeader />
      <FriendSearchBar />
    </div>
  )
}
