import { createContext, useContext, useEffect, useState } from 'react';

// Define session type for better type safety
const SessionContext = createContext({
  session: null,
  isLoading: true,
  error: null,
  refetchSession: () => {},
});

export function SessionProvider({ children }) {
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSession = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch("/api/login", {
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch session');
      }
      
      const data = await response.json();
      setSession(data);
    } catch (err) {
      console.error("Failed to fetch session:", err);
      setError(err);
      setSession(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch session on mount
  useEffect(() => {
    fetchSession();
  }, []);

  return (
    <SessionContext.Provider 
      value={{
        session,
        isLoading,
        error,
        refetchSession: fetchSession,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

// Custom hook for accessing session data
export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}

// Helper functions
export function isLoggedIn(session) {
  return Boolean(session?.user_name);
} 