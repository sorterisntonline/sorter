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
    // Store more info in selectedTags, including pk_namespace and pk
    const [selectedTags, setSelectedTags] = useState([]);
    const [suggestions, setSuggestions] = useState([]);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const [isLoading, setIsLoading] = useState(false);
    // State to hold the details fetched for a single selected entity
    const [entityDetails, setEntityDetails] = useState(null);

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
            // Assuming backend provides pk_namespace in results now, or derive it
            const response = await fetch(`/spotify/search?q=${encodeURIComponent(query)}`); // Ensure this returns pk/pk_namespace
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();

            const combinedSuggestions = [];
            // --- MOCKUP: Assume backend /spotify/search now provides pk_namespace ---
            // Example: data.albums = [{ id: 'abc', name: 'Album A', type: 'album', images: [...], pk_namespace: 'spotify.album' }]
            // --- END MOCKUP ---

            if (data.albums) {
                combinedSuggestions.push(...data.albums.map(item => ({
                    ...item,
                    type: 'album',
                    pk_namespace: item.pk_namespace || 'spotify.album', // Add pk_namespace
                    pk: item.id, // Use id as pk
                    images: item.images || []
                })));
            }
            if (data.artists) {
                 combinedSuggestions.push(...data.artists.map(item => ({
                    ...item,
                    type: 'artist',
                    pk_namespace: item.pk_namespace || 'spotify.artist', // Add pk_namespace
                    pk: item.id, // Use id as pk
                    images: item.images || []
                })));
            }
             if (data.tracks) {
                combinedSuggestions.push(...data.tracks.map(item => ({
                    ...item,
                    type: 'track',
                    pk_namespace: item.pk_namespace || 'spotify.track', // Add pk_namespace
                    pk: item.id, // Use id as pk
                    images: item.album?.images || []
                })));
            }
             // Add potential 'sorter.tag' suggestions if backend supports it
             if (data.sorter_tags) {
                combinedSuggestions.push(...data.sorter_tags.map(item => ({
                    ...item, // Assuming item has { pk_namespace: 'sorter.tag', pk: 'tagname', title: '#TagName' }
                    name: item.title || item.pk,
                    type: 'tag', // Differentiate type
                    pk_namespace: item.pk_namespace,
                    pk: item.pk,
                    images: [] // Tags likely don't have images
                })));
             }

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

    // Updated addTag to store pk_namespace and pk
    const addTag = (suggestion) => {
        // Prevent duplicates based on pk_namespace and pk
        if (suggestion && !selectedTags.some(tag => tag.pk === suggestion.pk && tag.pk_namespace === suggestion.pk_namespace)) {
            const imageUrl = getSmallestImageUrl(suggestion.images);
            setSelectedTags([...selectedTags, {
                // Store the essential info needed for display and API calls
                pk_namespace: suggestion.pk_namespace, // Store pk_namespace
                pk: suggestion.pk,                   // Store pk
                name: suggestion.name,
                type: suggestion.type,
                imageUrl: imageUrl
            }]);
        }
        setInputValue('');
        setSuggestions([]);
        setHighlightedIndex(-1);
        // Don't fetch details here, let useEffect handle it
    }

    // Updated removeTag to filter correctly
    const removeTag = (tagToRemove) => {
        setSelectedTags(selectedTags.filter(tag => !(tag.pk === tagToRemove.pk && tag.pk_namespace === tagToRemove.pk_namespace)));
        // Don't clear details here, let useEffect handle it
    };

    const handleKeyDown = (event) => {
        if (suggestions.length > 0) {
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                setHighlightedIndex(prevIndex => (prevIndex + 1) % suggestions.length);
                return;
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                 setHighlightedIndex(prevIndex => (prevIndex - 1 + suggestions.length) % suggestions.length);
                return;
            }
        }

        if (event.key === 'Enter') {
            event.preventDefault();
            if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
                addTag(suggestions[highlightedIndex]); // Use updated addTag
            } else {
                 // console.log("Enter pressed on raw input:", inputValue); // Decide if raw input should do anything
            }
            // Clear input and suggestions after Enter regardless
            setInputValue('');
            setSuggestions([]);
            setHighlightedIndex(-1);
        }

        if (event.key === 'Backspace' && inputValue === '' && selectedTags.length > 0) {
           removeTag(selectedTags[selectedTags.length - 1]); // Use updated removeTag
        }
    };

    useEffect(() => {
        function handleClickOutside(event) {
            if (suggestionBoxRef.current && !suggestionBoxRef.current.contains(event.target)) {
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

    // --- NEW useEffect to fetch details when a single tag is selected ---
    useEffect(() => {
        const fetchDetails = async () => {
            if (selectedTags.length === 1) {
                const singleTag = selectedTags[0];
                // Assuming backend API is mounted at /api/entity/...
                // Adjust the URL path if needed!
                const apiUrl = `/api/entity/${encodeURIComponent(singleTag.pk_namespace)}/${encodeURIComponent(singleTag.pk)}/details`;
                console.log("Fetching details for:", apiUrl);
                try {
                    setIsLoading(true); // Indicate loading
                    const response = await fetch(apiUrl);
                    if (!response.ok) {
                         throw new Error(`HTTP error! status: ${response.status} for ${apiUrl}`);
                    }
                    const data = await response.json();
                    setEntityDetails(data);
                } catch (error) {
                    console.error("Failed to fetch entity details:", error);
                    setEntityDetails({ error: error.message }); // Store error state
                } finally {
                     setIsLoading(false);
                }
            } else {
                // Clear details if more or less than one tag is selected
                setEntityDetails(null);
            }
        };

        fetchDetails();
    }, [selectedTags]); // Re-run whenever selectedTags changes

    // Updated renderSuggestionDetails to potentially handle 'sorter.tag' type
    const renderSuggestionDetails = (suggestion) => {
        const imageUrl = getSmallestImageUrl(suggestion.images);
        const imageElement = imageUrl ? (
            <img
                src={imageUrl}
                alt="" // Alt text can be improved if needed
                className="suggestion-preview-image w-6 h-6 mr-2 rounded inline-block object-cover align-middle"
            />
        ) : (
             // Optional: Placeholder for items without images or sorter tags
             <span className={`suggestion-preview-image w-6 h-6 mr-2 rounded inline-block ${suggestion.type === 'tag' ? 'bg-gray-400' : 'bg-gray-200'} align-middle`}>
                 {suggestion.type === 'tag' && '#'} {/* Indicate tag */}
             </span>
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
             case 'tag': // Handle sorter tags
                 return (
                     <>
                        {imageElement}
                        <span className="align-middle">{suggestion.name}</span>
                        <span className="text-xs text-gray-500 ml-2 align-middle">[Sorter Tag]</span>
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
                // Use pk_namespace and pk for a unique key
                <span key={`${tag.pk_namespace}-${tag.pk}`} className="flex items-center bg-blue-500 text-white text-sm font-medium mr-2 mb-1 px-2.5 py-0.5 rounded-full">
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
                placeholder={selectedTags.length === 0 ? "Search Spotify, #tags..." : ""}
                className="flex-grow p-1 outline-none text-sm min-w-[100px]" // Added min-width
                autoComplete="off"
              />
            </div>

            {/* Suggestions dropdown */}
            { (isLoading || suggestions.length > 0) && (
                <div
                    ref={suggestionBoxRef}
                    className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto"
                >
                   {isLoading && !suggestions.length ? ( // Show loading only if suggestions aren't loaded yet
                       <div className="p-2 text-gray-500">Loading...</div>
                   ) : (
                        <ul>
                            {suggestions.map((suggestion, index) => (
                                <li
                                    key={`${suggestion.pk_namespace}-${suggestion.pk}`} // Use pk_namespace and pk for key
                                    className={`p-2 cursor-pointer hover:bg-blue-100 ${
                                        index === highlightedIndex ? 'bg-blue-100' : ''
                                    }`}
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        addTag(suggestion); // Use updated addTag
                                    }}
                                >
                                   {renderSuggestionDetails(suggestion)}
                                </li>
                            ))}
                        </ul>
                   )}
                </div>
            )}
          </div>

            {/* --- NEW: Display Area for Entity Details --- */}
            {entityDetails && (
                 <div className="mt-4 p-4 border border-gray-300 rounded-md bg-white shadow-sm w-full max-w-lg">
                    <h3 className="text-lg font-semibold mb-2">Selected Entity Details:</h3>
                     <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto">
                         {JSON.stringify(entityDetails, null, 2)}
                     </pre>
                 </div>
            )}
            {/* Show loading indicator specifically for details fetch */}
            {isLoading && selectedTags.length === 1 && !entityDetails && (
                 <div className="mt-4 text-gray-500">Loading details...</div>
            )}

        </div>
    );
}

export default App
