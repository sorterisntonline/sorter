import React from "react";
import { useLocation } from "wouter";
import { current_session } from "../session";
import { useAuth0 } from "@auth0/auth0-react";
import { handleLogout } from "../utils/authUtils";
import { MenuButton } from "./MenuButton";

export const ProfileHoverPane = ({ onClose, onLogout }) => {
  const [location, setLocation] = useLocation();
  const { logout, user, isAuthenticated } = useAuth0();

  const handleProfileLogout = async () => {
    if (onLogout) {
      // Use the parent's logout handler if provided
      onLogout();
    } else {
      // Fallback to own implementation
      const success = await handleLogout(isAuthenticated ? logout : null);
      if (success) {
        current_session.value = false;
        setLocation("/");
      }
    }
    onClose();
  };

  const handleNavigation = (path) => {
    setLocation(path);
    onClose();
  };

  // Use Auth0 user picture if available, otherwise fall back to session data
  const profilePicture = isAuthenticated && user?.picture 
    ? user.picture 
    : (current_session.value?.pfp_url || "/tommyy_hla.jpeg");

  // Icons
  const profileIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
    </svg>
  );

  const keysIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clipRule="evenodd" />
    </svg>
  );

  const groupsIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
    </svg>
  );

  const logoutIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V4a1 1 0 00-1-1H3zm11.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L15.586 9H8a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
    </svg>
  );

  return (
    <div className="absolute right-0 top-10 w-64 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg shadow-lg p-4 z-20 transform transition-transform duration-200 ease-in-out">
      <div className="flex flex-col items-center">
        {/* Profile Picture */}
        <div 
          className="w-16 h-16 rounded-full mb-4 bg-gray-200 dark:bg-gray-700 overflow-hidden cursor-pointer border-2 border-blue-300 dark:border-blue-700 hover:border-blue-500 dark:hover:border-blue-500 transition-colors"
          onClick={() => handleNavigation("/profile")}
          title="view profile"
        >
          <img
            src={profilePicture}
            alt="Profile"
            className="w-full h-full object-cover"
          />
        </div>

        {/* User Name */}
        <div className="mb-4 text-center">
          <span className="font-medium">@{current_session.value?.user_name}</span>
        </div>

        {/* Buttons */}
        <MenuButton 
          icon={profileIcon}
          onClick={() => handleNavigation("/profile")}
          tooltip="View your profile"
        >
          Profile
        </MenuButton>
        
        <MenuButton 
          icon={keysIcon}
          onClick={() => handleNavigation("/keys")}
          tooltip="Manage your API keys"
        >
          API Keys
        </MenuButton>
        
        <MenuButton 
          icon={groupsIcon}
          disabled={true}
          tooltip="Feature coming soon"
        >
          Groups
        </MenuButton>
        
        <MenuButton 
          icon={logoutIcon}
          variant="danger"
          onClick={handleProfileLogout}
          className="mt-3"
          confirmWarning={true}
          warningMessage="Are you sure you want to log out?"
        >
          Logout
        </MenuButton>
      </div>
    </div>
  );
};