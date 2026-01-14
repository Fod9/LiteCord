import { SearchIcon } from "lucide-react"

export default function FriendSearchBar() {
  return (
    <div className="friend-search-bar">
      <SearchIcon />
      <input type="text" placeholder="Rechercher" />
    </div>
  )
}
