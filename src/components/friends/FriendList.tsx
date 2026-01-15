
interface FriendListProps {
  filter: string;
}

export default function FriendList({ filter }: FriendListProps) {

  const online_count = 5;

  return (
    <div>
      <p className="filter-text">{filter} - {online_count}</p>
      <div className="separator"></div>
    </div >
  )
}
