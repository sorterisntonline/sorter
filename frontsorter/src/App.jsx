import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
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

// Helper function to get the *largest* image URL (or a specific size)
const getLargestImageUrl = (images, minWidth = 300) => {
    if (!images || images.length === 0) return null;
    // Find the first image that meets the minimum width or default to the first (largest)
    const suitableImage = images.find(img => img.width >= minWidth);
    return suitableImage ? suitableImage.url : images[0].url;
};

// --- NEW COMPONENT: EntityDetailsDisplay ---
function EntityDetailsDisplay({ entityDetails }) {
    if (!entityDetails || !entityDetails.entity) {
        return <div className="text-gray-500">No details available.</div>;
    }

    const { entity, parents, children } = entityDetails;
    const { title, pk_namespace, metadata } = entity;
    const entityType = pk_namespace.split('.')[1]; // e.g., 'album', 'artist', 'track'

    // Basic info: Title and Type
    let basicInfo = (
        <h3 className="text-xl font-semibold mb-2">
            {title} <span className="text-sm font-normal text-gray-500 capitalize">[{entityType}]</span>
        </h3>
    );

    let imageElement = null;
    if (metadata?.images && metadata.images.length > 0) {
        const imageUrl = getLargestImageUrl(metadata.images, 300); // Get a larger image
        if (imageUrl) {
             imageElement = (
                 <img
                     src={imageUrl}
                     alt={`Cover for ${title}`}
                     className="w-32 h-32 md:w-48 md:h-48 object-cover rounded-md float-left mr-4 mb-2"
                 />
             );
        }
    }

    let detailsList = [];

    // Common details based on type
    if (metadata?.artists && Array.isArray(metadata.artists)) {
        detailsList.push(
            <li key="artists"><strong>Artist(s):</strong> {formatArtists(metadata.artists)}</li>
        );
    }
     if (metadata?.release_date) {
        detailsList.push(
            <li key="release"><strong>Released:</strong> {metadata.release_date}</li>
        );
    }
     if (metadata?.label) {
        detailsList.push(
            <li key="label"><strong>Label:</strong> {metadata.label}</li>
        );
    }
    // Add more specific details based on entityType if needed...

    return (
        <div className="p-4 border border-gray-300 rounded-md bg-white shadow-sm clear-both"> {/* clear-both needed if image floats */}
            {imageElement}
            {basicInfo}
            {detailsList.length > 0 && (
                 <ul className="text-sm space-y-1 mb-2 list-none"> {/* Use list-none if using custom labels like <strong> */}
                     {detailsList}
                 </ul>
            )}
            {/* Placeholder for Parent/Child rendering */}
             {(parents?.length > 0 || children?.length > 0) && (
                <div className="mt-4 pt-2 border-t border-gray-200 text-xs text-gray-600">
                    <p>Relationships placeholder (Parents: {parents?.length || 0}, Children: {children?.length || 0})</p>
                 </div>
             )}
             {/* Debug Raw Data Link (Optional) */}
             {/* <details className="mt-4 text-xs">
                 <summary className="cursor-pointer text-gray-500">Show Raw Data</summary>
                 <pre className="bg-gray-50 p-2 rounded overflow-auto mt-1">
                     {JSON.stringify(entityDetails, null, 2)}
                 </pre>
             </details> */}
        </div>
    );
}
// --- END NEW COMPONENT ---

function App() {
    // Get searchParams and setSearchParams from the hook
    const [searchParams, setSearchParams] = useSearchParams();
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
            // When adding a tag, we now set it as the *only* selected tag
            setSelectedTags([{
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
        // Since we only allow one tag now for viewing details, removing means clearing all
        setSelectedTags([]);
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

    // --- NEW useEffect for Initial Load from Query Params ---
    useEffect(() => {
        const initialPkNamespace = searchParams.get('pk_namespace');
        const initialPk = searchParams.get('pk');

        // Only set initial state if query params exist AND selectedTags is currently empty
        // to avoid overwriting user selections after initial load.
        if (initialPkNamespace && initialPk && selectedTags.length === 0) {
            console.log("Setting initial tag from URL params:", initialPkNamespace, initialPk);
            // Set a placeholder tag; the details useEffect will fetch the actual data
            setSelectedTags([{
                pk_namespace: initialPkNamespace,
                pk: initialPk,
                name: 'Loading from URL...', // Placeholder name
                type: 'unknown', // Placeholder type
                imageUrl: null
            }]);
        }
        // This effect should only run once on mount, or if searchParams change externally
        // We don't include selectedTags here to avoid loops on initial load.
    }, [searchParams]); // Depend on searchParams

    // --- Updated useEffect to Ensure Entity then Fetch Details AND Update URL ---
    useEffect(() => {
        const processSingleTag = async () => {
            if (selectedTags.length !== 1) {
                setEntityDetails(null); // Clear details if not exactly one tag
                // Clear query params if no single tag is selected
                if (searchParams.has('pk_namespace') || searchParams.has('pk')) {
                    console.log("Clearing URL params");
                    setSearchParams({});
                }
                return;
            }

            const singleTag = selectedTags[0];
            const { pk_namespace, pk, name, type, imageUrl, artists, albumName } = singleTag;
            const isSpotifyEntity = pk_namespace.startsWith('spotify.');

            // Update URL params when a single tag is selected
            // Check if params are already correct to prevent unnecessary updates/re-renders
            if (searchParams.get('pk_namespace') !== pk_namespace || searchParams.get('pk') !== pk) {
                 console.log("Setting URL params:", pk_namespace, pk);
                 setSearchParams({ pk_namespace, pk });
            }

            // Skip fetching if name isn't the placeholder (means details might already be loading or loaded)
             if (name === 'Loading from URL...') {
                 console.log("Placeholder detected, proceeding to fetch...");
             } else if (entityDetails && entityDetails.entity?.pk === pk && entityDetails.entity?.pk_namespace === pk_namespace) {
                 console.log("Details seem to be already loaded or loading for this tag, skipping fetch.");
                 // If details are already loaded for the *exact* same entity, we might skip fetching.
                 // However, the ensure step might still be relevant depending on logic.
                 // For simplicity now, we might still proceed, or add more robust checks.
                 // Let's proceed for now to ensure consistency.
             }

            setIsLoading(true); // Start loading indicator
            setEntityDetails(null); // Clear previous details

            try {
                // Step 1: Ensure the entity exists in our DB if it's from Spotify
                if (isSpotifyEntity) {
                    console.log(`Ensuring Spotify entity: ${pk_namespace}/${pk}`);
                    // Prepare metadata for the ensure payload
                    const ensureMetadata = {
                        // Use fetched/available data if possible, fallback to placeholders
                        imageUrl: imageUrl,
                        source: 'frontend_selection',
                        ...(artists && { artists: formatArtists(artists) }),
                        ...(albumName && { albumName: albumName }),
                         // Include type if available and known
                         ...(type !== 'unknown' && { type: type }),
                    };

                    const ensureResponse = await fetch(`/spotify/ensure`, { // Assuming mounted route from spotify.rs
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            pk_namespace: pk_namespace,
                            pk: pk,
                            title: name === 'Loading from URL...' ? pk : name, // Use pk if name is placeholder
                            metadata: ensureMetadata,
                        }),
                    });

                    if (!ensureResponse.ok) {
                        const errorText = await ensureResponse.text();
                        console.error(`Failed to ensure entity ${pk_namespace}/${pk}: ${ensureResponse.status} ${errorText}`);
                        // Decide how to handle ensure failure - maybe show error and stop?
                         // throw new Error(`Ensure failed: ${ensureResponse.status}`);
                         // For now, log and continue to fetch details
                    } else {
                         console.log(`Ensure successful or entity already existed for: ${pk_namespace}/${pk}`);
                         // If ensure returns the confirmed entity, we could potentially use it
                         // const ensuredEntity = await ensureResponse.json();
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
                 // Update the selectedTag state with the fetched name/type/image if it was a placeholder
                 if (selectedTags.length === 1 && selectedTags[0].name === 'Loading from URL...') {
                     const fetchedEntity = data.entity;
                     const fetchedMetadata = fetchedEntity.metadata;
                     const fetchedImageUrl = fetchedMetadata?.images ? getSmallestImageUrl(fetchedMetadata.images) : null;
                     // Use a function update to prevent race conditions if possible
                     setSelectedTags(prev => {
                         if (prev.length === 1 && prev[0].pk === pk && prev[0].pk_namespace === pk_namespace) {
                             return [{
                                 ...prev[0], // Keep pk/pk_namespace
                                 name: fetchedEntity.title || 'Unknown Title',
                                 type: pk_namespace.split('.')[1] || 'unknown', // Extract type
                                 imageUrl: fetchedImageUrl,
                                 // Potentially update artists/albumName if needed from fetched data
                             }];
                         }
                         return prev; // No change if tag changed meanwhile
                     });
                 }

                setEntityDetails(data);

            } catch (error) {
                console.error("Failed processing single tag:", error);
                setEntityDetails({ error: `Failed to load details: ${error.message}` }); // Store error state
            } finally {
                setIsLoading(false); // Stop loading indicator
            }
        };

        processSingleTag();
    // Depend on selectedTags and setSearchParams. Add searchParams too in case external navigation changes it.
    }, [selectedTags, setSearchParams, searchParams]);

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
        <div className="app-container flex flex-col items-center justify-start min-h-screen bg-gray-100 p-4 pt-10"> {/* Added pt-10 */}
            <div className="w-full max-w-lg relative mb-4"> {/* Added mb-4 */}
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
            <div className="mt-4 w-full max-w-2xl"> {/* Increased max-width */}
                {isLoading && selectedTags.length === 1 && (
                    <div className="p-4 border border-gray-300 rounded-md bg-white shadow-sm text-gray-500 text-center">
                        Loading details...
                    </div>
                )}
                {/* Use the new component */}
                {!isLoading && entityDetails && !entityDetails.error && selectedTags.length === 1 && (
                    <EntityDetailsDisplay entityDetails={entityDetails} />
                )}
                {/* Error display */}
                {!isLoading && entityDetails?.error && (
                     <div className="p-4 border border-red-300 rounded-md bg-red-50 shadow-sm text-red-700">
                        Error: {entityDetails.error}
                     </div>
                 )}
                {/* Placeholder when nothing is selected or multiple are selected */}
                {!isLoading && selectedTags.length !== 1 && (
                    <div className="p-4 border border-dashed border-gray-300 rounded-md bg-white/50 shadow-sm text-gray-500 text-center">
                        Select a single item to view details.
                    </div>
                )}
            </div>
        </div>
    );
}

export default App
