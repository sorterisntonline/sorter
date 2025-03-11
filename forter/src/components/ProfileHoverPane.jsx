import React from "react";
import { useLocation } from "wouter";
import { current_session } from "../session";
import { useAuth0 } from "@auth0/auth0-react";
import { handleLogout, logoutWithAuth0 } from "../utils/authUtils";

export const ProfileHoverPane = ({ onClose }) => {
  const [location, setLocation] = useLocation();
  const { logout, user, isAuthenticated } = useAuth0();

  const handleProfileLogout = async () => {
    if (isAuthenticated) {
      logoutWithAuth0(logout);
    } else {
      await handleLogout();
    }
    current_session.value = false;
    setLocation("/");
    onClose();
  };

  const handleNavigation = (path) => {
    setLocation(path);
    onClose();
  };

  // Use Auth0 user picture if available, otherwise fall back to session data
  const profilePicture = isAuthenticated && user?.picture 
    ? user.picture 
    : (current_session.value?.profile_picture || "/tommyy_hla.jpeg");

  return (
    <div className="absolute right-0 top-6 w-48 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded shadow-lg p-4 z-20">
      <div className="flex flex-col items-center">
        {/* Profile Picture */}
        <div 
          className="w-16 h-16 rounded-full mb-4 bg-gray-200 dark:bg-gray-700 overflow-hidden cursor-pointer"
          onClick={() => handleNavigation("/profile")}
          title="view profile"
        >
          <img
            src={profilePicture}
            alt="Profile"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Buttons */}
        <button
          className="w-full text-left py-2 px-4 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          onClick={() => handleNavigation("/profile")}
        >
          profile
        </button>
        <button
          className="w-full text-left py-2 px-4 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          onClick={() => handleNavigation("/keys")}
        >
          API keys
        </button>
        <button
          className="w-full text-left py-2 px-4 rounded text-gray-400 dark:text-gray-500 cursor-not-allowed"
          disabled
          title="we haven't gotten to implementing this yet!"
        >
          groups
        </button>
        <button
          className="w-full text-left py-2 px-4 rounded text-red-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors mt-2"
          onClick={handleProfileLogout}
        >
          logout
        </button>
      </div>
    </div>
  );
};