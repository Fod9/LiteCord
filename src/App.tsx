import { BrowserRouter, Routes, Route } from "react-router";
import HomePage from "./routes/HomePage";
import FriendPage from "./routes/FriendPage";
import "./styles/global.css"
import SideBar from "./components/globals/ServerSideBar";
import AdaptableSideBar from "./components/globals/AdaptableSideBar";

function App() {
  return (
    <div className="app-container">
      <SideBar />
      <AdaptableSideBar mode="pm" />
      <div className="app-content">
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<FriendPage />} />
          </Routes>
        </BrowserRouter>
      </div>
    </div >
  );
}

export default App;
