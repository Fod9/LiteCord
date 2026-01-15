import { UserRound } from "lucide-react"
import { useState } from "react"
import { MessageCirclePlus } from "lucide-react"

export default function FriendHeader() {

  const [selectedButton, setSelectedButton] = useState<'all' | 'online'>('all');

  return (
    <div className="header">
      <div className="left">
        <UserRound />
        <h1>amis</h1>
        <div className="header-actions">
          <button className={`action-button ${selectedButton == "all" ? "selected" : ""}`} onClick={
            () => setSelectedButton('all')
          }>Tous</button>
          <button className={`action-button ${selectedButton == "online" ? "selected" : ""}`} onClick={
            () => setSelectedButton('online')
          }>En ligne</button>
          <button className="action-button cta">Ajouter</button>
        </div>
      </div>
      <MessageCirclePlus />
    </div >
  )
}
