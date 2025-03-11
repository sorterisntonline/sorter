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
  localStorage.setItem('authReturnPath', currentPath);
  loginWithRedirect();
};

// Auth0 logout (to be used with the useAuth0 hook)
export const logoutWithAuth0 = (logout) => {
  logout({ 
    logoutParams: {
      returnTo: window.location.origin
    }
  });
};

// Function to handle return after successful auth
export const handleAuthReturn = () => {
  const returnPath = localStorage.getItem('authReturnPath');
  localStorage.removeItem('authReturnPath'); // Clean up
  
  const baseUrl = getBaseUrl();
  
  if (returnPath) {
    window.location.href = `${baseUrl}${returnPath}`;
  } else {
    window.location.href = baseUrl;
  }
};

// Handle user logout - updated to work with both Auth0 and legacy system
export const handleLogout = async (auth0Logout = null) => {
  try {
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
    
    // Always redirect to home page after logout attempt
    window.location.href = '/';
    return true;
  } catch (error) {
    console.error("Logout failed:", error);
    window.location.href = '/';
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