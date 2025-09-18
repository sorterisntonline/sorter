import React from 'react';
import { NavLink, useSearchParams } from 'react-router-dom'; // Use NavLink for active styling
// Import icons from react-icons
import { FaHome, FaVoteYea, FaUser, FaSignOutAlt, FaSignInAlt } from 'react-icons/fa';
import { useAuth } from './contexts/AuthContext';

function Sidebar() {
  const auth = useAuth();
  const commonLinkClass = "block px-4 py-2 rounded-md text-gray-700 hover:bg-gray-100";
  const activeLinkClass = "bg-gray-200 font-semibold";
  const [searchParams] = useSearchParams();

  const urlPkNamespace = searchParams.get('pk_namespace');
  const urlPk = searchParams.get('pk');
  const entitySet = urlPkNamespace && urlPk;

  // Helper function to generate the 'to' prop value
  const generateTo = (path) => {
    return entitySet ? `${path}?pk_namespace=${urlPkNamespace}&pk=${urlPk}` : path;
  };

  const handleLogout = () => {
    if (confirm('Are you sure you want to logout?')) {
      auth.logout();
    }
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
          to={generateTo('/profile')}
          className={({ isActive }) => `${commonLinkClass} ${isActive ? activeLinkClass : ''}`}
        >
          <div className="flex items-center space-x-2">
            <FaUser />
            <span>Profile</span>
          </div>
        </NavLink>
      </nav>
      
      {/* User info and auth actions */}
      <div className="mt-auto border-t border-gray-200 pt-4">
        {auth.user && (
          <div className="mb-3">
            <div className="flex items-center space-x-3">
              {auth.user.avatar_url && (
                <img 
                  src={auth.user.avatar_url} 
                  alt="Avatar" 
                  className="w-8 h-8 rounded-full"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  @{auth.user.handle}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {auth.user.display_name}
                </p>
              </div>
            </div>
          </div>
        )}
        
        {auth.isAuthenticated ? (
          <button
            onClick={handleLogout}
            disabled={auth.isLoggingOut}
            className="w-full flex items-center justify-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
          >
            <FaSignOutAlt className="mr-2" />
            {auth.isLoggingOut ? 'Signing out...' : 'Sign out'}
          </button>
        ) : (
          <button
            onClick={() => (window.location.href = '/login')}
            className="w-full flex items-center justify-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
          >
            <FaSignInAlt className="mr-2" />
            Sign in
          </button>
        )}
      </div>
    </div>
  );
}

export default Sidebar;
