import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useDebouncedCallback } from "use-debounce";
import { wsAPI } from "../services/api.js";
import SearchResultsPanel from "../components/SearchResultsPanel.jsx";

const HomePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [inputValue, setInputValue] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  // Initialize WebSocket connection on mount
  useEffect(() => {
    const initializeWebSocket = async () => {
      try {
        setIsLoading(true);
        await wsAPI.connect();
        setIsConnected(true);
        
        // Set up UI update handler
        wsAPI.onUIUpdate((uiResponse) => {
          console.log('Received UI update:', uiResponse);
          setSearchResults(uiResponse);
          setIsLoading(false);
          setError(null);
        });

        // Set up error handler
        wsAPI.onError((errorMessage) => {
          console.error('WebSocket error:', errorMessage);
          setError(errorMessage);
          setIsLoading(false);
        });

        setIsLoading(false);
      } catch (err) {
        console.error('Failed to connect to WebSocket:', err);
        setError('Failed to connect to server');
        setIsLoading(false);
        setIsConnected(false);
      }
    };

    initializeWebSocket();

    // Cleanup on unmount
    return () => {
      wsAPI.disconnect();
    };
  }, []);

  // Function to perform search via WebSocket
  const performSearch = useCallback((query) => {
    if (!isConnected) {
      console.log('WebSocket not connected, skipping search');
      return;
    }

    if (!query.trim()) {
      // Send empty search to get homepage
      wsAPI.search("");
      return;
    }

    setIsLoading(true);
    setError(null);
    wsAPI.search(query);
  }, [isConnected]);

  // Initialize input value from URL query parameter
  useEffect(() => {
    const qParam = searchParams.get("q");
    if (qParam && isConnected) {
      // URL decode the parameter value
      const decodedValue = decodeURIComponent(qParam);
      setInputValue(decodedValue);
      // Perform search via WebSocket
      performSearch(decodedValue);
    }
  }, [searchParams, isConnected, performSearch]);

  // Debounced function to update URL query parameter and perform search
  const debouncedUpdateUrlAndSearch = useDebouncedCallback((value) => {
    const newSearchParams = new URLSearchParams(searchParams);
    
    if (value.trim()) {
      // URL encode the value before setting it
      newSearchParams.set("q", encodeURIComponent(value));
    } else {
      // Remove the parameter if the input is empty
      newSearchParams.delete("q");
    }
    
    setSearchParams(newSearchParams);
    performSearch(value);
  }, 10); // 10ms debounce delay

  // Handle input change
  const handleInputChange = (e) => {
    const value = e.target.value;
    setInputValue(value);
    debouncedUpdateUrlAndSearch(value);
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Space for future voting pairs */}
      <div className="h-64"></div>
      
      {/* Google-style search interface */}
      <div className="flex flex-col items-center px-4">
        <div className="flex items-center gap-3 mb-8">
          <span className="text-4xl font-serif text-gray-800">sorter</span>
          <div className="relative">
            <input 
              type="text" 
              placeholder="Enter a URL" 
              value={inputValue}
              onChange={handleInputChange}
              disabled={!isConnected}
              className={`w-96 px-4 py-2 text-base border border-gray-300 focus:border-blue-500 focus:outline-none hover:shadow-sm transition-shadow ${
                !isConnected ? 'bg-gray-100 cursor-not-allowed' : ''
              }`} 
            />
            {/* Connection status indicator */}
            <div className={`absolute right-2 top-1/2 transform -translate-y-1/2 w-2 h-2 rounded-full ${
              isConnected ? 'bg-green-500' : 'bg-red-500'
            }`} title={isConnected ? 'Connected' : 'Disconnected'} />
          </div>
        </div>

        {/* Connection status */}
        {!isConnected && (
          <div className="mb-4 text-sm text-orange-600 bg-orange-50 px-4 py-2 rounded-lg border border-orange-200">
            Connecting to server...
          </div>
        )}

        {/* Search Results Panel */}
        <SearchResultsPanel 
          isLoading={isLoading}
          searchResults={searchResults}
          error={error}
        />
      </div>
    </div>
  );
};

export default HomePage;