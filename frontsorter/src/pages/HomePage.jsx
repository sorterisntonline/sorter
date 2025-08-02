import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useDebouncedCallback } from "use-debounce";
import { searchAPI } from "../services/api.js";
import SearchResultsPanel from "../components/SearchResultsPanel.jsx";

const HomePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [inputValue, setInputValue] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Initialize input value from URL query parameter on mount
  useEffect(() => {
    const qParam = searchParams.get("q");
    if (qParam) {
      // URL decode the parameter value
      const decodedValue = decodeURIComponent(qParam);
      setInputValue(decodedValue);
      // Also perform search for existing query
      performSearch(decodedValue);
    }
  }, [searchParams]);

  // Function to perform search
  const performSearch = async (query) => {
    if (!query.trim()) {
      setSearchResults(null);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const results = await searchAPI.search(query);
      setSearchResults(results);
    } catch (err) {
      setError(err.message);
      setSearchResults(null);
    } finally {
      setIsLoading(false);
    }
  };

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
          <input 
            type="text" 
            placeholder="Enter a URL" 
            value={inputValue}
            onChange={handleInputChange}
            className="w-96 px-4 py-2 text-base border border-gray-300 focus:border-blue-500 focus:outline-none hover:shadow-sm transition-shadow" 
          />
        </div>

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