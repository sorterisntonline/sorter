import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { linkAuth0Account } from "./utils/authUtils";

export const LinkAuth0 = () => {
  const [location, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [auth0User, setAuth0User] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let isMounted = true;
    
    // Retrieve stored Auth0 user details from localStorage
    const loadAuth0User = () => {
      const storedUser = localStorage.getItem("auth0LinkUser");
      if (!storedUser) {
        if (isMounted) {
          setLocation("/login");
        }
        return;
      }

      try {
        const parsedUser = JSON.parse(storedUser);
        if (isMounted) {
          setAuth0User(parsedUser);
        }
      } catch (error) {
        console.error("Error parsing Auth0 user:", error);
        if (isMounted) {
          setLocation("/login");
        }
      }
    };
    
    loadAuth0User();
    
    return () => {
      isMounted = false;
    };
  }, [setLocation]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      if (!auth0User) {
        throw new Error("Auth0 user information is missing");
      }

      await linkAuth0Account(username, password, auth0User);
      
      // Clear the stored Auth0 user after successful linking
      localStorage.removeItem("auth0LinkUser");
      
      setSuccess(true);
      
      // Redirect to home after a brief delay
      setTimeout(() => {
        setLocation("/");
      }, 2000);
    } catch (error) {
      setError(error.message || "Failed to link account. Please check your credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
        <div className="bg-gray-100 dark:bg-gray-800 p-6 shadow-md w-80 text-center rounded-lg">
          <div className="text-green-500 text-5xl mb-4">✓</div>
          <h2 className="text-2xl mb-4 text-black dark:text-white">Account Linked!</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            Your account has been successfully linked with Auth0.
          </p>
          <p className="text-gray-700 dark:text-gray-300">
            Redirecting you to the home page...
          </p>
        </div>
      </div>
    );
  }

  if (!auth0User) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
        <div className="text-center dark:text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
      <div className="bg-gray-100 dark:bg-gray-800 p-6 shadow-md w-80 rounded-lg">
        <h2 className="text-2xl mb-4 text-center text-black dark:text-white">Link Your Account</h2>
        
        {auth0User.picture && (
          <div className="flex justify-center mb-4">
            <img 
              src={auth0User.picture} 
              alt="Auth0 Profile" 
              className="w-16 h-16 rounded-full"
            />
          </div>
        )}
        
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 text-center">
          Link your existing account to {auth0User.email}
        </p>
        
        {error && (
          <div className="mb-4 text-red-500 text-sm text-center">{error}</div>
        )}
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <input
              className="mt-1 p-2 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-black dark:text-white rounded"
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          
          <div className="mb-6">
            <input
              className="mt-1 p-2 w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-black dark:text-white rounded"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          
          <button
            type="submit"
            disabled={isLoading}
            className={`w-full p-2 rounded ${
              isLoading 
                ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed' 
                : 'bg-purple-500 dark:bg-purple-700 text-white hover:bg-purple-600 dark:hover:bg-purple-800'
            }`}
          >
            {isLoading ? "Linking..." : "Link Account"}
          </button>
        </form>
        
        <div className="mt-4 text-center">
          <button
            onClick={() => {
              localStorage.removeItem("auth0LinkUser");
              setLocation("/register");
            }}
            className="text-purple-500 hover:underline text-sm"
          >
            Create a new account instead
          </button>
        </div>
      </div>
    </div>
  );
}; 