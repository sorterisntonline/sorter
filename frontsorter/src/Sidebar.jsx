import React from 'react';
import { NavLink, useSearchParams } from 'react-router-dom'; // Use NavLink for active styling

function Sidebar() {
  const commonLinkClass = "block px-4 py-2 rounded-md text-gray-700 hover:bg-gray-100";
  const activeLinkClass = "bg-gray-200 font-semibold"; // Example active style
  const [searchParams, setSearchParams] = useSearchParams();

  const urlPkNamespace = searchParams.get('pk_namespace');
  const urlPk = searchParams.get('pk');
  const entitySet = urlPkNamespace && urlPk;

  return (
    <div className="w-64 h-screen bg-white p-4 flex flex-col fixed top-0 left-0">
      <div className="mb-6 text-xl font-bold text-brand-600">sorter</div>
      <nav className="flex-grow space-y-1">
        <NavLink
          to={entitySet ? `/?pk_namespace=${urlPkNamespace}&pk=${urlPk}` : '/'}
          end // Match root path exactly
          className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}
        >
          Home
        </NavLink>
        <NavLink
          to={entitySet ? `/search?pk_namespace=${urlPkNamespace}&pk=${urlPk}` : '/search'}
          className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}
        >
          Search
        </NavLink>
        <NavLink
          to={entitySet ? `/entity?pk_namespace=${urlPkNamespace}&pk=${urlPk}` : '/entity'}
          className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}
        >
          Entity
        </NavLink>
        <NavLink
          to={entitySet ? `/vote?pk_namespace=${urlPkNamespace}&pk=${urlPk}` : '/vote'}
          className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}
        >
          Vote
        </NavLink>
        <NavLink
          to={entitySet ? `/history?pk_namespace=${urlPkNamespace}&pk=${urlPk}` : '/history'}
          className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}
        >
          History
        </NavLink>
        <NavLink
          to={entitySet ? `/profile?pk_namespace=${urlPkNamespace}&pk=${urlPk}` : '/profile'}
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
