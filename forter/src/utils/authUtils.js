import { useAuth0 } from '@auth0/auth0-react';
import { current_session, fetchSession } from "../session";

// Track last sync time to prevent rapid repeated syncs
let lastSyncTime = 0;
const SYNC_THROTTLE_MS = 5000; // Only sync once every 5 seconds

// Get base URL based on current origin, with build-mode fallbacks for SSR/build
const getBaseUrl = () => {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
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
    
    // Clear the session state immediately to prevent UI inconsistencies
    current_session.value = false;
    
    // Return success instead of redirecting
    return true;
  } catch (error) {
    console.error("Logout failed:", error);
    return false;
  }
};

// Process Auth0 user data after authentication
export const processAuth0User = async (user) => {
  if (!user) return null;
  
  try {
    const response = await fetch("/api/auth0/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth0_id: user.sub,
        email: user.email,
        username: user.nickname || user.name || user.email.split('@')[0],
        picture: user.picture
      })
    });
    
    if (!response.ok) {
      console.error("Auth0 login failed:", response.statusText);
      return null;
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Auth0 login processing error:", error);
    return null;
  }
};

// Link an existing account with Auth0
export const linkAuth0Account = async (username, password, auth0User) => {
  try {
    const response = await fetch("/api/auth0/link", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_name: username,
        password: password,
        auth0_id: auth0User.sub,
        picture: auth0User.picture
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || "Account linking failed");
    }
    
    const data = await response.json();
    await fetchSession();
    return data;
  } catch (error) {
    console.error("Auth0 account linking error:", error);
    throw error;
  }
};

// Set custom username for Auth0 user
export const setAuth0Username = async (newUsername) => {
  try {
    const response = await fetch("/api/auth0/username", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_name: newUsername
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || "Username setup failed");
    }
    
    const data = await response.json();
    await fetchSession();
    return data;
  } catch (error) {
    console.error("Auth0 username setup error:", error);
    throw error;
  }
};

// Fetch user profile from backend
export const fetchUserProfile = async (fields = null) => {
  try {
    let url = "/api/profile";
    if (fields && Array.isArray(fields) && fields.length > 0) {
      url += `?info=${fields.join('.')}`;
    }
    
    const response = await fetch(url, {
      credentials: "include"
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        return null; // Not authenticated
      }
      throw new Error("Profile fetch failed");
    }
    
    return await response.json();
  } catch (error) {
    console.error("Profile fetch error:", error);
    return null;
  }
};

// Sync Auth0 user with backend session
export const syncAuth0UserWithSession = async (user) => {
  const now = Date.now();
  
  // Throttle syncing to prevent spamming requests
  if (now - lastSyncTime < SYNC_THROTTLE_MS && current_session.value) {
    return true;
  }
  
  lastSyncTime = now;
  
  try {
    // If we already have a session with the same user, don't re-sync
    if (current_session.value && 
        current_session.value.auth0_id === user.sub &&
        current_session.value.email === user.email) {
      return true;
    }
    
    // Sync with backend first
    const authResult = await processAuth0User(user);
    
    if (authResult) {
      // Check if we need to handle account linking or username setup
      if (authResult.needs_account_linking) {
        // Store the Auth0 user for the linking page
        localStorage.setItem('auth0LinkUser', JSON.stringify({
          sub: user.sub,
          email: user.email,
          picture: user.picture
        }));
        window.location.href = `${getBaseUrl()}/link-auth0`;
        return false;
      }
      
      if (authResult.needs_username_setup) {
        // Store username for the username setup page
        localStorage.setItem('auth0Username', authResult.user_name);
        window.location.href = `${getBaseUrl()}/setup-username`;
        return false;
      }
      
      // Regular successful login - update frontend session
      const sessionData = await fetchSession();
      
      // Additional user data syncing from Auth0 to frontend session
      if (sessionData) {
        current_session.value = {
          ...sessionData,
          profile_picture: user.picture,
          auth0_id: user.sub,
          auth0_email: user.email
        };
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error("Auth0 sync error:", error);
    return false;
  }
};