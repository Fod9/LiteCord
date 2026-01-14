import { BrowserRouter, Routes, Route } from "react-router";
import HomePage from "./routes/HomePage";
import FriendPage from "./routes/FriendPage";
import "./styles/global.css"
import SideBar from "./components/globals/SideBar";

function App() {
  return (
    <div className="app-container">
      <SideBar />
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
