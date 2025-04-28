import { useState, useEffect, useRef, useMemo } from 'react';
// Import react-router-dom hook
import { useSearchParams, Link, Routes, Route } from 'react-router-dom';
// Import react-query hooks
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
// Import use-debounce hook
import { useDebounce } from 'use-debounce';
// Import CSSTransition for animations (Step 9)
import { CSSTransition, SwitchTransition } from 'react-transition-group';
import './App.css'

import Layout from './Layout';
import VotePage from './pages/VotePage';
import ProfilePage from './pages/ProfilePage';


function App() {
    return (
        <Routes>
            {/* Wrap all main pages within the Layout */}
            <Route path="/" element={<Layout />}>
                <Route path="vote" element={<VotePage />} /> {/* Keep existing vote page */}
                <Route path="profile" element={<ProfilePage />} />
                {/* Add a catch-all or Not Found route if desired */}
                <Route path="*" element={<div className="p-4">Page Not Found</div>} />
            </Route>
            {/* Routes outside the main layout (e.g., login) could go here */}
        </Routes>
    );
}

export default App
