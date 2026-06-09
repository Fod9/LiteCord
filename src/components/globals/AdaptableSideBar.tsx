import ChannelsSideBar from "./ChannelsSideBar";
import FriendSideBar from "./PrivateMessageSideBar";
import { useGuild } from "../../context/GuildContext";

export default function AdaptableSideBar() {
  const { selectedGuild } = useGuild();

  return (
    <div className="adaptable-sidebar">
      {selectedGuild ? <ChannelsSideBar /> : <FriendSideBar />}
    </div>
  );
}
