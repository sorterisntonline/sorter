import React, { useEffect, useState } from 'react';
import { current_session, fetchSession } from '../session';
import { redirectToLogin } from './authUtils';
import { useAuth0 } from '@auth0/auth0-react';

// Options type for withAuth configuration
// showError: if true, shows error page in place; if false, redirects to login
export const withAuth = (WrappedComponent, { showError = true } = {}) => {
  return function AuthenticatedComponent(props) {
    const [isSessionLoaded, setIsSessionLoaded] = useState(false);
    const { isAuthenticated, isLoading } = useAuth0();

    useEffect(() => {
      let isMounted = true;
      let sessionCheckTimeout = null;
      
      const checkSession = async () => {
        await fetchSession();
        if (isMounted) {
          setIsSessionLoaded(true);
        }
      };
      
      checkSession();
      
      return () => {
        isMounted = false;
        if (sessionCheckTimeout) {
          clearTimeout(sessionCheckTimeout);
        }
      };
    }, []);

    // Wait for both regular session and Auth0 to load
    if (!isSessionLoaded || isLoading) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
        </div>
      );
    }

    // If authenticated through Auth0 or regular session
    if (isAuthenticated || current_session.value?.user_name) {
      return <WrappedComponent {...props} />;
    }

    // If no user is logged in through either method
    if (showError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
          <div className="bg-gray-100 dark:bg-gray-800 p-6 shadow-md w-80 text-center rounded-lg">
            <h2 className="text-2xl mb-4 text-black dark:text-white">
              please log in to continue
            </h2>
            <button
              onClick={redirectToLogin}
              className="bg-purple-500 dark:bg-purple-700 text-white px-6 py-2 rounded hover:bg-purple-600 dark:hover:bg-purple-800"
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
  };
}; 