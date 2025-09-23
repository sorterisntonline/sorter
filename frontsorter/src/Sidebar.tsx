import React from 'react';
import { NavLink, useSearchParams } from 'react-router-dom'; // Use NavLink for active styling
// Import icons from react-icons

import { useAuth } from './contexts/AuthContext';
import { FaHome, FaVoteYea, FaUser, FaTasks, FaSignOutAlt, FaSpotify} from 'react-icons/fa';
import './styles/sidebar.css';


function Sidebar() {
  const auth = useAuth();
  const [searchParams] = useSearchParams();

  const urlPkNamespace = searchParams.get('ns');
  const urlPk = searchParams.get('pk');
  const entitySet = urlPkNamespace && urlPk;

  // Helper function to generate the 'to' prop value
  const generateTo = (path) => {
    return entitySet ? `${path}?ns=${urlPkNamespace}&pk=${urlPk}` : path;
  };

  const handleLogout = () => {
    if (confirm('Are you sure you want to logout?')) {
      auth.logout();
    }
  };

  return (
    <div className="sidebar">
      <div className="sidebar-brand">sorter</div>
      <nav className="sidebar-nav">
        {/* Updated NavLink structure with icons */}
        <NavLink
          to={'/'}
          end
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
          <div className="nav-link-content">
            <FaHome className="nav-icon" />
            <span>Entities</span>
          </div>
        </NavLink>
        <NavLink
          to={'/spotify'}
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
          <div className="nav-link-content">
            <FaSpotify className="nav-icon spotify" />
            <span>Spotify Songs</span>
          </div>
        </NavLink>
        <NavLink
          to={generateTo('/vote')}
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
           <div className="nav-link-content">
            <FaVoteYea className="nav-icon" />
            <span>Vote</span>
          </div>
        </NavLink>
        <NavLink
          to={'/todos'}
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
           <div className="nav-link-content">
            <FaTasks className="nav-icon" />
            <span>Todos</span>
          </div>
        </NavLink>
        <NavLink
          to={generateTo('/profile')}
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
          <div className="nav-link-content">
            <FaUser className="nav-icon" />
            <span>Profile</span>
          </div>
        </NavLink>
      </nav>
      
      {/* User info and logout */}
      <div className="sidebar-footer">
        {auth.user && (
          <div className="user-info">
            <div className="user-profile">
              {auth.user.avatar_url && (
                <img 
                  src={auth.user.avatar_url} 
                  alt="Avatar" 
                  className="user-avatar"
                />
              )}
              <div className="user-details">
                <p className="user-handle">
                  @{auth.user.handle}
                </p>
                <p className="user-name">
                  {auth.user.display_name}
                </p>
              </div>
            </div>
          </div>
        )}
        
        <button
          onClick={handleLogout}
          disabled={auth.isLoggingOut}
          className="logout-button"
        >
          <FaSignOutAlt className="logout-icon" />
          {auth.isLoggingOut ? 'Signing out...' : 'Sign out'}
        </button>
      </div>
    </div>
  );
}

export default Sidebar;
