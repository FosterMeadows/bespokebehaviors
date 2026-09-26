import "./index.css";
import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router";
import { AuthProvider } from "./AuthContext.jsx";
import App from "./App.jsx";
import { AppErrorBoundary } from "./debug/ClientLogger.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <AuthProvider>
      <AppErrorBoundary>
        <Suspense fallback={<div role="status" className="flex min-h-svh items-center justify-center bg-slate-50 text-sm text-slate-600">Loading page…</div>}>
          <App />
        </Suspense>
      </AppErrorBoundary>
    </AuthProvider>
  </BrowserRouter>
);
