import { useState, useEffect, useCallback, useRef } from 'react';
import './App.css'

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

// Helper function to get the smallest image URL
const getSmallestImageUrl = (images) => {
    if (!images || images.length === 0) return null;
    // Assuming the API returns images sorted from largest to smallest
    return images[images.length - 1].url;
};

function App() {
    const [inputValue, setInputValue] = useState('');
    // Store objects in selectedTags if you need type/id/image later
    const [selectedTags, setSelectedTags] = useState([]);
    const [suggestions, setSuggestions] = useState([]); // Combined list of suggestions
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const [isLoading, setIsLoading] = useState(false);

    const suggestionBoxRef = useRef(null);

    // Updated fetchSuggestions to handle multiple types and images
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

            // Combine results into a single list with type and image information
            const combinedSuggestions = [];
            if (data.albums) {
                combinedSuggestions.push(...data.albums.map(item => ({
                    ...item,
                    type: 'album',
                    // Ensure images is always an array
                    images: item.images || []
                })));
            }
            if (data.artists) {
                 combinedSuggestions.push(...data.artists.map(item => ({
                    ...item,
                    type: 'artist',
                     // Ensure images is always an array
                    images: item.images || []
                })));
            }
             if (data.tracks) {
                combinedSuggestions.push(...data.tracks.map(item => ({
                    ...item,
                    type: 'track',
                    // Tracks use album images, ensure album and images exist
                    images: item.album?.images || []
                })));
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

    // Updated addTag to handle suggestion objects and store image URL
    const addTag = (suggestion) => {
         // Prevent duplicates based on type and id
         if (suggestion && !selectedTags.some(tag => tag.id === suggestion.id && tag.type === suggestion.type)) {
            const imageUrl = getSmallestImageUrl(suggestion.images);
            // Store the whole suggestion object or just parts as needed, plus imageUrl
            setSelectedTags([...selectedTags, {
                id: suggestion.id,
                name: suggestion.name,
                type: suggestion.type,
                imageUrl: imageUrl // Store the smallest image URL
            }]);
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
            } else if (inputValue.trim() !== '') {
                 // Optional: Add raw input as a generic tag if needed
                 // addTag({ name: inputValue.trim(), type: 'generic', id: Date.now() }); // Example generic tag
                 console.log("Enter pressed on raw input:", inputValue);
            } else {
                console.log("Enter pressed, but no suggestion highlighted or input entered.");
            }
            // Clear input and suggestions regardless of adding a tag or not
            setInputValue('');
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
        // Filter based on type and id
        setSelectedTags(selectedTags.filter(tag => !(tag.id === tagToRemove.id && tag.type === tagToRemove.type)));
    };

    useEffect(() => {
        function handleClickOutside(event) {
            if (suggestionBoxRef.current && !suggestionBoxRef.current.contains(event.target)) {
                 // Check if the click was outside the suggestion box AND not on the input itself
                 const inputElement = document.getElementById('tag-input');
                 if (!inputElement || !inputElement.contains(event.target)) {
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

    // Helper to render item details based on type, including image
    const renderSuggestionDetails = (suggestion) => {
        const imageUrl = getSmallestImageUrl(suggestion.images);
        const imageElement = imageUrl ? (
            <img
                src={imageUrl}
                alt="" // Alt text can be improved if needed
                className="suggestion-preview-image w-6 h-6 mr-2 rounded inline-block object-cover align-middle"
            />
        ) : (
             // Optional: Placeholder for items without images
             <span className="suggestion-preview-image w-6 h-6 mr-2 rounded inline-block bg-gray-200 align-middle"></span>
        );

        switch(suggestion.type) {
            case 'album':
                const albumArtists = suggestion.artists && Array.isArray(suggestion.artists) ? formatArtists(suggestion.artists) : 'Unknown Artist';
                return (
                    <>
                        {imageElement}
                        <span className="align-middle">{suggestion.name}</span>
                        <span className="text-xs text-gray-500 ml-2 align-middle">({albumArtists}) [Album]</span>
                    </>
                );
            case 'artist':
                return (
                     <>
                        {imageElement}
                        <span className="align-middle">{suggestion.name}</span>
                        <span className="text-xs text-gray-500 ml-2 align-middle">[Artist]</span>
                     </>
                );
            case 'track':
                const trackArtists = suggestion.artists && Array.isArray(suggestion.artists) ? formatArtists(suggestion.artists) : 'Unknown Artist';
                 return (
                     <>
                        {imageElement}
                        <span className="align-middle">{suggestion.name}</span>
                        <span className="text-xs text-gray-500 ml-2 align-middle">({trackArtists}) [Track]</span>
                     </>
                 );
            default:
                 return (
                     <>
                        {imageElement}
                        <span className="align-middle">{suggestion.name}</span>
                     </>
                 );
        }
    };

    return (
        <div className="app-container flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
          <div className="w-full max-w-lg relative">
            <div className="flex flex-wrap items-center border border-gray-300 rounded-md p-2 bg-white shadow-sm focus-within:ring-1 focus-within:ring-blue-500 focus-within:border-blue-500">
              {selectedTags.map((tag) => (
                // Use tag.type and tag.id for a unique key
                <span key={`${tag.type}-${tag.id}`} className="flex items-center bg-blue-500 text-white text-sm font-medium mr-2 mb-1 px-2.5 py-0.5 rounded-full">
                  {tag.imageUrl && (
                      <img
                          src={tag.imageUrl}
                          alt=""
                          className="tag-preview-image w-4 h-4 mr-1.5 rounded-sm object-cover"
                      />
                  )}
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
                placeholder={selectedTags.length === 0 ? "Search Spotify..." : ""}
                className="flex-grow p-1 outline-none text-sm min-w-[100px]" // Added min-width
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
                                    onMouseDown={(e) => { // Use onMouseDown to register click before blur closes suggestions
                                        e.preventDefault(); // Prevent input blur
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
