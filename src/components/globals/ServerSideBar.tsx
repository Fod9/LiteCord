import { useState } from "react"

import "../../styles/server-sidebar.css"

interface SideBarButtonProps {
  icon: React.ReactNode
  onClick: () => void
  selected?: boolean
  tooltip?: string
}

const ExempleButtonData = [
  {
    icon: <img src="https://picsum.photos/200" alt="Home" />,
    onClick: () => console.log("Home clicked"),
    tooltip: "Home",
  },
  {
    icon: <img src="https://picsum.photos/200" alt="Search" />,
    onClick: () => console.log("Search clicked"),
    tooltip: "Search",
  },
  {
    icon: <img src="https://picsum.photos/200" alt="Settings" />,
    onClick: () => console.log("Settings clicked"),
    tooltip: "Settings",
  },
]

function ToolTip(text: string) {
  return (
    <span className="tooltip-text" > {text}</ span >
  )
}

function SideBarButton({ icon, onClick, selected, tooltip }: SideBarButtonProps) {
  return (
    <div className="sidebar-container">
      {tooltip && ToolTip(tooltip)}
      <button className="sidebar-button">
        {icon}
      </button >
    </div >
  )
}

export default function SideBar() {

  const [elements, setElements] = useState(ExempleButtonData);

  return (
    <div className="sidebar">
      {elements.map((el, index) => (
        <SideBarButton
          key={index}
          icon={el.icon}
          onClick={el.onClick}
          tooltip={el.tooltip}
        />
      ))}
    </div>
  )
}
