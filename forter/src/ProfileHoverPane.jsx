import React from "react";
import { useLocation } from "wouter";
import { current_session } from "./session";

export const ProfileHoverPane = ({ onClose }) => {
  const [location, setLocation] = useLocation();

  const handleLogout = async () => {
    const response = await fetch("/api/logout", {
      method: "POST",
      credentials: "include",
    });
    if (response.ok) {
      current_session.value = false;
      setLocation("/");
    } else {
      console.error("Logout failed:", await response.text());
    }
  };

  const handleNavigation = (path) => {
    setLocation(path);
    onClose();
  };

  return (
    <div className="absolute right-0 top-6 w-48 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded shadow-lg p-4 z-20">
      <div className="flex flex-col items-center">
        {/* Profile Picture */}
        <div 
          className="w-16 h-16 rounded-full mb-4 bg-gray-200 dark:bg-gray-700 overflow-hidden cursor-pointer"
          onClick={() => handleNavigation("/profile")}
          title="change profile picture (not implemented yet)"
        >
          <img
            src={current_session.value.profile_picture || "/tommyy_hla.jpeg"}
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
          className="w-full text-left py-2 px-4 rounded text-gray-400 dark:text-gray-500 cursor-not-allowed"
          disabled
          title="we haven't gotten to implementing this yet!"
        >
          settings
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
          onClick={handleLogout}
        >
          logout
        </button>
      </div>
    </div>
  );
};