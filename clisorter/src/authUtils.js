// Get the base domain for authentication based on current hostname
const getAuthDomain = () => {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:3000';
    }
    if (hostname === 'staging.sorter.social') {
      return 'https://staging.sorter.social';
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
    
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    const isStaging = hostname === 'staging.sorter.social';
    
    if (returnPath && returnPath.includes('/music')) {
      if (isLocalhost) {
        window.location.href = `http://localhost:3000${returnPath}`;
      } else if (isStaging) {
        window.location.href = `https://staging.sorter.social${returnPath}`;
      } else {
        window.location.href = `https://music.sorter.social${returnPath.replace('/music', '')}`;
      }
    } else {
      if (isLocalhost) {
        window.location.href = 'http://localhost:3000';
      } else if (isStaging) {
        window.location.href = 'https://staging.sorter.social';
      } else {
        window.location.href = 'https://sorter.social';
      }
    }
  }; 