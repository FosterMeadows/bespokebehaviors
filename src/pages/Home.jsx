import React from "react";
import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div className="grid grid-cols-2 grid-rows-2 gap-6 p-6">
      {/* Create New Report */}
      <Link
        to="/create"
        className="flex flex-col items-center justify-center w-full h-80 bg-white border border-gray-200 rounded-lg shadow-md hover:shadow-lg transition p-6"
      >
        {/* Placeholder for graphic */}
        <div className="h-22 w-12 bg-gray-200 rounded mb-2" />
        <span className="text-lg font-semibold text-gray-800">
          Create New Report
        </span>
      </Link>

      {/* View My Reteaches */}
      <Link
        to="/account/reports"
        className="flex flex-col items-center justify-center w-full h-80 bg-white border border-gray-200 rounded-lg shadow-md hover:shadow-lg transition p-6"
      >
        <div className="h-22 w-12 bg-gray-200 rounded mb-2" />
        <span className="text-lg font-semibold text-gray-800">
          View My Reteaches
        </span>
      </Link>

      {/* Manage Reteaches */}
      <Link
        to="/Dashboard"
        className="flex flex-col items-center justify-center w-full h-80 bg-white border border-gray-200 rounded-lg shadow-md hover:shadow-lg transition p-6"
      >
        <div className="h-22 w-12 bg-gray-200 rounded mb-2" />
        <span className="text-lg font-semibold text-gray-800">
          Manage Reteaches
        </span>
      </Link>

      {/* Search Reports */}
      <Link
        to="/student"
        className="flex flex-col items-center justify-center w-full h-80 bg-white border border-gray-200 rounded-lg shadow-md hover:shadow-lg transition p-6"
      >
        <div className="h-22 w-12 bg-gray-200 rounded mb-2" />
        <span className="text-lg font-semibold text-gray-800">
          Search Reports
        </span>
      </Link>
    </div>
  );
}
