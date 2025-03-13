import { useAuth0 } from '@auth0/auth0-react';
import { current_session } from "../session";

// Get base URL based on Vite's mode
const getBaseUrl = () => {
  switch (import.meta.env.MODE) {
    case 'production':
      return 'https://sorter.social';
    case 'staging':
      return 'https://staging.sorter.social';
    case 'development':
    default:
      return 'http://localhost:3000';
  }
};

// Store the return path before redirecting
export const redirectToLogin = () => {
  const currentPath = window.location.pathname;
  localStorage.setItem('authReturnPath', currentPath);
  window.location.href = `${getBaseUrl()}/login`;
};

export const redirectToRegister = () => {
  const currentPath = window.location.pathname;
  localStorage.setItem('authReturnPath', currentPath);
  window.location.href = `${getBaseUrl()}/register`;
};

// Auth0 login (to be used with the useAuth0 hook)
export const loginWithAuth0 = (loginWithRedirect) => {
  const currentPath = window.location.pathname;
  
  // Use appState to securely store the return path
  loginWithRedirect({
    appState: { returnTo: currentPath }
  });
};

// Auth0 logout (to be used with the useAuth0 hook)
export const logoutWithAuth0 = (logout) => {
  // Store current path for potential return after logout
  const currentPath = window.location.pathname;
  
  logout({ 
    logoutParams: {
      returnTo: `${window.location.origin}/noauth`
    },
    appState: { logoutFrom: currentPath }
  });
};

// Function to handle return after successful auth
export const handleAuthReturn = () => {
  // Check for the new key first, then fall back to the old one for backward compatibility
  const returnPath = localStorage.getItem('returnTo') || localStorage.getItem('authReturnPath') || '/';
  
  // Clean up both keys
  localStorage.removeItem('returnTo');
  localStorage.removeItem('authReturnPath');
  
  const baseUrl = getBaseUrl();
  
  if (returnPath) {
    window.location.href = returnPath.startsWith('/') 
      ? `${baseUrl}${returnPath}`
      : returnPath;
  } else {
    window.location.href = baseUrl;
  }
};

// Handle user logout - updated to work with both Auth0 and legacy system
export const handleLogout = async (auth0Logout = null) => {
  try {
    // Store current path for potential return after logout
    localStorage.setItem('logoutFrom', window.location.pathname);
    
    // If Auth0 logout function is provided, use it
    if (auth0Logout) {
      logoutWithAuth0(auth0Logout);
      return true;
    }
    
    // Otherwise fall back to the existing API logout
    const response = await fetch("/api/logout", {
      method: "POST",
      credentials: "include",
      headers: {
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
      }
    });
    
    let responseData;
    try {
      responseData = await response.json();
    } catch (e) {
      const text = await response.text();
      try {
        responseData = JSON.parse(text);
      } catch {
        responseData = { message: text };
      }
    }
    
    if (!response.ok) {
      console.error("Logout failed:", responseData.message || "Unknown error");
    }
    
    // Return success instead of redirecting
    return true;
  } catch (error) {
    console.error("Logout failed:", error);
    return false;
  }
};

// Sync Auth0 user with current session
export const syncAuth0UserWithSession = (user) => {
  if (user) {
    current_session.value = {
      ...current_session.value,
      user_name: user.username || user.name,
      email: user.email,
      profile_picture: user.picture,
      // Add any other fields you want to sync
    };
  }
};