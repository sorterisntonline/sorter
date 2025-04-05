import { useState, useEffect, useCallback, useRef } from 'react';
// Import react-query hooks
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
// Consider using a dedicated debounce hook library like 'use-debounce' for cleaner implementation
// import { useDebounce } from 'use-debounce';
import './App.css'

// Debounce function (simple implementation) - Keep for input debounce
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

// --- API Fetching Functions ---

// Function to fetch search suggestions
const fetchSuggestionsFn = async (query) => {
    if (!query || query.length < 2) {
        return []; // Return empty array if query is too short
    }
    // console.log("Fetching suggestions for:", query);
    const response = await fetch(`/spotify/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    // Process and combine suggestions (same logic as before)
    const combinedSuggestions = [];
     if (data.albums) {
        combinedSuggestions.push(...data.albums.map(item => ({
            ...item, type: 'album', pk_namespace: item.pk_namespace || 'spotify.album', pk: item.id, images: item.images || []
        })));
    }
    if (data.artists) {
         combinedSuggestions.push(...data.artists.map(item => ({
            ...item, type: 'artist', pk_namespace: item.pk_namespace || 'spotify.artist', pk: item.id, images: item.images || []
        })));
    }
     if (data.tracks) {
        combinedSuggestions.push(...data.tracks.map(item => ({
            ...item, type: 'track', pk_namespace: item.pk_namespace || 'spotify.track', pk: item.id, images: item.album?.images || []
        })));
    }
     if (data.sorter_tags) {
        combinedSuggestions.push(...data.sorter_tags.map(item => ({
            ...item, name: item.title || item.pk, type: 'tag', pk_namespace: item.pk_namespace, pk: item.pk, images: []
        })));
     }
    return combinedSuggestions;
};

// Function to ensure an entity exists in the backend
const ensureEntityFn = async ({ pk_namespace, pk, title, metadata }) => {
    const isSpotifyEntity = pk_namespace.startsWith('spotify.');
    if (!isSpotifyEntity) {
        console.log(`Skipping ensure for non-Spotify entity: ${pk_namespace}/${pk}`);
        return { skipped: true }; // Indicate skipped
    }

    console.log(`Ensuring Spotify entity: ${pk_namespace}/${pk}`);
    const response = await fetch(`/spotify/ensure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pk_namespace, pk, title, metadata }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to ensure entity ${pk_namespace}/${pk}: ${response.status} ${errorText}`);
        // Throw an error that useMutation can catch
        throw new Error(`Ensure failed for ${pk_namespace}/${pk}: ${response.status} ${errorText}`, { cause: { status: response.status } });
    }

    console.log(`Ensure successful or entity already existed for: ${pk_namespace}/${pk}`);
    // Optionally return data from ensure if backend provides it
    try {
        return await response.json(); // Return potential entity data from ensure
    } catch (e) {
        return { success: true }; // Return simple success if no JSON body
    }
};

// Function to fetch entity details
const fetchEntityDetailsFn = async (pk_namespace, pk) => {
    if (!pk_namespace || !pk) {
        // This case should ideally be prevented by the `enabled` option of useQuery
        throw new Error("pk_namespace and pk are required to fetch details.");
    }
    const detailsApiUrl = `/api/entity/${encodeURIComponent(pk_namespace)}/${encodeURIComponent(pk)}/details`;
    console.log("Fetching details from:", detailsApiUrl);
    const response = await fetch(detailsApiUrl);

    if (!response.ok) {
        const errorText = await response.text();
         // Throw a custom error object including the status code
         const error = new Error(`HTTP error! status: ${response.status} for ${detailsApiUrl}. ${errorText}`);
         error.status = response.status; // Attach status code
         throw error;
    }
    const data = await response.json();

    // Return the detailed data including entity, parents, children
    return data;
};


// --- EntityDetailsDisplay Component (Unchanged) ---
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
        <div className="flex flex-col gap-4">
            {/* Render Parents */}
            {parents && parents.length > 0 && (
                <div className="mt-4 pt-2 border-t border-gray-200">
                    <h4 className="text-sm font-semibold mb-1 text-gray-700">Parents:</h4>
                    <ul className="text-xs text-gray-600 list-disc list-inside space-y-1">
                        {parents.map((parent) => {
                            const parentType = parent.pk_namespace.split('.')[1];
                            // Basic clickable link (won't navigate yet, but sets stage)
                            return (
                                <li key={`${parent.pk_namespace}-${parent.pk}`}>
                                    <a href={`/?pk_namespace=${parent.pk_namespace}&pk=${parent.pk}`}
                                        className="text-blue-600 hover:underline">
                                            {parent.title} <span className="text-gray-500 capitalize">[{parentType}]</span>
                                    </a>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
            <div className="p-4 border border-gray-300 rounded-md bg-white shadow-sm clear-both"> {/* clear-both needed if image floats */}
                {imageElement}
                {basicInfo}
                {detailsList.length > 0 && (
                     <ul className="text-sm space-y-1 mb-2 list-none"> {/* Use list-none if using custom labels like <strong> */}
                         {detailsList}
                     </ul>
                )}
            </div>
            {/* Render Children */}
            {children && children.length > 0 && (
                <div className="mt-3 pt-2 border-t border-gray-200"> {/* Adjusted margin/padding */}
                    <h4 className="text-sm font-semibold mb-1 text-gray-700">Children:</h4>
                    <ul className="text-xs text-gray-600 list-disc list-inside space-y-1">
                        {children.map((child) => {
                             const childType = child.pk_namespace.split('.')[1];
                             return (
                                 <li key={`${child.pk_namespace}-${child.pk}`}>
                                    <a href={`/?pk_namespace=${child.pk_namespace}&pk=${child.pk}`}
                                       className="text-blue-600 hover:underline">
                                         {child.title} <span className="text-gray-500 capitalize">[{childType}]</span>
                                    </a>
                                </li>
                             );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}
// --- END EntityDetailsDisplay ---


// --- App Component ---
function App() {
    const [inputValue, setInputValue] = useState('');
    const [debouncedInputValue, setDebouncedInputValue] = useState('');
    const [selectedTags, setSelectedTags] = useState([]);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const suggestionBoxRef = useRef(null);
    const queryClient = useQueryClient();

    // --- React Query Hooks (Using v5 Object Syntax) ---

    const suggestionsQuery = useQuery({
        queryKey: ['suggestions', debouncedInputValue],
        queryFn: () => fetchSuggestionsFn(debouncedInputValue),
        enabled: debouncedInputValue.length >= 2,
        staleTime: 5 * 60 * 1000,
        keepPreviousData: true,
    });

    // --- Selected Entity Logic ---
    // Derive the *intended* selected entity based ONLY on user selection
    const intendedEntity = selectedTags.length === 1
        ? selectedTags[0]
        : null;

    // --- Ensure Mutation (No change needed here, but simplify onSuccess logic) ---
    const ensureMutation = useMutation({
        mutationFn: ensureEntityFn,
        onSuccess: (data, variables) => {
            console.log("Ensure mutation successful:", data);
            queryClient.invalidateQueries({ queryKey: ['entityDetails', variables.pk_namespace, variables.pk] });
        },
        onError: (error, variables) => {
            console.error(`Ensure mutation failed for ${variables.pk_namespace}/${variables.pk}:`, error);
        },
    });

    // --- Details Query (Modified onError) ---
    const detailsQuery = useQuery({
        queryKey: ['entityDetails', intendedEntity?.pk_namespace, intendedEntity?.pk],
        queryFn: () => fetchEntityDetailsFn(intendedEntity.pk_namespace, intendedEntity.pk),
        enabled: !!intendedEntity, // Enable if we have an intended entity (from URL or selection)
        staleTime: 10 * 60 * 1000,
        retry: (failureCount, error) => {
            // Don't retry automatically if it's a 404 we might handle with ensure
            if (error.status === 404 && intendedEntity?.pk_namespace?.startsWith('spotify.')) {
                return false;
            }
            // Default retry behavior otherwise (usually 3 times)
            return failureCount < 3;
        },
        onError: (error) => {
             console.error("Failed to fetch entity details:", error.message);
             // Check if it's a potentially "ensurable" error (e.g., 404 for a Spotify item)
             if (error.status === 404 && intendedEntity?.pk_namespace?.startsWith('spotify.') && !ensureMutation.isLoading) {
                 console.log(`Details fetch failed with 404 for ${intendedEntity.pk_namespace}/${intendedEntity.pk}. Triggering ensure.`);
                 // Trigger ensure mutation
                 ensureMutation.mutate({
                     pk_namespace: intendedEntity.pk_namespace,
                     pk: intendedEntity.pk,
                     title: intendedEntity.name,
                     metadata: {
                         source: 'frontend_selection_retry',
                         imageUrl: intendedEntity.imageUrl,
                         ...(intendedEntity.artists && { artists: formatArtists(intendedEntity.artists) }),
                         ...(intendedEntity.albumName && { albumName: intendedEntity.albumName }),
                     },
                 });
             }
             // If onError is triggered, the query is in an error state, handled in rendering logic
        },
         onSuccess: (data) => {
             console.log("Details query succeeded for selected item:", data.entity.title);
         },
    });

    // --- Event Handlers and Effects (Mostly Unchanged) ---

    const debouncedSetQuery = useCallback(debounce(setDebouncedInputValue, 300), []);

    const handleInputChange = (event) => {
        const value = event.target.value;
        setInputValue(value);
        // If user starts typing, clear any existing selection to allow new search
        if (selectedTags.length > 0) {
            setSelectedTags([]);
        }
        debouncedSetQuery(value);
        setHighlightedIndex(-1);
    };

    const addTag = (suggestion) => {
        if (suggestion) {
            const imageUrl = getSmallestImageUrl(suggestion.images);
            const newTag = {
                pk_namespace: suggestion.pk_namespace,
                pk: suggestion.pk,
                name: suggestion.name,
                type: suggestion.type,
                imageUrl: imageUrl,
                artists: suggestion.artists,
                albumName: suggestion.album?.name,
            };
            // Clear input/suggestions first
            setInputValue('');
            setDebouncedInputValue('');
            setHighlightedIndex(-1);
            // Set the selected tag - this will trigger detailsQuery enable/disable
            setSelectedTags([newTag]);

            // Check if details are already cached and fresh for this item
            const existingData = queryClient.getQueryData(['entityDetails', newTag.pk_namespace, newTag.pk]);
            if (!existingData || queryClient.isQueryStale(['entityDetails', newTag.pk_namespace, newTag.pk])) {
                 // If no fresh data exists, proactively trigger ensure.
                 // The detailsQuery will still run due to selectedTags change.
                 // Ensure might run concurrently or slightly before details.
                 console.log("Proactively ensuring selected tag:", newTag.pk_namespace, newTag.pk);
                 ensureMutation.mutate({
                     pk_namespace: newTag.pk_namespace, pk: newTag.pk, title: newTag.name,
                     metadata: {
                         imageUrl: newTag.imageUrl, source: 'frontend_selection',
                         ...(newTag.artists && { artists: formatArtists(newTag.artists) }),
                         ...(newTag.albumName && { albumName: newTag.albumName }),
                         ...(newTag.type !== 'unknown' && { type: newTag.type }),
                     },
                 });
            } else {
                 console.log("Details already cached for selected tag, skipping proactive ensure.");
            }
        }
    };

    const removeTag = () => {
        setSelectedTags([]);
    };

    const handleKeyDown = (event) => {
        const currentSuggestions = suggestionsQuery.data || [];
        if (currentSuggestions.length > 0) {
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                setHighlightedIndex(prevIndex => (prevIndex + 1) % currentSuggestions.length);
                return;
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                 setHighlightedIndex(prevIndex => (prevIndex - 1 + currentSuggestions.length) % currentSuggestions.length);
                return;
            }
        }
        if (event.key === 'Enter') {
            event.preventDefault();
            if (highlightedIndex >= 0 && currentSuggestions[highlightedIndex]) {
                addTag(currentSuggestions[highlightedIndex]);
            }
            // Values cleared inside addTag now
        }
        if (event.key === 'Backspace' && inputValue === '' && selectedTags.length > 0) {
           removeTag();
        }
    };

    useEffect(() => {
        function handleClickOutside(event) {
            if (suggestionBoxRef.current && !suggestionBoxRef.current.contains(event.target)) {
                 const inputElement = document.getElementById('tag-input');
                 if (!inputElement || !inputElement.contains(event.target)) {
                   setInputValue('');
                   setDebouncedInputValue('');
                   setHighlightedIndex(-1);
                }
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [suggestionBoxRef]);

    // --- Rendering Logic (Adjusted) ---
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

        // Fix: Wrap case contents in {} for lexical declarations
        switch(suggestion.type) {
            case 'album': {
                const albumArtists = suggestion.artists && Array.isArray(suggestion.artists) ? formatArtists(suggestion.artists) : 'Unknown Artist';
                return (
                    <>
                        {imageElement}
                        <span className="align-middle">{suggestion.name}</span>
                        <span className="text-xs text-gray-500 ml-2 align-middle">({albumArtists}) [Album]</span>
                    </>
                );
            }
            case 'artist': {
                return (
                     <>
                        {imageElement}
                        <span className="align-middle">{suggestion.name}</span>
                        <span className="text-xs text-gray-500 ml-2 align-middle">[Artist]</span>
                     </>
                );
            }
            case 'track': {
                const trackArtists = suggestion.artists && Array.isArray(suggestion.artists) ? formatArtists(suggestion.artists) : 'Unknown Artist';
                 return (
                     <>
                        {imageElement}
                        <span className="align-middle">{suggestion.name}</span>
                        <span className="text-xs text-gray-500 ml-2 align-middle">({trackArtists}) [Track]</span>
                     </>
                 );
            }
             case 'tag': { // Handle sorter tags
                 return (
                     <>
                        {imageElement}
                        <span className="align-middle">{suggestion.name}</span>
                        <span className="text-xs text-gray-500 ml-2 align-middle">[Sorter Tag]</span>
                     </>
                 );
             }
            default: {
                 return (
                     <>
                        {imageElement}
                        <span className="align-middle">{suggestion.name}</span>
                     </>
                 );
            }
        }
    };

    // Determine current display state based on queries/mutations
     const displayState = (() => {
         if (!intendedEntity) return 'placeholder'; // Nothing selected or loaded from URL
         if (ensureMutation.isLoading) return 'loading'; // Ensure is actively running
         // Details are loading *unless* ensure just failed
         if (detailsQuery.isLoading && ensureMutation.status !== 'error') return 'loading';
         if (ensureMutation.isError) return 'error_ensure'; // Ensure failed
         if (detailsQuery.isError) return 'error_details'; // Details failed (and ensure didn't)
         if (detailsQuery.isSuccess) return 'success'; // Details loaded successfully
         return 'loading'; // Default/intermediate state
     })();

    // Get the tag to display (might be placeholder from URL or actual from state)
    const displayTag = selectedTags.length === 1 ? selectedTags[0] : null;

    return (
        <div className="app-container flex flex-col items-center justify-start min-h-screen bg-gray-100 p-4 pt-10">
            {/* Input and Tag Display Area */}
            <div className="w-full max-w-lg relative mb-4">
                <div className="flex flex-wrap items-center border border-gray-300 rounded-md p-2 bg-white shadow-sm focus-within:ring-1 focus-within:ring-blue-500 focus-within:border-blue-500">
                  {/* Only show tag if one is selected/intended */}
                  {displayTag && (
                    <span key={`${displayTag.pk_namespace}-${displayTag.pk}`} className="flex items-center bg-blue-500 text-white text-sm font-medium mr-2 mb-1 px-2.5 py-0.5 rounded-full">
                      {displayTag.imageUrl && (
                          <img src={displayTag.imageUrl} alt="" className="tag-preview-image w-4 h-4 mr-1.5 rounded-sm object-cover"/>
                      )}
                      {displayTag.name} <span className='text-xs opacity-80 ml-1'>[{displayTag.type}]</span>
                      <button
                        type="button"
                        className="ml-1.5 flex-shrink-0 text-blue-100 hover:text-white focus:outline-none"
                        onClick={removeTag}
                        aria-label={`Remove ${displayTag.name} (${displayTag.type})`}
                      >
                        &times;
                      </button>
                    </span>
                  )}
                  <input
                    id="tag-input" type="text" value={inputValue}
                    onChange={handleInputChange} onKeyDown={handleKeyDown}
                    // Disable input only if a tag is successfully loaded/selected (not just intended from URL)
                    placeholder={!displayTag ? "Search Spotify, #tags..." : ""}
                    className="flex-grow p-1 outline-none text-sm min-w-[100px]"
                    autoComplete="off"
                    disabled={!!displayTag}
                  />
                </div>

                {/* Suggestions dropdown */}
                 {(() => {
                    const shouldRenderDropdown = (inputValue.length > 0 || suggestionsQuery.isFetching) && !displayTag;
                    console.log("Should render dropdown:", shouldRenderDropdown, { inputValueLength: inputValue.length, isFetching: suggestionsQuery.isFetching, fetchStatus: suggestionsQuery.fetchStatus, displayTag: !!displayTag });
                    if (!shouldRenderDropdown) return null;

                    return (
                      <div ref={suggestionBoxRef} className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                          {(() => {
                            console.log("Dropdown content check:", { isLoading: suggestionsQuery.isLoading, isError: suggestionsQuery.isError, data: suggestionsQuery.data, isFetching: suggestionsQuery.isFetching, debouncedInputValueLength: debouncedInputValue.length });
                            if (suggestionsQuery.isLoading && !suggestionsQuery.data?.length) { // Loading state
                              console.log("Rendering: Loading...");
                              return <div className="p-2 text-gray-500">Loading...</div>;
                            } else if (suggestionsQuery.isError) { // Error state
                              console.log("Rendering: Error", suggestionsQuery.error.message);
                              return <div className="p-2 text-red-500">Error: {suggestionsQuery.error.message}</div>;
                            } else if (suggestionsQuery.data && suggestionsQuery.data.length > 0) { // Success state
                              console.log("Rendering: Success -", suggestionsQuery.data.length, "items");
                              return (
                                  <ul>
                                      {suggestionsQuery.data.map((suggestion, index) => (
                                          <li
                                              key={`${suggestion.pk_namespace}-${suggestion.pk}`}
                                              className={`p-2 cursor-pointer hover:bg-blue-100 ${index === highlightedIndex ? 'bg-blue-100' : ''}`}
                                              onMouseDown={(e) => { e.preventDefault(); addTag(suggestion); }}
                                          >
                                             {renderSuggestionDetails(suggestion)}
                                          </li>
                                      ))}
                                  </ul>
                              );
                            } else if (!suggestionsQuery.isFetching && debouncedInputValue.length >= 2) {
                               console.log("Rendering: No results found");
                               return <div className="p-2 text-gray-500">No results found.</div>;
                            } else {
                               console.log("Rendering: Nothing (intermediate state?)");
                               return null;
                            }
                          })()}
                      </div>
                    );
                 })()}
            </div>

            {/* Display Area for Entity Details */}
            <div className="mt-4 w-full max-w-2xl">
                {displayState === 'loading' && (
                    <div className="p-4 border border-gray-300 rounded-md bg-white shadow-sm text-gray-500 text-center">
                        Loading details...
                    </div>
                )}
                {displayState === 'error_ensure' && (
                     <div className="p-4 border border-red-300 rounded-md bg-red-50 shadow-sm text-red-700">
                        Error ensuring entity: {ensureMutation.error.message}
                     </div>
                 )}
                {displayState === 'error_details' && (
                     <div className="p-4 border border-red-300 rounded-md bg-red-50 shadow-sm text-red-700">
                         Error loading details: {detailsQuery.error.message}
                     </div>
                 )}
                 {displayState === 'success' && detailsQuery.data && (
                    <EntityDetailsDisplay entityDetails={detailsQuery.data} />
                 )}
                 {/* Adjust placeholder condition - show if no tag is selected */}
                 {!displayTag && displayState !== 'loading' && displayState !== 'error_ensure' && displayState !== 'error_details' && (
                    <div className="p-4 border border-dashed border-gray-300 rounded-md bg-white/50 shadow-sm text-gray-500 text-center">
                        Select an item to view details.
                    </div>
                )}
            </div>
        </div>
    );
}

export default App
