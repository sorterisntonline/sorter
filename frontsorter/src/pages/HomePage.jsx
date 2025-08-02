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
          } else {
            setSearchResults(uiResponse);
            setSuggestion(null);
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

  // Debounced function for autocomplete (fast)
  const debouncedAutocomplete = useDebouncedCallback((value) => {
    if (!isConnected) return;
    
    if (value.trim().length > 0) {
      wsAPI.autocomplete(value);
    } else {
      setSuggestion(null);
    }
  }, 150); // 150ms debounce for autocomplete

  // Debounced function to update URL query parameter and perform search (slower)
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
  }, 800); // 800ms debounce delay for search

  // Handle input change
  const handleInputChange = (e) => {
    const value = e.target.value;
    setInputValue(value);
    
    // Trigger autocomplete quickly
    debouncedAutocomplete(value);
    // Trigger search after a pause
    debouncedSearch(value);
  };

  const debouncedSearch = useDebouncedCallback((value) => {
    performSearch(value);
    
    // Update URL
    const newSearchParams = new URLSearchParams(searchParams);
    if (value.trim()) {
      newSearchParams.set("q", encodeURIComponent(value));
    } else {
      newSearchParams.delete("q");
    }
    setSearchParams(newSearchParams);
  }, 800);

  const handleKeyDown = (e) => {
    if (e.key === 'Tab' && suggestion) {
      e.preventDefault();
      const completion = suggestion.completion;
      setInputValue(completion);
      setSuggestion(null);
      
      // Immediately perform search and update URL
      debouncedSearch.cancel(); // Cancel any pending search
      performSearch(completion);
      
      const newSearchParams = new URLSearchParams(searchParams);
      newSearchParams.set("q", encodeURIComponent(completion));
      setSearchParams(newSearchParams);
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
                {suggestion.completion}
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