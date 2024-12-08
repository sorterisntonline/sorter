import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from 'react-router-dom';
import { LoginForm } from "./LoginForm";
import { Cli } from "./Cli.jsx";

import "./App.css"
import "./index.css"

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Cli />
      <LoginForm />
    </BrowserRouter>
  </React.StrictMode>
);
