import { Routes, Route, Navigate } from 'react-router-dom';
import './App.css'

import Layout from './Layout';
import TagListPage from './pages/TagListPage';
import TagDetailPage from './pages/TagDetailPage';
import RankPage from './pages/RankPage';
import JobsListPage from './pages/JobsListPage';
import { WebSocketTest } from './components/WebSocketTest';

// Import RecentSongsFlow (commented out since we're not using it right now)
// import RecentSongsFlow from './pages/RecentSongsFlow';

function App() {
    // Single return statement (removed the unreachable code)
    return (
        <Routes>
            {/* Jobs list as index page */}
            <Route path="/" element={<JobsListPage />} />
            
            {/* Rank page with optional job ID */}
            <Route path="/rank" element={<RankPage />} />
            <Route path="/rank/:jobId" element={<RankPage />} />
            
            {/* WebSocket test page */}
            <Route path="/ws-test" element={<WebSocketTest />} />
            
            {/* Wrap other pages within the Layout */}
            <Route path="/app" element={<Layout />}>
                <Route path="tags" element={<TagListPage />} />
                <Route path="tags/:tagId" element={<TagDetailPage />} />
                {/* Add a catch-all or Not Found route if desired */}
                <Route path="*" element={<div className="p-4">Page Not Found</div>} />
            </Route>
            {/* Routes outside the main layout (e.g., login) could go here */}
        </Routes>
    );
}

export default App
