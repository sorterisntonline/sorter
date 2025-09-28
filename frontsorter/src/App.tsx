import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import "./App.css";
import "./styles/spotify-player.css";

import Layout from "./Layout";
import { RoomExperience } from "./map/RoomExperience";

// Auth pages (outside main layout)
import LoginPage from "./pages/LoginPage";
import ChooseUsernamePage from "./pages/ChooseUsernamePage";
import AuthSuccessPage from "./pages/AuthSuccessPage";
import AuthErrorPage from "./pages/AuthErrorPage";

function App() {
  return (
    <Routes>
      {/* Auth routes (no layout) */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/choose-username" element={<ChooseUsernamePage />} />
      <Route path="/auth/success" element={<AuthSuccessPage />} />
      <Route path="/auth/error" element={<AuthErrorPage />} />

      {/* Main app routes (with layout) */}
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/map/spotify/0,0" replace />} />
        <Route path="/map/spotify/:coord" element={<RoomExperience />} />
        <Route path="*" element={<Navigate to="/map/spotify/0,0" replace />} />
      </Route>
    </Routes>
  );
}

export default App;
