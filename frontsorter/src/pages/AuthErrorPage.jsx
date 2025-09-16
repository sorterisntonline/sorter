import React from 'react';
import { useSearchParams } from 'react-router-dom';

const ERROR_MESSAGES = {
  invalid_openid: 'Invalid Steam authentication response',
  steam_auth_failed: 'Steam authentication failed',
  verification_error: 'Error verifying Steam authentication',
  invalid_steam_id: 'Invalid Steam ID',
  steam_data_error: 'Failed to fetch Steam profile data',
  session_error: 'Failed to create session',
  database_error: 'Database error occurred',
};

export default function AuthErrorPage() {
  const [searchParams] = useSearchParams();
  const reason = searchParams.get('reason');
  
  const errorMessage = ERROR_MESSAGES[reason] || 'An unknown error occurred during authentication';

  const handleRetry = () => {
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
              <svg 
                className="h-6 w-6 text-red-600" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M6 18L18 6M6 6l12 12" 
                />
              </svg>
            </div>
            
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Authentication Failed
            </h2>
            
            <p className="text-gray-600 mb-6">
              {errorMessage}
            </p>

            <div className="space-y-3">
              <button
                onClick={handleRetry}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                Try again
              </button>
              
              <button
                onClick={() => window.location.href = '/'}
                className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                Go home
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Debug info in development */}
      {process.env.NODE_ENV === 'development' && reason && (
        <div className="sm:mx-auto sm:w-full sm:max-w-md mt-4">
          <div className="bg-gray-100 px-4 py-3 rounded-md">
            <p className="text-xs text-gray-500">
              <strong>Debug info:</strong> reason={reason}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
