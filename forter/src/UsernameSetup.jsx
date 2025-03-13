import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { setAuth0Username, handleAuthReturn } from "./utils/authUtils";
import { current_session, fetchSession } from "./session";

export const UsernameSetup = () => {
  const [location, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentUsername, setCurrentUsername] = useState("");
  
  useEffect(() => {
    // Check if user is authenticated
    const checkAuth = async () => {
      await fetchSession();
      if (!current_session.value || !current_session.value.user_name) {
        // User isn't logged in, redirect to login
        setLocation("/login");
        return;
      }
      
      // Get the stored username from localStorage or use current session
      const storedUsername = localStorage.getItem("auth0Username");
      if (storedUsername) {
        setCurrentUsername(storedUsername);
      } else if (current_session.value.user_name) {
        setCurrentUsername(current_session.value.user_name);
      } else {
        // No username to change, redirect to profile
        setLocation("/profile");
      }
    };
    
    checkAuth();
  }, [setLocation]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    
    try {
      if (!username || username.trim() === "") {
        throw new Error("Username cannot be empty");
      }
      
      // Username validation
      const usernameRegex = /^(?!_)(?!.*?_$)[a-zA-Z0-9_]{3,20}$/;
      if (!usernameRegex.test(username)) {
        throw new Error("Username must be 3-20 characters, alphanumeric with underscores (not at start/end)");
      }
      
      await setAuth0Username(username);
      
      // Clear the stored username
      localStorage.removeItem("auth0Username");
      
      // Redirect after successful username change
      handleAuthReturn();
    } catch (error) {
      setError(error.message || "Failed to set username");
    } finally {
      setIsLoading(false);
    }
  };

  if (!currentUsername) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
        <div className="loading-container dark:text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
      <div className="bg-gray-100 dark:bg-gray-800 p-6 shadow-md w-96 rounded-lg">
        <h2 className="text-2xl mb-2 text-center text-black dark:text-white">Choose Your Username</h2>
        
        <p className="text-center mb-6 text-gray-700 dark:text-gray-300">
          The username <strong>{currentUsername}</strong> is already taken or needs to be customized. 
          Please choose a unique username for your sorter.social account.
        </p>
        
        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-100 rounded text-sm">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label 
              htmlFor="username" 
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Username
            </label>
            <input
              id="username"
              className="mt-1 p-2 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-black dark:text-white rounded"
              type="text"
              placeholder="Choose a username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              3-20 characters, letters, numbers, and underscores
            </p>
          </div>
          
          <button
            type="submit"
            disabled={isLoading}
            className={`w-full p-3 rounded font-medium text-white ${
              isLoading 
                ? "bg-purple-400 dark:bg-purple-600 cursor-not-allowed" 
                : "bg-purple-600 hover:bg-purple-700"
            }`}
          >
            {isLoading ? "Setting Username..." : "Set Username"}
          </button>
        </form>
      </div>
    </div>
  );
}; 