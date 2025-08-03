import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useDebouncedCallback } from "use-debounce";
import { wsAPI } from "../services/api.js";
import SearchResultsPanel from "../components/SearchResultsPanel.jsx";

const HomePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [inputValue, setInputValue] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [suggestion, setSuggestion] = useState(null);
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
          
          if (uiResponse.type === 'Suggestions') {
            setSuggestion(uiResponse.data.suggestion);
            // Clear search results when showing just suggestions
            if (!uiResponse.data.suggestion) {
              setSearchResults(null);
            }
          } else {
            setSearchResults(uiResponse);
            // Keep suggestions visible alongside other UI responses
            // Only clear suggestions if this is an empty/error state
            if (uiResponse.type === 'ErrorPage') {
              setSuggestion(null);
            }
          }
          
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

  // Initialize from URL on first load
  useEffect(() => {
    const qParam = new URLSearchParams(window.location.search).get("q");
    if (qParam && isConnected) {
      const decodedValue = decodeURIComponent(qParam);
      setInputValue(decodedValue);
      wsAPI.updateQuery(decodedValue);
    }
  }, [isConnected]);

  // Debounced function to send query updates to the backend
  const debouncedUpdateQuery = useDebouncedCallback((value) => {
    if (!isConnected) return;
    wsAPI.updateQuery(value);

    // Also update the URL in the background
    const newSearchParams = new URLSearchParams(searchParams);
    if (value.trim()) {
        newSearchParams.set("q", encodeURIComponent(value));
    } else {
        newSearchParams.delete("q");
    }
    // Use replace to avoid polluting browser history on every keystroke
    const newUrl = value.trim() ? `?${newSearchParams.toString()}` : window.location.pathname;
    window.history.replaceState({}, '', newUrl);

  }, 150); // Send updates quickly

  // Handle input change
  const handleInputChange = (e) => {
    const value = e.target.value;
    setInputValue(value);
    debouncedUpdateQuery(value);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Tab' && suggestion) {
      e.preventDefault();
      const completion = suggestion.completion;
      setInputValue(completion);
      setSuggestion(null);
      
      // Send the completed query to the backend immediately
      debouncedUpdateQuery.cancel();
      wsAPI.updateQuery(completion);

      // Update URL
      const newSearchParams = new URLSearchParams();
      newSearchParams.set("q", encodeURIComponent(completion));
      window.history.pushState({}, '', `?${newSearchParams.toString()}`);
    }
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
              onKeyDown={handleKeyDown}
              disabled={!isConnected}
              className="w-96 px-4 py-2 text-base border border-gray-300 focus:border-blue-500 focus:outline-none hover:shadow-sm transition-shadow bg-transparent" 
              style={{ position: 'relative', zIndex: 2 }}
            />
            {suggestion && inputValue && suggestion.completion.startsWith(inputValue) && (
              <div 
                className="absolute top-0 left-0 w-96 px-4 py-2 text-base text-gray-400 pointer-events-none"
                style={{ zIndex: 1 }}
              >
                <span className="text-transparent">{inputValue}</span>{suggestion.completion.substring(inputValue.length)}
              </div>
            )}
            {/* Connection status indicator */}
            <div className={`absolute right-2 top-1/2 transform -translate-y-1/2 w-2 h-2 rounded-full ${
              isConnected ? 'bg-green-500' : 'bg-red-500'
            }`} title={isConnected ? 'Connected' : 'Disconnected'} style={{ zIndex: 3 }} />
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