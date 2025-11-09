import React, { useState } from 'react';
import { NavLink, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { FaHome, FaVoteYea, FaUser, FaTasks, FaSignOutAlt, FaSpotify, FaBars, FaTimes, FaCog, FaGithub } from 'react-icons/fa';

function FloatingNav() {
  const [isExpanded, setIsExpanded] = useState(false);
  const auth = useAuth();
  const [searchParams] = useSearchParams();

  const urlPkNamespace = searchParams.get('ns');
  const urlPk = searchParams.get('pk');
  const entitySet = urlPkNamespace && urlPk;

  const generateTo = (path) => {
    return entitySet ? `${path}?ns=${urlPkNamespace}&pk=${urlPk}` : path;
  };

  const handleLogout = () => {
    if (confirm('Are you sure you want to logout?')) {
      auth.logout();
    }
  };

  const navItems = [
    { to: '/', icon: FaHome, label: 'Entities', end: true },
    { to: '/spotify', icon: FaSpotify, label: 'Spotify' },
    { to: '/spotify/pool', icon: FaCog, label: 'Pool Manager' },
    { to: '/github', icon: FaGithub, label: 'GitHub' },
    { to: generateTo('/vote'), icon: FaVoteYea, label: 'Vote' },
    { to: '/todos', icon: FaTasks, label: 'Todos' },
    { to: generateTo('/profile'), icon: FaUser, label: 'Profile' },
  ];

  return (
    <div className="floating-nav">
      {/* Toggle Button */}
      <button 
        className="nav-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
        title={isExpanded ? 'Close menu' : 'Open menu'}
      >
        {isExpanded ? <FaTimes /> : <FaBars />}
      </button>

      {/* Expanded Menu */}
      {isExpanded && (
        <div className="nav-menu">
          {/* Brand */}
          <div className="nav-brand">sorter</div>
          
          {/* Navigation Links */}
          <div className="nav-links">
            {navItems.map(({ to, icon: Icon, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={() => setIsExpanded(false)}
              >
                <Icon className="nav-icon" />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>

          {/* User Info & Logout */}
          {auth.user && (
            <div className="nav-footer">
              <div className="user-info">
                {auth.user.avatar_url && (
                  <img 
                    src={auth.user.avatar_url} 
                    alt="Avatar" 
                    className="user-avatar"
                  />
                )}
                <div className="user-details">
                  <div className="user-handle">@{auth.user.handle}</div>
                  <div className="user-name">{auth.user.display_name}</div>
                </div>
              </div>
              
              <button
                onClick={handleLogout}
                disabled={auth.isLoggingOut}
                className="logout-button"
                title="Sign out"
              >
                <FaSignOutAlt />
                {auth.isLoggingOut ? 'Signing out...' : 'Sign out'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Click outside to close */}
      {isExpanded && (
        <div 
          className="nav-overlay" 
          onClick={() => setIsExpanded(false)}
        />
      )}
    </div>
  );
}

export default FloatingNav;
