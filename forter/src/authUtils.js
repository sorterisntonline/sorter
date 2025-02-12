// Get the base domain for authentication based on current hostname
const getAuthDomain = () => {
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:3000';
  }
  return 'https://sorter.social';
};

// Store the return path before redirecting
export const redirectToLogin = () => {
  const currentPath = window.location.pathname;
  localStorage.setItem('authReturnPath', currentPath);
  window.location.href = `${getAuthDomain()}/login`;
};

export const redirectToRegister = () => {
  const currentPath = window.location.pathname;
  localStorage.setItem('authReturnPath', currentPath);
  window.location.href = `${getAuthDomain()}/register`;
};

// Function to handle return after successful auth
export const handleAuthReturn = () => {
  const returnPath = localStorage.getItem('authReturnPath');
  localStorage.removeItem('authReturnPath'); // Clean up
  
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  
  if (returnPath && returnPath.includes('/music')) {
    if (isLocalhost) {
      window.location.href = `http://localhost:3000${returnPath}`;
    } else {
      window.location.href = `https://music.sorter.social${returnPath.replace('/music', '')}`;
    }
  } else {
    if (isLocalhost) {
      window.location.href = 'http://localhost:3000';
    } else {
      window.location.href = 'https://sorter.social';
    }
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