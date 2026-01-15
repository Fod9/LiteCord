import ChannelsSideBar from "./ChannelsSideBar";
import FriendSideBar from "./FriendSideBar";

interface AdaptableSideBarProps {
  mode: 'channels' | 'pm';
}

export default function AdaptableSideBar({ mode }: AdaptableSideBarProps) {
  return (
    <div className="adaptable-sidebar">
      {
        mode === 'channels' ? (
          <ChannelsSideBar />
        ) : (
          <FriendSideBar />
        )
      }
    </div >
  )
}
