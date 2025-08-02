import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useDebouncedCallback } from "use-debounce";

const HomePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [inputValue, setInputValue] = useState("");

  // Initialize input value from URL query parameter on mount
  useEffect(() => {
    const qParam = searchParams.get("q");
    if (qParam) {
      // URL decode the parameter value
      const decodedValue = decodeURIComponent(qParam);
      setInputValue(decodedValue);
    }
  }, [searchParams]);

  // Debounced function to update URL query parameter
  const debouncedUpdateUrl = useDebouncedCallback((value) => {
    const newSearchParams = new URLSearchParams(searchParams);
    
    if (value.trim()) {
      // URL encode the value before setting it
      newSearchParams.set("q", encodeURIComponent(value));
    } else {
      // Remove the parameter if the input is empty
      newSearchParams.delete("q");
    }
    
    setSearchParams(newSearchParams);
  }, 10); // 300ms debounce delay

  // Handle input change
  const handleInputChange = (e) => {
    const value = e.target.value;
    setInputValue(value);
    debouncedUpdateUrl(value);
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
      </div>
    </div>
  );
};

export default HomePage;