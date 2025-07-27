import React from "react";
import { Link } from "react-router-dom";

// Import SVGs *as* components via ?react
import CreateReportIcon  from "../assets/homecreatereport.svg?react";
import MyReportsIcon     from "../assets/homemyreports.svg?react";
import ManageReportsIcon from "../assets/homemanagereports.svg?react";
import SearchReportsIcon from "../assets/homesearchreports.svg?react";

export default function Home() {
  // Base classes for icons and text with transition support
  const iconBaseClass = "h-32 w-32 mb-4 fill-current transition-colors duration-200";
  const textBaseClass = "text-2xl font-semibold transition-colors duration-200";

  return (
    <div className="grid grid-cols-2 grid-rows-2 gap-8 p-8">
      {/* Create New Report */}
      <Link
        to="/create"
        className="group transform transition duration-200 ease-out flex flex-col items-center justify-center
                   w-full h-[325px] bg-white border border-gray-200 rounded-lg shadow-md p-6
                   hover:shadow-lg hover:bg-red-50 hover:scale-102 hover:-translate-y-1"
      >
        <CreateReportIcon className={`${iconBaseClass} text-gray-400 group-hover:text-red-600`} />
        <span className={`${textBaseClass} text-gray-800 group-hover:text-red-600`}>
          Create New Report
        </span>
      </Link>

      {/* View My Reteaches */}
      <Link
        to="/account/reports"
        className="group transform transition duration-200 ease-out flex flex-col items-center justify-center
                   w-full h-[325px] bg-white border border-gray-200 rounded-lg shadow-md p-6
                   hover:shadow-lg hover:bg-green-50 hover:scale-102 hover:-translate-y-1"
      >
        <MyReportsIcon className={`${iconBaseClass} text-gray-400 group-hover:text-green-600`} />
        <span className={`${textBaseClass} text-gray-800 group-hover:text-green-600`}>
          View My Reteaches
        </span>
      </Link>

      {/* Manage Reteaches */}
      <Link
        to="/dashboard"
        className="group transform transition duration-200 ease-out flex flex-col items-center justify-center
                   w-full h-[325px] bg-white border border-gray-200 rounded-lg shadow-md p-6
                   hover:shadow-lg hover:bg-purple-50 hover:scale-102 hover:-translate-y-1"
      >
        <ManageReportsIcon className={`${iconBaseClass} text-gray-400 group-hover:text-purple-600`} />
        <span className={`${textBaseClass} text-gray-800 group-hover:text-purple-600`}>
          Manage Reteaches
        </span>
      </Link>

      {/* Search Reports */}
      <Link
        to="/student"
        className="group transform transition duration-200 ease-out flex flex-col items-center justify-center
                   w-full h-[325px] bg-white border border-gray-200 rounded-lg shadow-md p-6
                   hover:shadow-lg hover:bg-yellow-50 hover:scale-102 hover:-translate-y-1"
      >
        <SearchReportsIcon className={`${iconBaseClass} text-gray-400 group-hover:text-yellow-600`} />
        <span className={`${textBaseClass} text-gray-800 group-hover:text-yellow-600`}>
          Search Reports
        </span>
      </Link>
    </div>
  );
}
