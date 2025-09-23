import React from "react";
import { Routes, Route } from "react-router-dom";
import "./App.css";
import "./styles/spotify-player.css";

import Layout from "./Layout";

import ProfilePage from "./pages/ProfilePage";
import EntitiesIndex from "./pages/EntitiesIndex";
import EntityDetail from "./pages/EntityDetail";
import CreateEntityPage from "./pages/CreateEntityPage";
import TodoPage from "./pages/TodoPage";
import SpotifySongsPage from "./pages/SpotifySongsPage";
import { PoolPage } from "./pages/PoolPage";

// Auth pages (outside main layout)
import LoginPage from "./pages/LoginPage";
import ChooseUsernamePage from "./pages/ChooseUsernamePage";
import AuthSuccessPage from "./pages/AuthSuccessPage";
import AuthErrorPage from "./pages/AuthErrorPage";

function App(): JSX.Element {
  return (
    <Routes>
      {/* Auth routes (no layout) */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/choose-username" element={<ChooseUsernamePage />} />
      <Route path="/auth/success" element={<AuthSuccessPage />} />
      <Route path="/auth/error" element={<AuthErrorPage />} />

      {/* Main app routes (with layout) */}
      <Route path="/" element={<Layout />}>
        <Route index element={<EntitiesIndex />} />
        <Route path="spotify" element={<SpotifySongsPage />} />
        <Route path="pool" element={<PoolPage />} />
        <Route path="entity/new" element={<CreateEntityPage />} />
        <Route path="entity/:ns/:pk" element={<EntityDetail />} />

        <Route path="todos" element={<TodoPage />} />

        <Route path="profile" element={<ProfilePage />} />
        <Route path="*" element={<div className="p-4">Page Not Found</div>} />
      </Route>
    </Routes>
  );
}

export default App;
