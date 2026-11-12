import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth0 } from "@auth0/auth0-react";
import { syncAuth0UserWithSession, handleAuthReturn } from "./utils/authUtils";

export const Authorized = () => {
  const [_, setLocation] = useLocation();
  const { isLoading, error, isAuthenticated, user } = useAuth0();
  const [status, setStatus] = useState("Processing authentication...");
  const [processingError, setProcessingError] = useState(null);

  useEffect(() => {
    const processAuth = async () => {
      if (isLoading) return;

      if (error) {
        console.error("Auth0 error:", error);
        setProcessingError("Authentication error: " + error.message);
        return;
      }

      if (isAuthenticated && user) {
        try {
          setStatus("Syncing your account...");
          const result = await syncAuth0UserWithSession(user);
          
          // If syncAuth0UserWithSession returns false, it means it's handling special flows
          // like account linking or username setup, so we don't need to redirect here
          if (result !== false) {
            handleAuthReturn();
          }
        } catch (error) {
          console.error("Error processing authentication:", error);
          setProcessingError("Failed to process authentication: " + error.message);
        }
      } else if (!isAuthenticated) {
        setProcessingError("Not authenticated. Please try logging in again.");
      }
    };

    processAuth();
  }, [isLoading, error, isAuthenticated, user, setLocation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p className="text-lg dark:text-white">Authenticating...</p>
        </div>
      </div>
    );
  }

  if (processingError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
        <div className="bg-gray-100 dark:bg-gray-800 p-6 shadow-md w-96 rounded-lg text-center">
          <div className="text-red-500 text-xl mb-4">Authentication Error</div>
          <p className="text-gray-700 dark:text-gray-300 mb-6">{processingError}</p>
          <button
            onClick={() => setLocation("/login")}
            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded"
          >
            Back to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-white dark:bg-black">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
        <p className="text-lg dark:text-white">{status}</p>
      </div>
    </div>
  );
}; 