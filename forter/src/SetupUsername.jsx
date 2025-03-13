import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { setAuth0Username } from "./utils/authUtils";
import { useAuth0 } from "@auth0/auth0-react";

export const SetupUsername = () => {
  const [location, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading } = useAuth0();
  const [username, setUsername] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let isMounted = true;
    
    // Load suggested username
    const loadSuggestedUsername = () => {
      // Check if we have a suggested username from localStorage
      const suggestedUsername = localStorage.getItem("auth0Username");
      if (suggestedUsername && isMounted) {
        setUsername(suggestedUsername);
        localStorage.removeItem("auth0Username");
      } else if (isAuthenticated && user && isMounted) {
        // Set default username from Auth0 if available
        setUsername(user.nickname || user.name?.replace(/\s+/g, '') || user.email?.split('@')[0] || "");
      }
    };
    
    loadSuggestedUsername();
    
    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, user]);

  // If user isn't authenticated with Auth0, redirect to login
  useEffect(() => {
    let isMounted = true;
    
    const checkAuth = () => {
      if (!isLoading && !isAuthenticated && isMounted) {
        setLocation("/login");
      }
    };
    
    checkAuth();
    
    return () => {
      isMounted = false;
    };
  }, [isLoading, isAuthenticated, setLocation]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      await setAuth0Username(username);
      setSuccess(true);
      
      // Redirect to home after a brief delay
      setTimeout(() => {
        setLocation("/");
      }, 2000);
    } catch (error) {
      setError(error.message || "Failed to set username. Please try a different one.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
        <div className="text-center dark:text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
        <div className="bg-gray-100 dark:bg-gray-800 p-6 shadow-md w-80 text-center rounded-lg">
          <div className="text-green-500 text-5xl mb-4">✓</div>
          <h2 className="text-2xl mb-4 text-black dark:text-white">Username Set!</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            Your username has been successfully set to @{username}.
          </p>
          <p className="text-gray-700 dark:text-gray-300">
            Redirecting you to the home page...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
      <div className="bg-gray-100 dark:bg-gray-800 p-6 shadow-md w-80 rounded-lg">
        <h2 className="text-2xl mb-4 text-center text-black dark:text-white">Choose Your Username</h2>
        
        {user?.picture && (
          <div className="flex justify-center mb-4">
            <img 
              src={user.picture} 
              alt="Profile" 
              className="w-16 h-16 rounded-full"
            />
          </div>
        )}
        
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 text-center">
          Pick a unique username for your new account
        </p>
        
        {error && (
          <div className="mb-4 text-red-500 text-sm text-center">{error}</div>
        )}
        
        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <div className="flex items-center border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded">
              <span className="text-gray-500 dark:text-gray-400 pl-2">@</span>
              <input
                className="mt-1 mb-1 ml-1 p-1 w-full bg-white dark:bg-gray-700 text-black dark:text-white focus:outline-none"
                type="text"
                placeholder="username"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                required
                minLength={3}
                maxLength={20}
                pattern="[a-z0-9_]+"
                title="Username can only contain lowercase letters, numbers, and underscores"
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              3-20 characters, lowercase letters, numbers, and underscores only
            </p>
          </div>
          
          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full p-2 rounded ${
              isSubmitting 
                ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed' 
                : 'bg-purple-500 dark:bg-purple-700 text-white hover:bg-purple-600 dark:hover:bg-purple-800'
            }`}
          >
            {isSubmitting ? "Setting username..." : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}; 