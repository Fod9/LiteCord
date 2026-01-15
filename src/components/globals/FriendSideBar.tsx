import { useState } from "react";
import "../../styles/friend-sidebar.css"
import { Plus } from "lucide-react";

const fake_friends = [
  { id: 1, name: "Alice", pp: "https://picsum.photos/200" },
  { id: 2, name: "Bob", pp: "https://picsum.photos/200" },
  { id: 3, name: "Charlie", pp: "https://picsum.photos/200" },
];

interface FriendEntryProps {
  friend: { id: number; name: string; pp: string };
  selected?: boolean;
  onclick?: () => void;
}

function FriendEntry({ friend, selected, onclick }: FriendEntryProps) {
  return (
    <div className={`friend-entry ${selected ? "selected" : ""}`
    } onClick={onclick} >
      <img src={friend.pp} alt={`${friend.name}'s profile picture`} className="friend-pp" />
      <span className="friend-name">{friend.name}</span>
    </div >
  )
}

export default function FriendSideBar() {

  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div className="friend-sidebar">
      <div className="indicator-header">
        <p>Messages privés</p>
        <Plus />
      </div>
      {
        fake_friends.map(friend => (
          <FriendEntry key={friend.id} friend={friend} onclick={
            () => setSelected(friend.id)
          } selected={selected === friend.id
          } />
        ))
      }
    </div >
  )
}
