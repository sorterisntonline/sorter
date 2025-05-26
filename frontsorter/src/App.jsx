import { Routes, Route, Navigate } from 'react-router-dom';
import './App.css'

import Layout from './Layout';
import TagListPage from './pages/TagListPage';
import TagDetailPage from './pages/TagDetailPage';
import ItemsetsPage from './pages/ItemsetsPage';
import ItemsetDetailPage from './pages/ItemsetDetailPage';
import NewRunPage from './pages/NewRunPage';
import RunDetailPage from './pages/RunDetailPage';
import { WebSocketTest } from './components/WebSocketTest';

// Import RecentSongsFlow (commented out since we're not using it right now)
// import RecentSongsFlow from './pages/RecentSongsFlow';

function App() {
    // Single return statement (removed the unreachable code)
    return (
        <Routes>
            {/* Itemsets as the new index page */}
            <Route path="/" element={<ItemsetsPage />} />
            
            {/* Itemset routes */}
            <Route path="/itemsets" element={<ItemsetsPage />} />
            <Route path="/itemsets/:itemsetId" element={<ItemsetDetailPage />} />
            <Route path="/itemsets/:itemsetId/new-run" element={<NewRunPage />} />
            
            {/* Run detail page */}
            <Route path="/runs/:runId" element={<RunDetailPage />} />
            
            {/* Legacy routes - redirect to itemsets */}
            <Route path="/jobs" element={<Navigate to="/itemsets" replace />} />
            <Route path="/rank" element={<Navigate to="/itemsets" replace />} />
            <Route path="/rank/:jobId" element={<Navigate to="/itemsets" replace />} />
            
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
