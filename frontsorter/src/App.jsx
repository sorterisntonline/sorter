import { Routes, Route, Navigate } from 'react-router-dom';
import './App.css'

import TagsListPage from './pages/TagsListPage';
import TagDetailPage from './pages/TagDetailPage';
import TagDetailPageV2 from './pages/TagDetailPageV2';

function App() {
    return (
        <Routes>
            {/* Tags as the new index page */}
            <Route path="/" element={<TagsListPage />} />
            
            {/* Tag routes */}
            <Route path="/tags" element={<TagsListPage />} />
            <Route path="/tags/:tagId" element={<TagDetailPage />} />
        </Routes>
    );
}

export default App
