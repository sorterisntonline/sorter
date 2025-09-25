import React, { createContext, useContext, useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AuthAPI } from '../api/auth';
import { AuthContextType, AuthProviderProps, SessionData } from '../types/contexts';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const queryClient = useQueryClient();
  
  // Query session status
  const {
    data: sessionData,
    isLoading,
    error,
    refetch: refetchSession,
  } = useQuery({
    queryKey: ['auth', 'session'],
    queryFn: AuthAPI.getSessionStatus,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: AuthAPI.logout,
    onSuccess: () => {
      // Clear all auth-related queries
      queryClient.setQueryData(['auth', 'session'], {
        authenticated: false,
        session_type: null,
        user: null,
        temp_data: null,
      });
      queryClient.invalidateQueries({ queryKey: ['auth'] });
    },
  });

  // Complete signup mutation
  const completeSignupMutation = useMutation({
    mutationFn: AuthAPI.completeSignup,
    onSuccess: () => {
      // Refetch session to get updated state
      refetchSession();
    },
  });

  // Derived state
  const isAuthenticated = sessionData?.authenticated || false;
  const user = sessionData?.user || null;
  const sessionType = sessionData?.session_type || null;
  const tempData = sessionData?.temp_data || null;
  
  // Helper flags
  const isFullSession = sessionType === 'full';
  const isTempSession = sessionType === 'temp';
  const needsUsernameSelection = isTempSession && tempData && !user;

  const authState = {
    // Data
    isLoading,
    error,
    isAuthenticated,
    user,
    sessionType,
    tempData,
    
    // Flags
    isFullSession,
    isTempSession,
    needsUsernameSelection,
    
    // Actions
    logout: logoutMutation.mutate,
    completeSignup: completeSignupMutation.mutate,
    refetchSession,
    
    // Mutation states
    isLoggingOut: logoutMutation.isPending,
    isCompletingSignup: completeSignupMutation.isPending,
    signupError: completeSignupMutation.error,
  };

  return (
    <AuthContext.Provider value={authState}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook for protected routes
export function useRequireAuth() {
  const auth = useAuth();
  
  useEffect(() => {
    if (!auth.isLoading && !auth.isAuthenticated) {
      window.location.href = '/login';
    }
  }, [auth.isLoading, auth.isAuthenticated]);
  
  return auth;
}

// Hook for username selection requirement
export function useRequireUsernameSelection() {
  const auth = useAuth();
  
  useEffect(() => {
    if (!auth.isLoading) {
      if (!auth.isAuthenticated) {
        window.location.href = '/login';
      } else if (!auth.needsUsernameSelection && !auth.isFullSession) {
        window.location.href = '/';
      }
    }
  }, [auth.isLoading, auth.isAuthenticated, auth.needsUsernameSelection, auth.isFullSession]);
  
  return auth;
}
