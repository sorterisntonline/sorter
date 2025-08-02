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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="container mx-auto px-4 py-16">
        <input 
          type="text" 
          placeholder="Enter a URL" 
          value={inputValue}
          onChange={handleInputChange}
          className="w-full px-6 py-4 pr-16 text-lg border-2 border-gray-300 focus:border-blue-500 focus:outline-none font-serif" 
        />
      </div>
    </div>
  );
};

export default HomePage;