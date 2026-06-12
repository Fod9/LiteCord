import { BrowserRouter, Routes, Route } from "react-router";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { PresenceProvider } from "./context/PresenceContext";
import { GuildProvider } from "./context/GuildContext";
import { UnreadProvider } from "./context/UnreadContext";
import { VoiceProvider } from "./context/VoiceContext";
import LoginPage from "./routes/LoginPage";
import FriendPage from "./routes/FriendPage";
import DMPage from "./routes/DMPage";
import GuildChannelPage from "./routes/GuildChannelPage";
import VoiceChannelPage from "./routes/VoiceChannelPage";
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
    <VoiceProvider>
    <div className="app-container">
      <ServerSideBar />
      <AdaptableSideBar />
      <div className="app-content">
        <Routes>
          <Route path="/" element={<FriendPage />} />
          <Route path="/channels/:channelId" element={<DMPage />} />
          <Route path="/guilds/:guildId/channels/:channelId" element={<GuildChannelPage />} />
          <Route path="/guilds/:guildId/voice/:channelId" element={<VoiceChannelPage />} />
        </Routes>
      </div>
    </div>
    </VoiceProvider>
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
