import { Routes, Route } from "react-router-dom";
import "./App.css";

import Layout from "./Layout";
import VotePage from "./pages/VotePage";
import ProfilePage from "./pages/ProfilePage";
import EntitiesIndex from "./pages/EntitiesIndex";
import EntityDetail from "./pages/EntityDetail";
import CreateEntityPage from "./pages/CreateEntityPage";

function App() {
  return (
    <Routes>
      {/* Wrap all main pages within the Layout */}
      <Route path="/" element={<Layout />}>
        {/* Entities index and drilldown */}
        <Route index element={<EntitiesIndex />} />
        <Route path="entity/new" element={<CreateEntityPage />} />
        <Route path="entity/:pk_namespace/:pk" element={<EntityDetail />} />
        <Route path="vote" element={<VotePage />} />{" "}
        {/* Keep existing vote page */}
        <Route path="profile" element={<ProfilePage />} />
        {/* Add a catch-all or Not Found route if desired */}
        <Route path="*" element={<div className="p-4">Page Not Found</div>} />
      </Route>
      {/* Routes outside the main layout (e.g., login) could go here */}
    </Routes>
  );
}

export default App;
