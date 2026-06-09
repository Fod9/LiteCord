import { BrowserRouter, Routes, Route } from "react-router";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { PresenceProvider } from "./context/PresenceContext";
import { GuildProvider } from "./context/GuildContext";
import { UnreadProvider } from "./context/UnreadContext";
import LoginPage from "./routes/LoginPage";
import FriendPage from "./routes/FriendPage";
import DMPage from "./routes/DMPage";
import GuildChannelPage from "./routes/GuildChannelPage";
import ServerSideBar from "./components/globals/ServerSideBar";
import AdaptableSideBar from "./components/globals/AdaptableSideBar";
import "./styles/global.css";

function AppRoutes() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <div className="app-container" />;

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <PresenceProvider>
    <GuildProvider>
    <UnreadProvider>
    <div className="app-container">
      <ServerSideBar />
      <AdaptableSideBar />
      <div className="app-content">
        <Routes>
          <Route path="/" element={<FriendPage />} />
          <Route path="/channels/:channelId" element={<DMPage />} />
          <Route path="/guilds/:guildId/channels/:channelId" element={<GuildChannelPage />} />
        </Routes>
      </div>
    </div>
    </UnreadProvider>
    </GuildProvider>
    </PresenceProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
