import React, { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function AuthSuccessPage() {
  const auth = useAuth();

  useEffect(() => {
    // Refetch session to get updated state
    auth.refetchSession();

    // Redirect after a short delay to show success message
    const timer = setTimeout(() => {
      window.location.href = '/';
    }, 2000);

    return () => clearTimeout(timer);
  }, [auth]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
              <svg 
                className="h-6 w-6 text-green-600" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M5 13l4 4L19 7" 
                />
              </svg>
            </div>
            
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Welcome back!
            </h2>
            
            <p className="text-gray-600 mb-6">
              You've been successfully signed in.
            </p>

            <div className="animate-pulse">
              <div className="flex items-center justify-center text-sm text-gray-500">
                <div className="animate-spin rounded-full h-4 w-4 border-b border-blue-600 mr-2"></div>
                Redirecting to dashboard...
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
