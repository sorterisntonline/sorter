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
            // Store enough info to potentially call ensure later
            setSelectedTags([...selectedTags, {
                pk_namespace: suggestion.pk_namespace,
                pk: suggestion.pk,
                name: suggestion.name,
                type: suggestion.type,
                imageUrl: imageUrl,
                // Store original artists/album info if needed for ensure metadata?
                // Example: For a track, store suggestion.artists, suggestion.album.name
                artists: suggestion.artists, // Store artists if available
                albumName: suggestion.album?.name, // Store album name if available (for tracks)
            }]);
        }
        setInputValue('');
        setSuggestions([]);
        setHighlightedIndex(-1);
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

    // --- Updated useEffect to Ensure Entity then Fetch Details ---
    useEffect(() => {
        const processSingleTag = async () => {
            if (selectedTags.length !== 1) {
                setEntityDetails(null); // Clear details if not exactly one tag
                return;
            }

            const singleTag = selectedTags[0];
            const { pk_namespace, pk, name, type, imageUrl, artists, albumName } = singleTag;
            const isSpotifyEntity = pk_namespace.startsWith('spotify.');

            setIsLoading(true); // Start loading indicator
            setEntityDetails(null); // Clear previous details

            try {
                // Step 1: Ensure the entity exists in our DB if it's from Spotify
                if (isSpotifyEntity) {
                    console.log(`Ensuring Spotify entity: ${pk_namespace}/${pk}`);
                    // Prepare metadata for the ensure payload
                    const ensureMetadata = {
                        imageUrl: imageUrl,
                        source: 'frontend_selection',
                        // Add more relevant info if available
                        ...(artists && { artists: formatArtists(artists) }),
                        ...(albumName && { albumName: albumName }),
                    };

                    const ensureResponse = await fetch(`/spotify/ensure`, { // Assuming mounted route from spotify.rs
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            pk_namespace: pk_namespace,
                            pk: pk,
                            title: name,
                            metadata: ensureMetadata, // Send some basic metadata
                        }),
                    });

                    if (!ensureResponse.ok) {
                        // Log the error but maybe try fetching details anyway? Or handle specific errors.
                        const errorText = await ensureResponse.text();
                        console.error(`Failed to ensure entity ${pk_namespace}/${pk}: ${ensureResponse.status} ${errorText}`);
                        // Optional: throw new Error(`Ensure failed: ${ensureResponse.status}`);
                        // If ensure fails critically, we might not want to proceed.
                        // For now, we'll log and continue to fetch details.
                    } else {
                         console.log(`Ensure successful or entity already existed for: ${pk_namespace}/${pk}`);
                         // Optionally use the returned entity from ensure if needed, but details fetch re-fetches
                    }
                }

                // Step 2: Fetch detailed information (including relationships)
                const detailsApiUrl = `/api/entity/${encodeURIComponent(pk_namespace)}/${encodeURIComponent(pk)}/details`;
                console.log("Fetching details from:", detailsApiUrl);
                const detailsResponse = await fetch(detailsApiUrl);

                if (!detailsResponse.ok) {
                    throw new Error(`HTTP error! status: ${detailsResponse.status} for ${detailsApiUrl}`);
                }
                const data = await detailsResponse.json();
                setEntityDetails(data);

            } catch (error) {
                console.error("Failed processing single tag:", error);
                setEntityDetails({ error: `Failed to load details: ${error.message}` }); // Store error state
            } finally {
                setIsLoading(false); // Stop loading indicator
            }
        };

        processSingleTag();
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

            {/* Display Area for Entity Details or Loading/Error */}
            <div className="mt-4 w-full max-w-lg">
                {isLoading && selectedTags.length === 1 && (
                    <div className="p-4 border border-gray-300 rounded-md bg-white shadow-sm text-gray-500">
                        Loading details...
                    </div>
                )}
                 {!isLoading && entityDetails && (
                     <div className="p-4 border border-gray-300 rounded-md bg-white shadow-sm">
                         <h3 className="text-lg font-semibold mb-2">Selected Entity Details:</h3>
                         <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto">
                             {JSON.stringify(entityDetails, null, 2)}
                         </pre>
                     </div>
                 )}
                 {/* Consider showing a specific error message if entityDetails contains an error object */}
                 {!isLoading && entityDetails?.error && (
                     <div className="p-4 border border-red-300 rounded-md bg-red-50 shadow-sm text-red-700">
                        Error: {entityDetails.error}
                     </div>
                 )}
            </div>
        </div>
    );
}

export default App
