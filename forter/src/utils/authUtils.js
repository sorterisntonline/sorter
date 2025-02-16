// Get base URL based on Vite's mode
const getBaseUrl = () => {
  switch (import.meta.env.MODE) {
    case 'production':
      return 'https://sorter.social';
    case 'staging':
      return 'https://staging.sorter.social';
    case 'development':
    default:
      // In development, use the current hostname
      const protocol = window.location.protocol;
      const hostname = window.location.hostname;
      const port = window.location.port;
      return `${protocol}//${hostname}${port ? ':' + port : ''}`;
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
    });
    if (!response.ok) {
      const msg = await response.text();
      alert(msg);
    }
    window.location.href = '/';
  } catch (error) {
    console.error("Logout failed:", error);
    window.location.href = '/';
  }
};