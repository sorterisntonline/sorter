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

// Handle user logout
export const handleLogout = async () => {
  try {
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