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

        {/* Main Navigation Group */}
        <nav className="flex-shrink-0 px-3 py-4 overflow-y-auto">
          <h3 className="px-4 text-xs font-semibold text-gray-500 uppercase mb-2">
            Behavior App
          </h3>

          <NavLink
            to="/log"
            className={({ isActive }) =>
              `block px-4 py-2 rounded-lg transition-colors text-base font-medium ${
                isActive
                  ? "bg-blue-200 text-blue-800"
                  : "text-gray-700 hover:bg-gray-200"
              }`
            }
          >
            Behavior Log
          </NavLink>

          <NavLink
            to="/standards"
            className={({ isActive }) =>
              `block px-4 py-2 rounded-lg transition-colors text-base font-medium ${
                isActive
                  ? "bg-blue-200 text-blue-800"
                  : "text-gray-700 hover:bg-gray-200"
              }`
            }
          >
            Standards Tracker
          </NavLink>

          <NavLink
            to="/dailyplan"
            className={({ isActive }) =>
              `block px-4 py-2 rounded-lg transition-colors text-base font-medium ${
                isActive
                  ? "bg-blue-200 text-blue-800"
                  : "text-gray-700 hover:bg-gray-200"
              }`
            }
          >
            Daily Plan
          </NavLink>

          <NavLink
            to="/gradecalculator"
            className={({ isActive }) =>
              `block px-4 py-2 rounded-lg transition-colors text-base font-medium ${
                isActive
                  ? "bg-blue-200 text-blue-800"
                  : "text-gray-700 hover:bg-gray-200"
              }`
            }
          >
            Grade Calculator
          </NavLink>

          <NavLink
            to="/teachernotes"
            className={({ isActive }) =>
              `block px-4 py-2 rounded-lg transition-colors text-base font-medium ${
                isActive
                  ? "bg-blue-200 text-blue-800"
                  : "text-gray-700 hover:bg-gray-200"
              }`
            }
          >
            Teacher Notes
          </NavLink>

          <NavLink
            to="/megachecklist"
            className={({ isActive }) =>
              `block px-4 py-2 rounded-lg transition-colors text-base font-medium ${
                isActive
                  ? "bg-blue-200 text-blue-800"
                  : "text-gray-700 hover:bg-gray-200"
              }`
            }
          >
            Mega Checklist
          </NavLink>
        </nav>

        {/* Account Link at Bottom */}
        <nav className="mt-auto px-3 py-4 border-t border-gray-200">
          <NavLink
            to="/account"
            className={({ isActive }) =>
              `block px-4 py-2 rounded-lg transition-colors text-base font-medium ${
                isActive
                  ? "bg-blue-200 text-blue-800"
                  : "text-gray-700 hover:bg-gray-200"
              }`
            }
          >
            Account
          </NavLink>
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
      <main className="flex-1 overflow-auto p-6 bg-white">{children}</main>
    </div>
  );
}
