import React, { useEffect } from 'react';
import { useLocation } from 'wouter';
import { current_session } from './session';

export const NoAuth = () => {
  const [_, setLocation] = useLocation();

  useEffect(() => {
    // Clear session state
    current_session.value = false;
    
    // Redirect to home after a short delay
    const timer = setTimeout(() => {
      setLocation('/');
    }, 2000);
    
    return () => clearTimeout(timer);
  }, [setLocation]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
      <div className="bg-gray-100 dark:bg-gray-800 p-6 shadow-md w-96 rounded-lg text-center">
        <h2 className="text-2xl mb-4 text-black dark:text-white">Logged Out</h2>
        <p className="text-gray-700 dark:text-gray-300 mb-6">
          You have been successfully logged out.
        </p>
        <p className="text-gray-600 dark:text-gray-400 text-sm">
          Redirecting to homepage...
        </p>
        <button
          onClick={() => setLocation('/')}
          className="mt-4 bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded"
        >
          Go to Home
        </button>
      </div>
    </div>
  );
}; 