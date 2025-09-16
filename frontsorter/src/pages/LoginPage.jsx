import React, { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { AuthAPI } from '../api/auth';

export default function LoginPage() {
  const auth = useAuth();

  // Redirect if already authenticated
  useEffect(() => {
    if (auth.isFullSession) {
      window.location.href = '/';
    } else if (auth.needsUsernameSelection) {
      window.location.href = '/auth/choose-username';
    }
  }, [auth.isFullSession, auth.needsUsernameSelection]);

  const handleSteamLogin = () => {
    window.location.href = AuthAPI.getSteamLoginUrl();
  };

  if (auth.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            sorter<span className="text-blue-600">.social</span>
          </h1>
          <h2 className="text-xl text-gray-600">
            Pairwise democratic ranking
          </h2>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="text-center">
            <h3 className="text-lg font-medium text-gray-900 mb-6">
              Sign in to get started
            </h3>
            
            <button
              onClick={handleSteamLogin}
              className="w-full flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gray-800 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
            >
              <svg 
                className="w-5 h-5 mr-3" 
                viewBox="0 0 24 24" 
                fill="currentColor"
              >
                <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142c0-.008 0-.016-.002-.022C11.979 5.979 14.98 3.42 18.76 3.42c3.783 0 6.849 3.07 6.849 6.852 0 3.784-3.066 6.852-6.849 6.852-.059 0-.117-.006-.176-.008l-4.098 2.931c.002.046.003.091.003.137 0 1.945-1.57 3.516-3.516 3.516-1.771 0-3.236-1.313-3.456-3.025L.333 18.767C1.574 22.637 6.251 25.375 11.979 24c9.649 0 11.979-7.2 11.979-12S21.628 0 11.979 0z"/>
              </svg>
              Sign in with Steam
            </button>

            <div className="mt-6 text-center">
              <p className="text-sm text-gray-500">
                By signing in, you agree to our terms of service and privacy policy.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center text-sm text-gray-500">
          <p className="mb-2">
            <strong>Why Steam?</strong> Steam provides verified gaming identity and social connections.
          </p>
          <p>
            Your Steam profile helps us build better gaming community rankings.
          </p>
        </div>
      </div>
    </div>
  );
}
