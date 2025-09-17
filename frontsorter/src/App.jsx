import { Routes, Route } from "react-router-dom";
import "./App.css";

import Layout from "./Layout";
import VotePage from "./pages/VotePage";
import ProfilePage from "./pages/ProfilePage";
import EntitiesIndex from "./pages/EntitiesIndex";
import EntityDetail from "./pages/EntityDetail";
import CreateEntityPage from "./pages/CreateEntityPage";
import FolksonomyPage from "./pages/FolksonomyPage";
import TagVotePage from "./pages/TagVotePage";
import TagCollectionsPage from "./pages/TagCollectionsPage";
import TagHistoryPage from "./pages/TagHistoryPage";

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
        
        {/* Folksonomy routes */}
        <Route path="folksonomy" element={<FolksonomyPage />} />
        <Route path="folksonomy/vote" element={<TagVotePage />} />
        <Route path="folksonomy/collections" element={<TagCollectionsPage />} />
        <Route path="folksonomy/history" element={<TagHistoryPage />} />
        
        {/* Add a catch-all or Not Found route if desired */}
        <Route path="*" element={<div className="p-4">Page Not Found</div>} />
      </Route>
      {/* Routes outside the main layout (e.g., login) could go here */}
    </Routes>
  );
}

export default App;
