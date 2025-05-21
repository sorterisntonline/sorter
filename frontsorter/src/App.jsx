import { Routes, Route, Navigate } from 'react-router-dom';
import './App.css'

import Layout from './Layout';
import VotePage from './pages/VotePage';
import ProfilePage from './pages/ProfilePage';
import TagListPage from './pages/TagListPage';
import TagDetailPage from './pages/TagDetailPage';

// Import RecentSongsFlow (commented out since we're not using it right now)
// import RecentSongsFlow from './pages/RecentSongsFlow';

function App() {
    // Single return statement (removed the unreachable code)
    return (
        <Routes>
            {/* Wrap all main pages within the Layout */}
            <Route path="/" element={<Layout />}>
                <Route index element={<Navigate to="/tags" replace />} /> {/* Default to tags */}
                <Route path="vote" element={<VotePage />} /> {/* Keep existing vote page */}
                <Route path="tags" element={<TagListPage />} />
                <Route path="tags/:tagId" element={<TagDetailPage />} />
                <Route path="profile" element={<ProfilePage />} />
                {/* Add a catch-all or Not Found route if desired */}
                <Route path="*" element={<div className="p-4">Page Not Found</div>} />
            </Route>
            {/* Routes outside the main layout (e.g., login) could go here */}
        </Routes>
    );
}

export default App
