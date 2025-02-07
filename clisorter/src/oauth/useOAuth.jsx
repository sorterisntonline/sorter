import { useEffect, useState } from 'react';

export const useOAuthStatus = (service) => {
  const [status, setStatus] = useState({
    isConnected: false,
    isLoading: true,
    error: null
  });

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/${service}/status`);
        const data = await response.json();
        
        setStatus({
          isConnected: data.connected,
          isLoading: false,
          error: data.reason || null
        });
      } catch (error) {
        setStatus({
          isConnected: false,
          isLoading: false,
          error: 'Failed to check connection status'
        });
      }
    };

    checkStatus();
  }, [service]);

  return status;
};

export const initiateOAuth = (service, returnPath = window.location.href) => {
  const authUrl = `/api/${service}/auth?redirect=${encodeURIComponent(returnPath)}`;
  console.log('Initiating OAuth with URL:', authUrl);
  console.log('Current location:', window.location.href);
  window.location.href = authUrl;
};
