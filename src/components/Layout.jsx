import React from "react";
import { NavLink } from "react-router-dom";

export default function Layout({ children, displayName, logout }) {
  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-white shadow flex flex-col">
        <div className="h-16 flex items-center justify-center text-xl font-bold">
          Menu
        </div>
        <nav className="flex-1 px-2 py-4 space-y-2">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `block px-4 py-2 rounded ${
                isActive ? "bg-blue-500 text-white" : "hover:bg-blue-100"
              }`
            }
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/create"
            className={({ isActive }) =>
              `block px-4 py-2 rounded ${
                isActive ? "bg-blue-500 text-white" : "hover:bg-blue-100"
              }`
            }
          >
            Create Report
          </NavLink>
          <NavLink
            to="/view"
            className={({ isActive }) =>
              `block px-4 py-2 rounded ${
                isActive ? "bg-blue-500 text-white" : "hover:bg-blue-100"
              }`
            }
          >
            View Reports
          </NavLink>
          <NavLink
            to="/student"
            className={({ isActive }) =>
              `block px-4 py-2 rounded ${
                isActive ? "bg-blue-500 text-white" : "hover:bg-blue-100"
              }`
            }
          >
            Student View
          </NavLink>
        </nav>

        <NavLink
        to="/archive"
          className={({ isActive }) =>
            `block px-4 py-2 rounded ${
              isActive ? "bg-blue-500 text-white" : "hover:bg-blue-100"
            }`
          }
        >
          Archive
        </NavLink>


        <div className="p-4 border-t">
          <p className="text-sm mb-2">Hi, {displayName}</p>
          <button
            onClick={logout}
            className="w-full px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
