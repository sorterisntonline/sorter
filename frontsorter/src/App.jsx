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

// Helper function to format artist names
const formatArtists = (artists) => {
    if (!artists || artists.length === 0) return '';
    return artists.map(a => a.name).join(', ');
}

function App() {
    const [inputValue, setInputValue] = useState('');
    // Store objects in selectedTags if you need type/id later, or just names
    const [selectedTags, setSelectedTags] = useState([
        { type: 'album', name: 'The Dark Side of the Moon', id: 'example1' } // Example with object
    ]);
    const [suggestions, setSuggestions] = useState([]); // Combined list of suggestions
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const [isLoading, setIsLoading] = useState(false);

    const suggestionBoxRef = useRef(null);

    // Updated fetchSuggestions to handle multiple types
    const fetchSuggestions = useCallback(async (query) => {
        if (!query || query.length < 2) {
            setSuggestions([]);
            return;
        }
        setIsLoading(true);
        setHighlightedIndex(-1);
        try {
            const response = await fetch(`/spotify/search?q=${encodeURIComponent(query)}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json(); // Expect { albums: [], artists: [], tracks: [] }

            // Combine results into a single list with type information
            const combinedSuggestions = [];
            if (data.albums) {
                combinedSuggestions.push(...data.albums.map(item => ({ ...item, type: 'album' })));
            }
            if (data.artists) {
                 combinedSuggestions.push(...data.artists.map(item => ({ ...item, type: 'artist' })));
            }
             if (data.tracks) {
                combinedSuggestions.push(...data.tracks.map(item => ({ ...item, type: 'track' })));
            }

            // Optional: Sort or limit combined suggestions if needed
            // combinedSuggestions.sort((a, b) => a.name.localeCompare(b.name));

            setSuggestions(combinedSuggestions);

        } catch (error) {
            console.error("Failed to fetch suggestions:", error);
            setSuggestions([]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const debouncedFetchSuggestions = useCallback(debounce(fetchSuggestions, 300), [fetchSuggestions]);

    const handleInputChange = (event) => {
        const value = event.target.value;
        setInputValue(value);
        debouncedFetchSuggestions(value);
    };

    // Updated addTag to handle suggestion objects
    const addTag = (suggestion) => {
         // Prevent duplicates based on type and id
         if (suggestion && !selectedTags.some(tag => tag.id === suggestion.id && tag.type === suggestion.type)) {
             // Store the whole suggestion object or just parts as needed
            setSelectedTags([...selectedTags, { id: suggestion.id, name: suggestion.name, type: suggestion.type }]);
        }
        setInputValue('');
        setSuggestions([]);
        setHighlightedIndex(-1);
    }

    const handleKeyDown = (event) => {
        if (suggestions.length > 0) {
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                setHighlightedIndex(prevIndex => (prevIndex + 1) % suggestions.length); // Simplified loop
                return;
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                 setHighlightedIndex(prevIndex => (prevIndex - 1 + suggestions.length) % suggestions.length); // Simplified loop
                return;
            }
        }

        if (event.key === 'Enter') {
            event.preventDefault();
            if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
                addTag(suggestions[highlightedIndex]); // Add the selected suggestion object
            } else {
                console.log("Enter pressed, but no suggestion highlighted.");
            }
            setSuggestions([]);
            setHighlightedIndex(-1);
        }

        if (event.key === 'Backspace' && inputValue === '' && selectedTags.length > 0) {
           // Remove the last tag object based on its properties (e.g., id)
           removeTag(selectedTags[selectedTags.length - 1]);
        }
    };

    // Updated removeTag to handle tag objects
    const removeTag = (tagToRemove) => {
        // Filter based on a unique property, like id, assuming it's present
        setSelectedTags(selectedTags.filter(tag => tag.id !== tagToRemove.id || tag.type !== tagToRemove.type));
    };

    useEffect(() => {
        function handleClickOutside(event) {
            if (suggestionBoxRef.current && !suggestionBoxRef.current.contains(event.target)) {
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

    // Helper to render item details based on type
    const renderSuggestionDetails = (suggestion) => {
        switch(suggestion.type) {
            case 'album':
                // Attempt to access artists; check if it exists and is an array
                const albumArtists = suggestion.artists && Array.isArray(suggestion.artists) ? formatArtists(suggestion.artists) : 'Unknown Artist';
                return (
                    <>
                        {suggestion.name}
                        <span className="text-xs text-gray-500 ml-2">({albumArtists}) [Album]</span>
                    </>
                );
            case 'artist':
                return (
                     <>
                        {suggestion.name}
                        <span className="text-xs text-gray-500 ml-2">[Artist]</span>
                     </>
                );
            case 'track':
                // Attempt to access artists; check if it exists and is an array
                const trackArtists = suggestion.artists && Array.isArray(suggestion.artists) ? formatArtists(suggestion.artists) : 'Unknown Artist';
                 return (
                     <>
                        {suggestion.name}
                        <span className="text-xs text-gray-500 ml-2">({trackArtists}) [Track]</span>
                     </>
                 );
            default:
                return suggestion.name;
        }
    };

    return (
        <div className="app-container flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
          <h1 className="text-3xl font-bold mb-6 text-gray-800">Spotify Search Selector</h1>
          <div className="w-full max-w-lg relative">
            <label htmlFor="tag-input" className="block text-sm font-medium text-gray-700 mb-1">
              Search albums, artists, tracks:
            </label>
            <div className="flex flex-wrap items-center border border-gray-300 rounded-md p-2 bg-white shadow-sm focus-within:ring-1 focus-within:ring-blue-500 focus-within:border-blue-500">
              {selectedTags.map((tag) => (
                // Use tag.id for the key if available and unique
                <span key={`${tag.type}-${tag.id || tag.name}`} className="flex items-center bg-blue-500 text-white text-sm font-medium mr-2 mb-1 px-2.5 py-0.5 rounded-full">
                  {tag.name} <span className='text-xs opacity-80 ml-1'>[{tag.type}]</span>
                  <button
                    type="button"
                    className="ml-1.5 flex-shrink-0 text-blue-100 hover:text-white focus:outline-none"
                    onClick={() => removeTag(tag)}
                    aria-label={`Remove ${tag.name} (${tag.type})`}
                  >
                    &times;
                  </button>
                </span>
              ))}
              <input
                id="tag-input"
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={selectedTags.length > 0 ? "" : "Search Spotify..."}
                className="flex-grow p-1 outline-none text-sm"
                autoComplete="off"
              />
            </div>

            {/* Suggestions dropdown - Updated Rendering */}
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
                                    key={`${suggestion.type}-${suggestion.id}`} // Ensure unique key using type and id
                                    className={`p-2 cursor-pointer hover:bg-blue-100 ${
                                        index === highlightedIndex ? 'bg-blue-100' : ''
                                    }`}
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        addTag(suggestion); // Pass the whole suggestion object
                                    }}
                                >
                                   {renderSuggestionDetails(suggestion)} {/* Use helper function for rendering */}
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
