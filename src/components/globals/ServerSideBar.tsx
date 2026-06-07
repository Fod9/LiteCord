import "../../styles/server-sidebar.css";

export default function ServerSideBar() {
  return (
    <div className="rail">
      <button className="rail-item rail-home active" data-tooltip="Messages privés">
        <span style={{ fontSize: 18 }}>✦</span>
      </button>
      <div className="rail-sep" />
      <button className="rail-item" data-tooltip="Serveur 1">S1</button>
      <button
        className="rail-item"
        data-tooltip="Serveur 2"
        style={{ background: "linear-gradient(135deg,#34d399,#0ea5e9)" }}
      >
        S2
      </button>
      <button className="rail-add rail-item" data-tooltip="Ajouter un serveur">+</button>
    </div>
  );
}
