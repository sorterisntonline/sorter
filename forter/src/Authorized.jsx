import React, { useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useLocation } from 'wouter';

export const Authorized = () => {
  const { isLoading, error, appState } = useAuth0();
  const [_, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !error) {
      // Get the return URL from appState or fall back to localStorage for backward compatibility
      const returnTo = appState?.returnTo || localStorage.getItem('returnTo') || '/';
      
      // Clean up localStorage if it was used
      localStorage.removeItem('returnTo');
      localStorage.removeItem('authReturnPath');
      
      setLocation(returnTo);
    }
  }, [isLoading, error, appState, setLocation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-white dark:bg-black">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-white dark:bg-black text-black dark:text-white">
        <h2 className="text-xl mb-4">Authentication Error</h2>
        <p>{error.message}</p>
      </div>
    );
  }

  return null;
}; 