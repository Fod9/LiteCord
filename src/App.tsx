import { BrowserRouter, Routes, Route } from "react-router";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { PresenceProvider } from "./context/PresenceContext";
import LoginPage from "./routes/LoginPage";
import FriendPage from "./routes/FriendPage";
import DMPage from "./routes/DMPage";
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
    <div className="app-container">
      <ServerSideBar />
      <AdaptableSideBar mode="pm" />
      <div className="app-content">
        <Routes>
          <Route path="/" element={<FriendPage />} />
          <Route path="/channels/:channelId" element={<DMPage />} />
        </Routes>
      </div>
    </div>
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
