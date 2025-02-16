import React, { useEffect, useState } from 'react';
import { current_session, fetchSession } from '../session';
import { redirectToLogin } from './authUtils';

// Options type for withAuth configuration
// showError: if true, shows error page in place; if false, redirects to login
export const withAuth = (WrappedComponent, { showError = true } = {}) => {
  return function AuthenticatedComponent(props) {
    const [isSessionLoaded, setIsSessionLoaded] = useState(false);

    useEffect(() => {
      const checkSession = async () => {
        await fetchSession();
        setIsSessionLoaded(true);
      };
      checkSession();
    }, []);

    // Wait for session to load
    if (!isSessionLoaded) {
      return null;
    }

    // If no user is logged in
    if (!current_session.value?.user_name) {
      if (showError) {
        return (
          <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
            <div className="bg-gray-100 dark:bg-gray-800 p-6 shadow-md w-80 text-center">
              <h2 className="text-2xl mb-4 text-black dark:text-white">
                please log in to continue
              </h2>
              <button
                onClick={redirectToLogin}
                className="bg-blue-500 dark:bg-blue-700 text-white px-6 py-2 rounded hover:bg-blue-600 dark:hover:bg-blue-800"
              >
                login
              </button>
            </div>
          </div>
        );
      } else {
        // Redirect to login immediately
        redirectToLogin();
        return null;
      }
    }

    // If authenticated, render the protected component
    return <WrappedComponent {...props} />;
  };
}; 