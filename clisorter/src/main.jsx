import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Cli } from "./Cli.jsx";
import "./App.css"
import "./index.css"

// Create a basename based on environment
const basename = process.env.NODE_ENV === 'development' ? '/music' : '';

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/*" element={<Cli />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
