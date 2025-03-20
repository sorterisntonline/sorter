import { signal } from "@preact/signals-react";

export const current_session = signal(false);

// Track the last time we fetched the session to avoid repeated calls
let lastFetchTime = 0;
const FETCH_THROTTLE_MS = 2000; // Only fetch once every 2 seconds
let fetchPromise = null;

export const fetchSession = async () => {
  const now = Date.now();
  
  // If we've fetched recently, don't fetch again
  if (now - lastFetchTime < FETCH_THROTTLE_MS && current_session.value) {
    return current_session.value;
  }
  
  // If a fetch is already in progress, return the existing promise
  if (fetchPromise) {
    return fetchPromise;
  }
  
  try {
    // Record fetch attempt time
    lastFetchTime = now;
    
    // Set up the fetch promise
    fetchPromise = (async () => {
      const response = await fetch("/api/login", {
        credentials: "include",
      });

      if (response.ok) {
        const contentType = response.headers.get("content-type");
        
        if (contentType && contentType.includes("application/json")) {
          const data = await response.json();
          current_session.value = data;
          return data;
        } else {
          console.error("Expected JSON response, got:", contentType);
          current_session.value = false;
          return false;
        }
      } else {
        if (response.status !== 401) { // Don't log expected 401 errors
          console.error("Failed to fetch session:", response.statusText);
        }
        current_session.value = false;
        return false;
      }
    })();
    
    // Wait for the fetch to complete
    const result = await fetchPromise;
    return result;
  } catch (error) {
    console.error("Failed to fetch session:", error);
    current_session.value = false;
    return false;
  } finally {
    // Clear the fetch promise reference
    fetchPromise = null;
  }
};