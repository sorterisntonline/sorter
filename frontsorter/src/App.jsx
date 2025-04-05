import { useState, useEffect, useCallback, useRef } from 'react';
import './App.css'

// Dummy data for tags (could be fetched from an API later)
const availableTags = ['react', 'javascript', 'tailwind', 'css', 'html', 'vite', 'node'];

// Debounce function (simple implementation)
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function App() {
    const [inputValue, setInputValue] = useState('');
    const [selectedTags, setSelectedTags] = useState(['The Dark Side of the Moon']); // Example album tag
    const [suggestions, setSuggestions] = useState([]); // State for album suggestions
    const [highlightedIndex, setHighlightedIndex] = useState(-1); // State for keyboard navigation
    const [isLoading, setIsLoading] = useState(false); // State for loading indicator

    const suggestionBoxRef = useRef(null); // Ref for suggestion box click outside detection

    // Function to fetch suggestions from the backend
    const fetchSuggestions = useCallback(async (query) => {
        if (!query || query.length < 2) { // Don't search for very short queries
            setSuggestions([]);
            return;
        }
        setIsLoading(true);
        setHighlightedIndex(-1); // Reset highlight when fetching new suggestions
        try {
            // Adjust the URL if your backend runs on a different port/host during development
            const response = await fetch(`/spotify/albums/search?q=${encodeURIComponent(query)}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
             // Assuming the backend returns { results: [{ name: 'Album Name', ... }, ...] }
             // Or adjust based on your actual SimplifiedAlbum structure in spotify.rs if needed
            setSuggestions(data.results || []);
        } catch (error) {
            console.error("Failed to fetch suggestions:", error);
            setSuggestions([]); // Clear suggestions on error
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Debounced version of the fetch function
    const debouncedFetchSuggestions = useCallback(debounce(fetchSuggestions, 300), [fetchSuggestions]);

    const handleInputChange = (event) => {
        const value = event.target.value;
        setInputValue(value);
        debouncedFetchSuggestions(value); // Call debounced fetch on input change
    };

    // Function to add a selected tag
    const addTag = (tag) => {
         if (tag && !selectedTags.includes(tag)) {
            setSelectedTags([...selectedTags, tag]);
        }
        setInputValue(''); // Clear input
        setSuggestions([]); // Clear suggestions
        setHighlightedIndex(-1); // Reset highlight
    }

    const handleKeyDown = (event) => {
        // Handle suggestion navigation
        if (suggestions.length > 0) {
            if (event.key === 'ArrowDown') {
                event.preventDefault(); // Prevent cursor move
                setHighlightedIndex(prevIndex =>
                    prevIndex < suggestions.length - 1 ? prevIndex + 1 : 0 // Loop to top
                );
                return; // Stop further processing for arrow down
            } else if (event.key === 'ArrowUp') {
                event.preventDefault(); // Prevent cursor move
                 setHighlightedIndex(prevIndex =>
                    prevIndex > 0 ? prevIndex - 1 : suggestions.length - 1 // Loop to bottom
                );
                return; // Stop further processing for arrow up
            }
        }

        // Handle Enter key
        if (event.key === 'Enter') {
            event.preventDefault(); // Prevent default form submission/line break
            if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
                // If a suggestion is highlighted, add it
                addTag(suggestions[highlightedIndex].name); // Assuming suggestion objects have a 'name' property
            } else {
                // Do nothing if Enter is pressed without a highlighted suggestion
                console.log("Enter pressed, but no suggestion highlighted.");
            }
             // Clear suggestions regardless of whether a tag was added
             setSuggestions([]);
             setHighlightedIndex(-1);
        }

        // Handle Backspace to remove the last tag (existing logic)
        if (event.key === 'Backspace' && inputValue === '' && selectedTags.length > 0) {
           removeTag(selectedTags[selectedTags.length - 1]);
        }
    };

    const removeTag = (tagToRemove) => {
        setSelectedTags(selectedTags.filter(tag => tag !== tagToRemove));
    };

    // Effect to handle clicks outside the suggestion box to close it
    useEffect(() => {
        function handleClickOutside(event) {
            if (suggestionBoxRef.current && !suggestionBoxRef.current.contains(event.target)) {
                // Check if the click target is also the input itself
                if (event.target.id !== 'tag-input') {
                   setSuggestions([]);
                   setHighlightedIndex(-1);
                }
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [suggestionBoxRef]);

    return (
        // Centering the content vertically and horizontally
        <div className="app-container flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
          <h1 className="text-3xl font-bold mb-6 text-gray-800">Album Selector</h1>
          {/* Container for the multi-tag input and suggestions */}
          <div className="w-full max-w-lg relative"> {/* Added relative positioning */}
            <label htmlFor="tag-input" className="block text-sm font-medium text-gray-700 mb-1">
              Search and select albums:
            </label>
            {/* The input area */}
            <div className="flex flex-wrap items-center border border-gray-300 rounded-md p-2 bg-white shadow-sm focus-within:ring-1 focus-within:ring-blue-500 focus-within:border-blue-500">
              {/* Display selected tags */}
              {selectedTags.map((tag) => (
                <span key={tag} className="flex items-center bg-blue-500 text-white text-sm font-medium mr-2 mb-1 px-2.5 py-0.5 rounded-full">
                  {tag} {/* Display album name */}
                  <button
                    type="button"
                    className="ml-1.5 flex-shrink-0 text-blue-100 hover:text-white focus:outline-none"
                    onClick={() => removeTag(tag)}
                    aria-label={`Remove ${tag}`}
                  >
                    &times; {/* Multiplication sign as close icon */}
                  </button>
                </span>
              ))}
              {/* The actual input field */}
              <input
                id="tag-input"
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={selectedTags.length > 0 ? "" : "Search albums..."}
                className="flex-grow p-1 outline-none text-sm"
                autoComplete="off" // Disable browser's default autocomplete
              />
            </div>

            {/* Suggestions dropdown */}
            { (isLoading || suggestions.length > 0) && (
                <div
                    ref={suggestionBoxRef}
                    className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto"
                >
                   {isLoading ? (
                       <div className="p-2 text-gray-500">Loading...</div>
                   ) : (
                        <ul>
                            {suggestions.map((suggestion, index) => (
                                <li
                                    key={suggestion.id || suggestion.name} // Use a unique ID if available from backend, fallback to name
                                    className={`p-2 cursor-pointer hover:bg-blue-100 ${
                                        index === highlightedIndex ? 'bg-blue-100' : ''
                                    }`}
                                    onMouseDown={(e) => { // Use onMouseDown to fire before input's onBlur
                                        e.preventDefault(); // Prevent input blur
                                        addTag(suggestion.name); // Assuming suggestion has a 'name'
                                    }}
                                >
                                    {/* You can display more info here, e.g., artist */}
                                    {suggestion.name}
                                    {/* {suggestion.artists && <span className="text-xs text-gray-500 ml-2">{suggestion.artists.map(a => a.name).join(', ')}</span>} */}
                                </li>
                            ))}
                        </ul>
                   )}
                </div>
            )}
          </div>
        </div>
    )
}

export default App
