import { Routes, Route, Navigate } from 'react-router-dom';
import './App.css'

import Layout from './Layout';
import TagListPage from './pages/TagListPage';
import TagDetailPage from './pages/TagDetailPage';
import ItemsetsPage from './pages/ItemsetsPage';
import ItemsetDetailPage from './pages/ItemsetDetailPage';
import NewRunPage from './pages/NewRunPage';
import RunDetailPage from './pages/RunDetailPage';

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
        </Routes>
    );
}

export default App
