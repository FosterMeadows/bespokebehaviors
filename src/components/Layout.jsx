import React from "react";
import { NavLink } from "react-router-dom";

export default function Layout({ children, displayName, logout }) {
  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col">
        {/* Logo / Title */}
        <div className="h-16 flex items-center justify-center bg-gray-100 border-b border-gray-200">
          <span className="text-lg font-semibold text-gray-800">Behavior App</span>
        </div>
        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {[
            { to: "/", label: "Home" },
            { to: "/dashboard", label: "Dashboard" },
            { to: "/create", label: "Create Report" },
           
            { to: "/student", label: "Search Students" },
            { to: "/account/reports", label: "My Reports" },
            { to: "/account", label: "Account" },
            { to: "/archive", label: "Archive" },
          ].map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `block px-4 py-2 rounded-lg transition-colors text-base font-medium ${
                  isActive
                    ? "bg-blue-200 text-blue-800"
                    : "text-gray-700 hover:bg-gray-200"
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        {/* User Info & Sign Out */}
        <div className="p-4 bg-gray-100 border-t border-gray-200">
          <p className="text-sm text-gray-600 mb-2">Signed in as</p>
          <p className="text-base font-medium text-gray-800 mb-4">{displayName}</p>
          <button
            onClick={logout}
            className="w-full px-4 py-2 bg-red-400 text-white rounded-lg hover:bg-red-500 transition-colors text-sm font-medium"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-6 bg-white">
        {children}
      </main>
    </div>
  );
}
