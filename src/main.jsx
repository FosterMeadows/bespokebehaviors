import "./index.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";
import { AuthProvider } from "./AuthContext.jsx";
import App from "./App.jsx";
import { AppErrorBoundary } from "./debug/ClientLogger.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <AuthProvider>
      <AppErrorBoundary><App /></AppErrorBoundary>
    </AuthProvider>
  </BrowserRouter>
);
