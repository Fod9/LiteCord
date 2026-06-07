import React, { useState, useRef, useEffect } from "react";

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap');

.lc * { box-sizing: border-box; margin: 0; padding: 0; }
.lc {
  --bg-base:#0d0d14; --bg-sidebar:#0f0f1a; --bg-main:#13131f; --bg-surface:#1a1b2e;
  --bg-elevated:#1e2035; --bg-input:#22243a;
  --text-primary:#f1f1f5; --text-secondary:#9b9bb8; --text-muted:#55566e;
  --accent:#6366f1; --accent-light:#818cf8; --accent-dark:#4f46e5;
  --accent-subtle:rgba(99,102,241,0.12); --accent-gradient:linear-gradient(135deg,#6366f1,#8b5cf6);
  --success:#34d399; --danger:#f87171; --warning:#fbbf24; --danger-subtle:rgba(248,113,113,0.12);
  --border-subtle:rgba(255,255,255,0.05); --border-default:rgba(255,255,255,0.09); --border-strong:rgba(255,255,255,0.15);
  --radius-sm:6px; --radius-md:8px; --radius-lg:12px; --radius-xl:14px; --radius-full:9999px;
  --shadow-sm:0 1px 3px rgba(0,0,0,0.4); --shadow-md:0 4px 16px rgba(0,0,0,0.5); --shadow-accent:0 0 0 2px var(--accent-dark);
  --font-ui:'Geist',sans-serif; --font-mono:'Geist Mono',monospace;
  --text-xs:11px; --text-sm:13px; --text-base:15px; --text-lg:17px; --text-xl:22px;

  font-family:var(--font-ui); color:var(--text-primary); background:var(--bg-base);
  height:100vh; width:100%; display:flex; overflow:hidden;
  -webkit-font-smoothing:antialiased;
}
.lc button { font-family:var(--font-ui); cursor:pointer; }
.lc input { font-family:var(--font-ui); }

/* ---- Server rail ---- */
.rail { width:72px; background:var(--bg-base); display:flex; flex-direction:column; align-items:center;
  padding:12px 0; gap:8px; flex-shrink:0; }
.rail-item { width:48px; height:48px; border-radius:var(--radius-lg); display:flex; align-items:center;
  justify-content:center; font-weight:600; font-size:var(--text-md); color:var(--text-primary);
  background:var(--bg-surface); position:relative; transition:border-radius .15s, background .15s; border:none; }
.rail-item:hover { border-radius:var(--radius-md); }
.rail-item.active { border-radius:var(--radius-md); }
.rail-item.active::before, .rail-item:hover::before { content:''; position:absolute; left:-12px; top:50%;
  transform:translateY(-50%); width:4px; height:24px; background:var(--text-primary); border-radius:0 4px 4px 0; }
.rail-item.active::before { height:32px; }
.rail-home { background:var(--accent-gradient); }
.rail-add { background:var(--bg-surface); color:var(--success); font-size:22px; font-weight:400; }
.rail-add:hover { background:var(--success); color:#fff; }
.rail-sep { width:32px; height:2px; background:var(--border-subtle); border-radius:2px; margin:2px 0; }
.rail-badge { position:absolute; bottom:-2px; right:-2px; background:var(--danger); color:#fff;
  border-radius:var(--radius-full); font-size:10px; font-weight:700; min-width:18px; height:18px;
  display:flex; align-items:center; justify-content:center; padding:0 5px; border:3px solid var(--bg-base); }

/* ---- Sidebar ---- */
.sidebar { width:280px; background:var(--bg-sidebar); border-right:1px solid var(--border-subtle);
  display:flex; flex-direction:column; flex-shrink:0; }
.sb-search { padding:12px; }
.sb-search input { width:100%; background:var(--bg-base); border:1px solid var(--border-subtle);
  border-radius:var(--radius-md); color:var(--text-primary); font-size:var(--text-sm); padding:8px 12px;
  transition:border-color .15s; }
.sb-search input::placeholder { color:var(--text-muted); }
.sb-search input:focus { border-color:var(--accent); outline:none; box-shadow:var(--shadow-accent); }
.sb-nav { padding:0 12px; }
.sb-nav-item { width:100%; display:flex; align-items:center; gap:12px; padding:10px 12px;
  border-radius:var(--radius-md); background:transparent; border:none; color:var(--text-secondary);
  font-size:var(--text-md); font-weight:500; transition:background .15s, color .15s; }
.sb-nav-item:hover { background:var(--bg-elevated); color:var(--text-primary); }
.sb-nav-item.active { background:var(--accent-subtle); color:var(--text-primary); }
.sb-nav-item .ic { width:22px; text-align:center; font-size:18px; }
.sb-nav-item .count { margin-left:auto; background:var(--danger); color:#fff; border-radius:var(--radius-full);
  font-size:10px; font-weight:700; min-width:18px; height:18px; display:flex; align-items:center;
  justify-content:center; padding:0 5px; }
.sb-header { padding:16px 16px 8px; font-size:var(--text-sm); font-weight:600; color:var(--text-secondary);
  text-transform:uppercase; letter-spacing:.06em; display:flex; justify-content:space-between; align-items:center; }
.sb-header .plus { color:var(--text-muted); font-size:18px; cursor:pointer; transition:color .15s; }
.sb-header .plus:hover { color:var(--text-primary); }
.sb-list { flex:1; overflow-y:auto; padding:0 8px; }
.sb-list::-webkit-scrollbar { width:8px; }
.sb-list::-webkit-scrollbar-thumb { background:var(--bg-elevated); border-radius:var(--radius-full); }

.entry { width:100%; display:flex; align-items:center; gap:12px; padding:8px 12px; min-height:52px;
  border-radius:var(--radius-md); background:transparent; border:none; border-left:3px solid transparent;
  transition:background .15s; text-align:left; }
.entry:hover { background:var(--bg-elevated); }
.entry:hover .entry-name { color:var(--text-primary); }
.entry.active { background:var(--accent-subtle); border-left:3px solid var(--accent); }
.entry.active .entry-name { color:var(--text-primary); }
.avatar { width:38px; height:38px; border-radius:var(--radius-full); flex-shrink:0; display:flex;
  align-items:center; justify-content:center; font-weight:600; font-size:var(--text-sm); color:#fff; position:relative; }
.avatar.sm { width:32px; height:32px; font-size:var(--text-xs); }
.status-dot { position:absolute; bottom:-2px; right:-2px; width:13px; height:13px; border-radius:var(--radius-full);
  border:3px solid var(--bg-sidebar); }
.entry-name { font-size:var(--text-md); font-weight:500; color:var(--text-secondary); white-space:nowrap;
  overflow:hidden; text-overflow:ellipsis; }
.entry-sub { font-size:var(--text-xs); color:var(--text-muted); }
.entry-col { display:flex; flex-direction:column; gap:1px; overflow:hidden; }

/* ---- User panel ---- */
.userbar { display:flex; align-items:center; gap:8px; padding:8px 12px; background:var(--bg-base);
  border-top:1px solid var(--border-subtle); }
.userbar .meta { flex:1; overflow:hidden; }
.userbar .name { font-size:var(--text-sm); font-weight:600; color:var(--text-primary); }
.userbar .tag { font-size:var(--text-xs); color:var(--text-secondary); }
.icon-btn { width:32px; height:32px; border-radius:var(--radius-md); background:transparent; border:none;
  color:var(--text-secondary); font-size:16px; display:flex; align-items:center; justify-content:center;
  transition:background .15s, color .15s; }
.icon-btn:hover { background:var(--bg-elevated); color:var(--text-primary); }

/* ---- Main ---- */
.main { flex:1; display:flex; flex-direction:column; background:var(--bg-main); min-width:0; }
.topbar { height:52px; display:flex; align-items:center; gap:12px; padding:0 16px;
  border-bottom:1px solid var(--border-subtle); flex-shrink:0; }
.topbar .title { font-size:var(--text-lg); font-weight:600; }
.topbar .ic { color:var(--text-muted); font-size:18px; }
.topbar-spacer { flex:1; }

/* ---- Friends view ---- */
.tabs { display:flex; align-items:center; gap:8px; }
.tab { background:transparent; border:none; color:var(--text-secondary); font-size:var(--text-md);
  font-weight:500; padding:6px 12px; border-radius:var(--radius-md); transition:background .15s,color .15s; }
.tab:hover { background:var(--bg-elevated); color:var(--text-primary); }
.tab.active { background:var(--accent-subtle); color:var(--text-primary); }
.tab.add { background:var(--accent-gradient); color:#fff; font-weight:600; }
.tab.add:hover { opacity:.88; }
.fr-body { flex:1; overflow-y:auto; padding:24px; }
.fr-body::-webkit-scrollbar { width:10px; }
.fr-body::-webkit-scrollbar-thumb { background:var(--bg-elevated); border-radius:var(--radius-full); }
.fr-search { width:100%; background:var(--bg-input); border:1px solid var(--border-subtle);
  border-radius:var(--radius-md); color:var(--text-primary); font-size:var(--text-base); padding:10px 14px;
  margin-bottom:20px; transition:border-color .15s; }
.fr-search::placeholder { color:var(--text-muted); }
.fr-search:focus { border-color:var(--accent); outline:none; box-shadow:var(--shadow-accent); }
.fr-section-label { font-size:var(--text-xs); font-weight:600; color:var(--text-secondary);
  text-transform:uppercase; letter-spacing:.06em; margin-bottom:8px; }
.fr-row { display:flex; align-items:center; gap:12px; padding:12px; border-radius:var(--radius-md);
  border-top:1px solid transparent; transition:background .15s; }
.fr-row:hover { background:var(--bg-surface); }
.fr-row .name { font-size:var(--text-md); font-weight:600; color:var(--text-primary); }
.fr-row .st { font-size:var(--text-sm); color:var(--text-secondary); }
.fr-row .actions { margin-left:auto; display:flex; gap:8px; }
.round-btn { width:38px; height:38px; border-radius:var(--radius-full); background:var(--bg-elevated);
  border:none; color:var(--text-secondary); font-size:16px; display:flex; align-items:center;
  justify-content:center; transition:background .15s,color .15s; }
.round-btn:hover { background:var(--bg-input); color:var(--text-primary); }
.round-btn.ok:hover { color:var(--success); }
.round-btn.no:hover { background:var(--danger-subtle); color:var(--danger); }

/* buttons */
.btn-primary { background:var(--accent-gradient); color:#fff; border:none; border-radius:var(--radius-md);
  padding:10px 20px; font-size:var(--text-base); font-weight:600; transition:opacity .15s, transform .1s; }
.btn-primary:hover { opacity:.88; }
.btn-primary:active { transform:scale(.98); }
.btn-primary:disabled { opacity:.4; cursor:not-allowed; }
.btn-ghost { background:transparent; color:var(--text-secondary); border:none; border-radius:var(--radius-md);
  padding:10px 20px; font-size:var(--text-base); font-weight:600; transition:color .15s; }
.btn-ghost:hover { color:var(--text-primary); }
.btn-danger { background:transparent; color:var(--danger); border:1px solid transparent;
  border-radius:var(--radius-sm); padding:8px 14px; font-size:var(--text-sm); font-weight:600;
  transition:background .15s, border-color .15s; }
.btn-danger:hover { background:var(--danger-subtle); border-color:rgba(248,113,113,0.2); }

/* ---- DM conversation ---- */
.dm-scroll { flex:1; overflow-y:auto; padding:16px 24px; display:flex; flex-direction:column; }
.dm-scroll::-webkit-scrollbar { width:10px; }
.dm-scroll::-webkit-scrollbar-thumb { background:var(--bg-elevated); border-radius:var(--radius-full); }
.dm-intro { padding:24px 0 16px; border-bottom:1px solid var(--border-subtle); margin-bottom:16px; }
.dm-intro .big-av { width:72px; height:72px; border-radius:var(--radius-full); display:flex; align-items:center;
  justify-content:center; font-size:28px; font-weight:600; color:#fff; margin-bottom:12px; }
.dm-intro h2 { font-size:var(--text-xl); font-weight:700; margin-bottom:4px; }
.dm-intro p { font-size:var(--text-sm); color:var(--text-secondary); }
.msg { display:flex; gap:8px; align-items:flex-start; padding:8px 0; }
.msg .body { min-width:0; }
.msg .head { display:flex; align-items:baseline; gap:8px; margin-bottom:2px; }
.msg .author { font-size:var(--text-sm); font-weight:600; color:var(--accent-light); }
.msg .ts { font-size:var(--text-xs); color:var(--text-muted); }
.msg .content { font-family:var(--font-mono); font-size:var(--text-base); color:var(--text-primary); line-height:1.5;
  white-space:pre-wrap; word-break:break-word; }
.day-sep { display:flex; align-items:center; gap:12px; margin:12px 0; color:var(--text-muted); font-size:var(--text-xs); }
.day-sep::before, .day-sep::after { content:''; flex:1; height:1px; background:var(--border-subtle); }

.input-bar { padding:12px 16px 20px; }
.input-wrap { display:flex; align-items:flex-end; gap:8px; background:var(--bg-input);
  border:1px solid var(--border-subtle); border-radius:var(--radius-lg); padding:6px 8px 6px 14px;
  transition:border-color .15s; }
.input-wrap.focus { border-color:var(--accent); box-shadow:var(--shadow-accent); }
.input-wrap input { flex:1; background:transparent; border:none; outline:none; color:var(--text-primary);
  font-family:var(--font-mono); font-size:var(--text-base); padding:8px 0; }
.input-wrap input::placeholder { color:var(--text-muted); }
.send-btn { width:36px; height:36px; border-radius:var(--radius-md); background:var(--accent-gradient);
  border:none; color:#fff; display:flex; align-items:center; justify-content:center; font-size:16px;
  transition:opacity .15s, transform .1s; }
.send-btn:hover { opacity:.88; }
.send-btn:active { transform:scale(.95); }
.send-btn:disabled { opacity:.4; cursor:not-allowed; }

/* ---- Modal ---- */
.backdrop { position:absolute; inset:0; background:rgba(0,0,0,0.7); display:flex; align-items:center;
  justify-content:center; z-index:50; animation:fade .15s ease; }
@keyframes fade { from{opacity:0} to{opacity:1} }
.modal { background:var(--bg-surface); border:1px solid var(--border-default); border-radius:var(--radius-xl);
  box-shadow:var(--shadow-md); max-width:460px; width:100%; padding:24px; animation:pop .18s ease; }
@keyframes pop { from{opacity:0; transform:translateY(8px) scale(.98)} to{opacity:1; transform:none} }
.modal h3 { font-size:var(--text-xl); font-weight:700; margin-bottom:6px; }
.modal .sub { font-size:var(--text-sm); color:var(--text-secondary); margin-bottom:20px; }
.modal label { display:block; font-size:var(--text-xs); font-weight:600; color:var(--text-secondary);
  text-transform:uppercase; letter-spacing:.06em; margin-bottom:8px; }
.modal-input { width:100%; background:var(--bg-input); border:1px solid var(--border-subtle);
  border-radius:var(--radius-md); color:var(--text-primary); font-size:var(--text-base); padding:10px 14px;
  margin-bottom:16px; transition:border-color .15s; }
.modal-input::placeholder { color:var(--text-muted); }
.modal-input:focus { border-color:var(--accent); outline:none; box-shadow:var(--shadow-accent); }
.pick-list { display:flex; flex-direction:column; gap:4px; max-height:240px; overflow-y:auto; margin-bottom:20px; }
.pick { display:flex; align-items:center; gap:12px; padding:8px 12px; border-radius:var(--radius-md);
  background:transparent; border:none; transition:background .15s; }
.pick:hover { background:var(--bg-elevated); }
.pick .check { margin-left:auto; width:20px; height:20px; border-radius:var(--radius-sm);
  border:1.5px solid var(--border-strong); display:flex; align-items:center; justify-content:center;
  font-size:12px; color:#fff; }
.pick .check.on { background:var(--accent); border-color:var(--accent); }
.modal-actions { display:flex; justify-content:flex-end; gap:8px; }

/* ---- Auth ---- */
.auth { width:100%; height:100vh; display:flex; align-items:center; justify-content:center;
  background:radial-gradient(circle at 30% 20%, rgba(99,102,241,0.10), transparent 50%),
             radial-gradient(circle at 80% 80%, rgba(139,92,246,0.08), transparent 45%), var(--bg-base); }
.auth-card { background:var(--bg-surface); border:1px solid var(--border-default); border-radius:var(--radius-xl);
  box-shadow:var(--shadow-md); width:420px; padding:32px; }
.auth-logo { display:flex; align-items:center; gap:10px; margin-bottom:24px; }
.auth-logo .mark { width:36px; height:36px; border-radius:var(--radius-md); background:var(--accent-gradient);
  display:flex; align-items:center; justify-content:center; font-weight:700; color:#fff; font-size:18px; }
.auth-logo .word { font-size:var(--text-lg); font-weight:700; }
.auth-card h1 { font-size:var(--text-xl); font-weight:700; margin-bottom:4px; }
.auth-card .sub { font-size:var(--text-sm); color:var(--text-secondary); margin-bottom:24px; }
.field { margin-bottom:16px; }
.field label { display:block; font-size:var(--text-xs); font-weight:600; color:var(--text-secondary);
  text-transform:uppercase; letter-spacing:.06em; margin-bottom:8px; }
.field input { width:100%; background:var(--bg-input); border:1px solid var(--border-subtle);
  border-radius:var(--radius-md); color:var(--text-primary); font-size:var(--text-base); padding:10px 14px;
  transition:border-color .15s; }
.field input::placeholder { color:var(--text-muted); }
.field input:focus { border-color:var(--accent); outline:none; box-shadow:var(--shadow-accent); }
.auth-card .btn-primary { width:100%; margin-top:8px; }
.auth-foot { margin-top:20px; font-size:var(--text-sm); color:var(--text-secondary); text-align:center; }
.auth-foot button { background:none; border:none; color:var(--accent-light); font-weight:600;
  font-size:var(--text-sm); cursor:pointer; }
.auth-foot button:hover { text-decoration:underline; }

/* preview switch */
.devbar { position:absolute; top:12px; right:12px; z-index:80; display:flex; gap:6px;
  background:var(--bg-surface); border:1px solid var(--border-default); border-radius:var(--radius-md);
  padding:4px; box-shadow:var(--shadow-sm); }
.devbar button { background:transparent; border:none; color:var(--text-secondary); font-size:var(--text-sm);
  font-weight:500; padding:6px 12px; border-radius:var(--radius-sm); transition:background .15s,color .15s; }
.devbar button:hover { color:var(--text-primary); }
.devbar button.on { background:var(--accent-subtle); color:var(--text-primary); }
`;

const AV = {
  indigo: "linear-gradient(135deg,#6366f1,#8b5cf6)",
  teal: "linear-gradient(135deg,#34d399,#0ea5e9)",
  rose: "linear-gradient(135deg,#f87171,#fb7185)",
  amber: "linear-gradient(135deg,#fbbf24,#f97316)",
  slate: "linear-gradient(135deg,#64748b,#475569)",
  violet: "linear-gradient(135deg,#a78bfa,#6366f1)",
};
const STATUS = {
  online: "var(--success)", idle: "var(--warning)", dnd: "var(--danger)", offline: "var(--text-muted)",
};

const DMS = [
  { id: "luna", name: "Luna", color: AV.violet, status: "online", sub: "tape un message..." },
  { id: "kenji", name: "Kenji_dev", color: AV.teal, status: "dnd", sub: "Ne pas déranger" },
  { id: "mara", name: "mara.codes", color: AV.rose, status: "idle", sub: "Absente" },
  { id: "theo", name: "Théo", color: AV.amber, status: "online", sub: "En ligne" },
  { id: "groupe", name: "Les Gobelins", color: AV.slate, status: "offline", sub: "4 membres" },
];

const FRIENDS_ONLINE = [
  { id: "luna", name: "Luna", color: AV.violet, status: "online", st: "Joue à 7 Days to Die" },
  { id: "theo", name: "Théo", color: AV.amber, status: "online", st: "En ligne" },
  { id: "kenji", name: "Kenji_dev", color: AV.teal, status: "dnd", st: "Ne pas déranger · compile" },
];
const FRIENDS_PENDING = [
  { id: "nova", name: "nova_42", color: AV.indigo, st: "Demande entrante", dir: "in" },
  { id: "rho", name: "rhoennix", color: AV.rose, st: "Demande envoyée", dir: "out" },
];

const SEED_MSGS = {
  luna: [
    { who: "Luna", color: AV.violet, ts: "14:02", txt: "yo, t'as avancé sur le détecteur d'images IA ?" },
    { who: "toi", color: AV.indigo, ts: "14:03", txt: "ouais, le linear probe sur CLIP tourne\n92% d'accuracy sur le set de test" },
    { who: "Luna", color: AV.violet, ts: "14:04", txt: "clean. tu push le notebook ?" },
    { who: "toi", color: AV.indigo, ts: "14:05", txt: "je clean les imports d'abord, 2 min" },
  ],
  kenji: [
    { who: "Kenji_dev", color: AV.teal, ts: "11:20", txt: "le build casse sur main, t'as touché au tool_node ?" },
    { who: "toi", color: AV.indigo, ts: "11:22", txt: "oui je l'ai refacto, helper _run_action_tool\nje regarde le CI" },
  ],
  theo: [
    { who: "Théo", color: AV.amber, ts: "09:10", txt: "session 765 ce week-end ?" },
    { who: "toi", color: AV.indigo, ts: "09:12", txt: "carrément, si la météo tient" },
  ],
  mara: [{ who: "mara.codes", color: AV.rose, ts: "hier", txt: "je te renvoie les maquettes demain" }],
  groupe: [{ who: "Théo", color: AV.amber, ts: "20:41", txt: "qui est chaud pour une partie ?" }],
};

function Avatar({ color, name, status, size }) {
  const initials = name.replace(/[^A-Za-z0-9À-ÿ]/g, " ").trim().split(" ")
    .map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className={"avatar" + (size === "sm" ? " sm" : "")} style={{ background: color }}>
      {initials}
      {status && <span className="status-dot" style={{ background: STATUS[status] }} />}
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState("app"); // app | auth
  const [authMode, setAuthMode] = useState("login");
  const [view, setView] = useState("friends"); // friends | dm
  const [activeDM, setActiveDM] = useState("luna");
  const [tab, setTab] = useState("online");
  const [showModal, setShowModal] = useState(false);
  const [picked, setPicked] = useState([]);
  const [msgs, setMsgs] = useState(SEED_MSGS);
  const [draft, setDraft] = useState("");
  const [inputFocus, setInputFocus] = useState(false);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, activeDM, view]);

  const dm = DMS.find((d) => d.id === activeDM);

  function send() {
    const t = draft.trim();
    if (!t) return;
    setMsgs((m) => ({
      ...m,
      [activeDM]: [...(m[activeDM] || []), { who: "toi", color: AV.indigo, ts: "maint.", txt: t }],
    }));
    setDraft("");
  }

  function togglePick(id) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  if (screen === "auth") {
    return (
      <>
        <style>{CSS}</style>
        <div className="devbar">
          <button onClick={() => setScreen("app")}>← Retour à l'app</button>
        </div>
        <div className="lc" style={{ display: "block" }}>
          <div className="auth">
            <div className="auth-card">
              <div className="auth-logo">
                <div className="mark">L</div>
                <div className="word">LiteCord</div>
              </div>
              <h1>{authMode === "login" ? "Content de te revoir" : "Crée ton compte"}</h1>
              <p className="sub">
                {authMode === "login" ? "Connecte-toi pour rejoindre tes conversations." : "Quelques infos et c'est parti."}
              </p>
              {authMode === "signup" && (
                <div className="field">
                  <label>Nom d'utilisateur</label>
                  <input placeholder="ton_pseudo" />
                </div>
              )}
              <div className="field">
                <label>Adresse e-mail</label>
                <input placeholder="tom@exemple.fr" />
              </div>
              <div className="field">
                <label>Mot de passe</label>
                <input type="password" placeholder="••••••••" />
              </div>
              <button className="btn-primary">
                {authMode === "login" ? "Se connecter" : "S'inscrire"}
              </button>
              <p className="auth-foot">
                {authMode === "login" ? "Pas encore de compte ? " : "Déjà inscrit ? "}
                <button onClick={() => setAuthMode(authMode === "login" ? "signup" : "login")}>
                  {authMode === "login" ? "S'inscrire" : "Se connecter"}
                </button>
              </p>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="devbar">
        <button className={view === "friends" ? "on" : ""} onClick={() => setView("friends")}>Amis</button>
        <button className={view === "dm" ? "on" : ""} onClick={() => setView("dm")}>DM</button>
        <button onClick={() => setScreen("auth")}>Auth</button>
      </div>

      <div className="lc">
        {/* Server rail */}
        <div className="rail">
          <button className="rail-item rail-home active" title="Messages privés">
            <span style={{ fontSize: 20 }}>✦</span>
          </button>
          <div className="rail-sep" />
          <button className="rail-item" style={{ background: AV.teal }}>LT</button>
          <button className="rail-item" style={{ background: AV.rose }}>
            R
            <span className="rail-badge">3</span>
          </button>
          <button className="rail-item" style={{ background: AV.amber }}>765</button>
          <button className="rail-item" style={{ background: AV.slate }}>ML</button>
          <button className="rail-item rail-add" title="Ajouter un serveur">+</button>
        </div>

        {/* Sidebar */}
        <div className="sidebar">
          <div className="sb-search">
            <input placeholder="Rechercher une conversation" />
          </div>
          <div className="sb-nav">
            <button className={"sb-nav-item" + (view === "friends" ? " active" : "")} onClick={() => setView("friends")}>
              <span className="ic">👥</span> Amis
              <span className="count">2</span>
            </button>
            <button className="sb-nav-item">
              <span className="ic">🏪</span> Boutique
            </button>
          </div>
          <div className="sb-header">
            Messages privés
            <span className="plus" onClick={() => setShowModal(true)} title="Créer un DM">+</span>
          </div>
          <div className="sb-list">
            {DMS.map((d) => (
              <button
                key={d.id}
                className={"entry" + (view === "dm" && activeDM === d.id ? " active" : "")}
                onClick={() => { setActiveDM(d.id); setView("dm"); }}
              >
                <Avatar color={d.color} name={d.name} status={d.status} />
                <div className="entry-col">
                  <span className="entry-name">{d.name}</span>
                  <span className="entry-sub">{d.sub}</span>
                </div>
              </button>
            ))}
          </div>
          <div className="userbar">
            <Avatar color={AV.indigo} name="Tom" status="online" size="sm" />
            <div className="meta">
              <div className="name">Tom</div>
              <div className="tag">#0001</div>
            </div>
            <button className="icon-btn" title="Micro">🎙️</button>
            <button className="icon-btn" title="Casque">🎧</button>
            <button className="icon-btn" title="Paramètres">⚙️</button>
          </div>
        </div>

        {/* Main */}
        <div className="main">
          {view === "friends" ? (
            <>
              <div className="topbar">
                <span className="ic">👥</span>
                <span className="title">Amis</span>
                <div style={{ width: 1, height: 24, background: "var(--border-subtle)", margin: "0 4px" }} />
                <div className="tabs">
                  <button className={"tab" + (tab === "online" ? " active" : "")} onClick={() => setTab("online")}>En ligne</button>
                  <button className={"tab" + (tab === "all" ? " active" : "")} onClick={() => setTab("all")}>Tous</button>
                  <button className={"tab" + (tab === "pending" ? " active" : "")} onClick={() => setTab("pending")}>
                    En attente <span style={{ color: "var(--danger)", fontWeight: 700 }}>1</span>
                  </button>
                  <button className="tab add" onClick={() => setShowModal(true)}>Ajouter</button>
                </div>
              </div>
              <div className="fr-body">
                <input className="fr-search" placeholder="Rechercher" />
                {tab === "pending" ? (
                  <>
                    <div className="fr-section-label">En attente — {FRIENDS_PENDING.length}</div>
                    {FRIENDS_PENDING.map((f) => (
                      <div className="fr-row" key={f.id}>
                        <Avatar color={f.color} name={f.name} />
                        <div>
                          <div className="name">{f.name}</div>
                          <div className="st">{f.st}</div>
                        </div>
                        <div className="actions">
                          {f.dir === "in" ? (
                            <>
                              <button className="round-btn ok" title="Accepter">✓</button>
                              <button className="round-btn no" title="Refuser">✕</button>
                            </>
                          ) : (
                            <button className="round-btn no" title="Annuler">✕</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <>
                    <div className="fr-section-label">
                      {tab === "online" ? "En ligne" : "Tous les amis"} — {FRIENDS_ONLINE.length}
                    </div>
                    {FRIENDS_ONLINE.map((f) => (
                      <div className="fr-row" key={f.id}>
                        <Avatar color={f.color} name={f.name} status={f.status} />
                        <div>
                          <div className="name">{f.name}</div>
                          <div className="st">{f.st}</div>
                        </div>
                        <div className="actions">
                          <button className="round-btn" title="Message"
                            onClick={() => { setActiveDM(f.id); setView("dm"); }}>💬</button>
                          <button className="round-btn" title="Plus">⋯</button>
                        </div>
                      </div>
                    ))}
                    <div style={{ marginTop: 28 }}>
                      <div className="fr-section-label">Aperçu des boutons</div>
                      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                        <button className="btn-primary">Bouton primaire</button>
                        <button className="btn-primary" disabled>Désactivé</button>
                        <button className="btn-ghost">Annuler</button>
                        <button className="btn-danger">Supprimer l'ami</button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="topbar">
                <Avatar color={dm.color} name={dm.name} status={dm.status} size="sm" />
                <span className="title">{dm.name}</span>
                <div className="topbar-spacer" />
                <button className="icon-btn" title="Appel">📞</button>
                <button className="icon-btn" title="Vidéo">📹</button>
                <button className="icon-btn" title="Épingles">📌</button>
              </div>
              <div className="dm-scroll" ref={scrollRef}>
                <div className="dm-intro">
                  <div className="big-av" style={{ background: dm.color }}>
                    {dm.name.replace(/[^A-Za-z0-9À-ÿ]/g, " ").trim().split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                  </div>
                  <h2>{dm.name}</h2>
                  <p>Ceci est le début de ta conversation avec {dm.name}.</p>
                </div>
                <div className="day-sep">Aujourd'hui</div>
                {(msgs[activeDM] || []).map((m, i) => (
                  <div className="msg" key={i}>
                    <Avatar color={m.color} name={m.who} size="sm" />
                    <div className="body">
                      <div className="head">
                        <span className="author">{m.who}</span>
                        <span className="ts">{m.ts}</span>
                      </div>
                      <div className="content">{m.txt}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="input-bar">
                <div className={"input-wrap" + (inputFocus ? " focus" : "")}>
                  <input
                    ref={inputRef}
                    value={draft}
                    placeholder={`Envoyer un message à ${dm.name}`}
                    onChange={(e) => setDraft(e.target.value)}
                    onFocus={() => setInputFocus(true)}
                    onBlur={() => setInputFocus(false)}
                    onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                  />
                  <button className="send-btn" onClick={send} disabled={!draft.trim()}>➤</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Create DM modal */}
      {showModal && (
        <div className="backdrop" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Nouvelle conversation</h3>
            <p className="sub">Sélectionne des amis pour démarrer un message privé ou un groupe.</p>
            <label>Rechercher</label>
            <input className="modal-input" placeholder="Tape un nom..." />
            <div className="pick-list">
              {FRIENDS_ONLINE.concat([{ id: "mara", name: "mara.codes", color: AV.rose, status: "idle" }]).map((f) => (
                <button key={f.id} className="pick" onClick={() => togglePick(f.id)}>
                  <Avatar color={f.color} name={f.name} status={f.status} size="sm" />
                  <span className="entry-name" style={{ color: "var(--text-primary)" }}>{f.name}</span>
                  <span className={"check" + (picked.includes(f.id) ? " on" : "")}>
                    {picked.includes(f.id) ? "✓" : ""}
                  </span>
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setShowModal(false)}>Annuler</button>
              <button className="btn-primary" disabled={picked.length === 0}
                onClick={() => { setShowModal(false); setPicked([]); }}>
                Créer {picked.length > 0 ? `(${picked.length})` : ""}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
