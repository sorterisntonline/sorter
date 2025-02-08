import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Cli } from "./Cli.jsx";
import { redirectToLogin, redirectToRegister } from './authUtils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import "./App.css"
import "./index.css"

// Create a basename based on environment
const basename = process.env.NODE_ENV === 'development' ? '/music' : '';

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={basename}>
        <Routes>
          <Route path="/*" element={<Cli />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
