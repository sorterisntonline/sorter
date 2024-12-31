import React from "react";
import { useLocation } from "wouter";
import { current_session } from "./session";
import { signal } from "@preact/signals-react";

export const ProfileHoverPane = ({ onClose }) => {
  const [location, setLocation] = useLocation();

  const handleLogout = () => {
    setLocation("/logout");
  };

  const handleNavigation = (path) => {
    setLocation(path);
    onClose();
  };

  return (
    <div className="absolute right-0 top-6 w-48 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded shadow-lg p-4 z-20">
      <div className="flex flex-col items-center">
        {/* Profile Picture */}
        <div className="w-16 h-16 rounded-full mb-4 bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <img
            src={current_session.value.profile_picture || "/default-profile.png"}
            alt="Profile"
            className="w-full h-full object-cover"
          />
        </div>

        {/* Buttons */}
        <button
          className="w-full text-left py-2 px-4 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          onClick={() => handleNavigation("/settings")}
        >
          Settings
        </button>
        <button
          className="w-full text-left py-2 px-4 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          onClick={() => handleNavigation("/groups")}
        >
          Groups
        </button>
        <button
          className="w-full text-left py-2 px-4 rounded text-red-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors mt-2"
          onClick={handleLogout}
        >
          Logout
        </button>
      </div>
    </div>
  );
};