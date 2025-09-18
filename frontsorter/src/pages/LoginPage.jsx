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

  const handleSpotifyLogin = () => {
    window.location.href = AuthAPI.getSpotifyLoginUrl();
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
              onClick={handleSpotifyLogin}
              className="w-full flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-400 transition-colors"
            >
              <svg
                className="w-5 h-5 mr-3"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 0a12 12 0 1012 12A12.013 12.013 0 0012 0zm5.485 17.306a1 1 0 01-1.372.33c-3.76-2.3-8.492-2.819-14.095-1.54a1 1 0 01-.437-1.95c6.062-1.358 11.256-.77 15.453 1.8a1 1 0 01.451 1.36zm1.829-3.787a1.25 1.25 0 01-1.714.413c-3.234-1.99-8.164-2.567-11.977-1.4a1.25 1.25 0 01-.716-2.397c4.37-1.306 9.905-.65 13.69 1.674a1.25 1.25 0 01.717 1.71zm.199-3.934c-3.846-2.282-10.206-2.49-13.854-1.357a1.5 1.5 0 11-.88-2.874c4.391-1.344 11.48-1.09 15.93 1.572a1.5 1.5 0 01-1.196 2.659z" />
              </svg>
              Sign in with Spotify
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
            <strong>Why Spotify?</strong> Spotify gives us verified music identities and listening preferences.
          </p>
          <p>
            Connect to unlock music-focused ranking experiences tailored to your taste.
          </p>
        </div>
      </div>
    </div>
  );
}
