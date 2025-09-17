import React from 'react';
import { NavLink, useSearchParams } from 'react-router-dom'; // Use NavLink for active styling
// Import icons from react-icons
import { FaHome, FaVoteYea, FaUser, FaTags } from 'react-icons/fa';

function Sidebar() {
  const commonLinkClass = "block px-4 py-2 rounded-md text-gray-700 hover:bg-gray-100";
  const activeLinkClass = "bg-gray-200 font-semibold"; // Example active style
  const [searchParams] = useSearchParams(); // Removed setSearchParams as it's not used

  const urlPkNamespace = searchParams.get('pk_namespace');
  const urlPk = searchParams.get('pk');
  const entitySet = urlPkNamespace && urlPk;

  // Helper function to generate the 'to' prop value
  const generateTo = (path) => {
    return entitySet ? `${path}?pk_namespace=${urlPkNamespace}&pk=${urlPk}` : path;
  };

  return (
    <div className="w-64 h-screen bg-white p-4 flex flex-col fixed top-0 left-0">
      <div className="mb-6 text-xl font-bold text-brand-600">sorter</div>
      <nav className="flex-grow space-y-1">
        {/* Updated NavLink structure with icons */}
        <NavLink
          to={'/'}
          end
          className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}
        >
          <div className="flex items-center space-x-2">
            <FaHome />
            <span>Entities</span>
          </div>
        </NavLink>
        <NavLink
          to={generateTo('/vote')}
          className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}
        >
           <div className="flex items-center space-x-2">
            <FaVoteYea />
            <span>Vote</span>
          </div>
        </NavLink>
        <NavLink
          to={'/folksonomy'}
          className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}
        >
           <div className="flex items-center space-x-2">
            <FaTags />
            <span>Folksonomy</span>
          </div>
        </NavLink>
        <NavLink
          to={generateTo('/profile')}
          className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}
        >
          <div className="flex items-center space-x-2">
            <FaUser />
            <span>Profile</span>
          </div>
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
