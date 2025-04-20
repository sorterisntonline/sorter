import React from 'react';
import { NavLink } from 'react-router-dom'; // Use NavLink for active styling

function Sidebar() {
  const commonLinkClass = "block px-4 py-2 rounded-md text-gray-700 hover:bg-gray-100";
  const activeLinkClass = "bg-gray-200 font-semibold"; // Example active style

  return (
    <div className="w-64 h-screen bg-white border-r border-gray-200 p-4 flex flex-col fixed top-0 left-0">
      <div className="mb-6 text-xl font-bold text-brand-600">sorter</div>
      <nav className="flex-grow space-y-1">
        <NavLink
          to="/"
          end // Match root path exactly
          className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}
        >
          Home
        </NavLink>
        <NavLink
          to="/search"
          className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}
        >
          Search
        </NavLink>
        <NavLink
          to="/entity/:not/:found"
          className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}
        >
          Details
        </NavLink>
        <NavLink
          to="/vote" // Assuming vote page might be initiated from elsewhere too
          className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}
        >
          Vote
        </NavLink>
        <NavLink
          to="/history"
          className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}
        >
          History
        </NavLink>
        <NavLink
          to="/profile"
          className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}
        >
          Profile
        </NavLink>
      </nav>
      {/* Optional: Footer or user info area */}
      <div className="mt-auto text-xs text-gray-400">
        User: Tommy
      </div>
    </div>
  );
}

export default Sidebar;
