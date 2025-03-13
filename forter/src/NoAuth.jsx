import React, { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth0 } from '@auth0/auth0-react';

// Pages that require authentication
const AUTH_REQUIRED_PATHS = [
  '/profile',
  '/keys',
  '/integrations'
  // Add other paths that require authentication
];

// Check if a path requires authentication
const requiresAuth = (path) => {
  // Check exact matches
  if (AUTH_REQUIRED_PATHS.includes(path)) {
    return true;
  }
  
  // Check path patterns (like namespaces or specific tag pages)
  if (path.startsWith('/namespace/')) {
    return true;
  }
  
  // Add other pattern checks as needed
  
  return false;
};

export const NoAuth = () => {
  const [_, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  const { appState } = useAuth0();

  useEffect(() => {
    // Get the previous path from appState or localStorage (for backward compatibility)
    const previousPath = appState?.logoutFrom || localStorage.getItem('logoutFrom') || '/';
    
    // Clear auth-related localStorage items
    localStorage.removeItem('returnTo');
    localStorage.removeItem('authReturnPath');
    localStorage.removeItem('logoutFrom');
    
    // Check if the previous path requires authentication
    if (requiresAuth(previousPath)) {
      // If auth is required, redirect to home
      setLocation('/');
    } else {
      // If auth is not required, redirect to the previous path
      setLocation(previousPath);
    }
    
    // Set loading to false after a short delay to ensure the redirect happens
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, [setLocation, appState]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-white dark:bg-black">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return null;
}; 