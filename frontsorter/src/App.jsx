import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
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
        throw new Error(`Ensure failed for ${pk_namespace}/${pk}: ${response.status} ${errorText}`);
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
        throw new Error(`HTTP error! status: ${response.status} for ${detailsApiUrl}. ${errorText}`);
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
    const [searchParams, setSearchParams] = useSearchParams();
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

    const selectedEntity = selectedTags.length === 1 ? selectedTags[0] : null;

    const ensureMutation = useMutation({
        mutationFn: ensureEntityFn,
        onSuccess: (data, variables) => {
            console.log("Ensure mutation successful:", data);
            // FIX: Use object syntax for invalidateQueries
            queryClient.invalidateQueries({ queryKey: ['entityDetails', variables.pk_namespace, variables.pk] });

             if (!data?.skipped && data?.entity?.title && selectedEntity?.name === 'Loading from URL...') {
                 setSelectedTags(prev => {
                     if (prev.length === 1 && prev[0].pk === variables.pk && prev[0].pk_namespace === variables.pk_namespace) {
                         console.log("Updating tag name from ensure response");
                         const ensuredEntity = data.entity;
                         const fetchedMetadata = ensuredEntity.metadata;
                         const fetchedImageUrl = fetchedMetadata?.images ? getSmallestImageUrl(fetchedMetadata.images) : null;
                         return [{
                             ...prev[0],
                             name: ensuredEntity.title,
                             type: variables.pk_namespace.split('.')[1] || 'unknown',
                             imageUrl: fetchedImageUrl ?? prev[0].imageUrl,
                         }];
                     }
                     return prev;
                 });
             }
        },
        onError: (error, variables) => {
            console.error("Ensure mutation failed:", error);
        },
    });

    const detailsQuery = useQuery({
        queryKey: ['entityDetails', selectedEntity?.pk_namespace, selectedEntity?.pk],
        queryFn: () => fetchEntityDetailsFn(selectedEntity.pk_namespace, selectedEntity.pk),
        enabled: !!selectedEntity,
        staleTime: 10 * 60 * 1000,
         onSuccess: (data) => {
             if (selectedEntity?.name === 'Loading from URL...') {
                  setSelectedTags(prev => {
                     if (prev.length === 1 && prev[0].pk === selectedEntity.pk && prev[0].pk_namespace === selectedEntity.pk_namespace) {
                         console.log("Updating tag name from details response");
                         const fetchedEntity = data.entity;
                         const fetchedMetadata = fetchedEntity.metadata;
                         const fetchedImageUrl = fetchedMetadata?.images ? getSmallestImageUrl(fetchedMetadata.images) : null;
                         return [{
                             ...prev[0],
                             name: fetchedEntity.title || 'Unknown Title',
                             type: selectedEntity.pk_namespace.split('.')[1] || 'unknown',
                             imageUrl: fetchedImageUrl,
                         }];
                     }
                     return prev;
                 });
             }
         },
        onError: (error) => {
             console.error("Failed to fetch entity details:", error);
        }
    });

    // --- Event Handlers and Effects (Mostly Unchanged) ---

    const debouncedSetQuery = useCallback(debounce(setDebouncedInputValue, 300), []);

    const handleInputChange = (event) => {
        const value = event.target.value;
        setInputValue(value);
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
            setSelectedTags([newTag]);
            // Trigger mutation using v5 syntax (already correct, but showing consistency)
            ensureMutation.mutate({
                 pk_namespace: newTag.pk_namespace,
                 pk: newTag.pk,
                 title: newTag.name,
                 metadata: {
                     imageUrl: newTag.imageUrl,
                     source: 'frontend_selection',
                     ...(newTag.artists && { artists: formatArtists(newTag.artists) }),
                     ...(newTag.albumName && { albumName: newTag.albumName }),
                     ...(newTag.type !== 'unknown' && { type: newTag.type }),
                 },
            });
        }
        setInputValue('');
        setDebouncedInputValue('');
        setHighlightedIndex(-1);
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
            setInputValue('');
            setDebouncedInputValue('');
            setHighlightedIndex(-1);
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

    useEffect(() => {
        const initialPkNamespace = searchParams.get('pk_namespace');
        const initialPk = searchParams.get('pk');
        if (initialPkNamespace && initialPk && selectedTags.length === 0 && !detailsQuery.isLoading && !ensureMutation.isLoading) {
            console.log("Setting initial tag from URL params:", initialPkNamespace, initialPk);
            const initialTag = {
                pk_namespace: initialPkNamespace,
                pk: initialPk,
                name: 'Loading from URL...',
                type: initialPkNamespace.split('.')[1] || 'unknown',
                imageUrl: null,
            };
            setSelectedTags([initialTag]);
            // Trigger mutation using v5 syntax
            ensureMutation.mutate({
                pk_namespace: initialTag.pk_namespace,
                pk: initialTag.pk,
                title: initialTag.pk,
                metadata: { source: 'url_load' },
            });
        }
    }, [searchParams, ensureMutation, detailsQuery.isLoading, selectedTags.length]); // Adjusted dependencies slightly


    useEffect(() => {
        const currentPkNamespace = searchParams.get('pk_namespace');
        const currentPk = searchParams.get('pk');
        if (selectedEntity) {
            if (currentPkNamespace !== selectedEntity.pk_namespace || currentPk !== selectedEntity.pk) {
                console.log("Setting URL params from selected tag:", selectedEntity.pk_namespace, selectedEntity.pk);
                setSearchParams({ pk_namespace: selectedEntity.pk_namespace, pk: selectedEntity.pk });
            }
        } else {
            if (currentPkNamespace || currentPk) {
                console.log("Clearing URL params as no tag is selected");
                setSearchParams({});
            }
        }
    }, [selectedEntity, setSearchParams, searchParams]);

    // --- Rendering Logic (Unchanged) ---
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


    return (
        <div className="app-container flex flex-col items-center justify-start min-h-screen bg-gray-100 p-4 pt-10">
            {/* Input and Tag Display Area */}
            <div className="w-full max-w-lg relative mb-4">
                <div className="flex flex-wrap items-center border border-gray-300 rounded-md p-2 bg-white shadow-sm focus-within:ring-1 focus-within:ring-blue-500 focus-within:border-blue-500">
                  {selectedTags.map((tag) => (
                    // Key uses pk_namespace and pk
                    <span key={`${tag.pk_namespace}-${tag.pk}`} className="flex items-center bg-blue-500 text-white text-sm font-medium mr-2 mb-1 px-2.5 py-0.5 rounded-full">
                      {tag.imageUrl && (
                          <img src={tag.imageUrl} alt="" className="tag-preview-image w-4 h-4 mr-1.5 rounded-sm object-cover"/>
                      )}
                      {/* Display name, potentially 'Loading...' */}
                      {tag.name} <span className='text-xs opacity-80 ml-1'>[{tag.type}]</span>
                      <button
                        type="button"
                        className="ml-1.5 flex-shrink-0 text-blue-100 hover:text-white focus:outline-none"
                        onClick={removeTag} // Use updated removeTag
                        aria-label={`Remove ${tag.name} (${tag.type})`}
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                  <input
                    id="tag-input" type="text" value={inputValue}
                    onChange={handleInputChange} onKeyDown={handleKeyDown}
                    placeholder={selectedTags.length === 0 ? "Search Spotify, #tags..." : ""}
                    className="flex-grow p-1 outline-none text-sm min-w-[100px]"
                    autoComplete="off"
                    disabled={selectedTags.length > 0} // Disable input when a tag is selected
                  />
                </div>

                {/* Suggestions dropdown - Driven by suggestionsQuery */}
                { (inputValue.length > 0 || suggestionsQuery.isFetching) && suggestionsQuery.fetchStatus !== 'idle' && ( // Show when input has value or query is fetching
                    <div ref={suggestionBoxRef} className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                       {suggestionsQuery.isLoading && !suggestionsQuery.data?.length ? ( // Loading state
                           <div className="p-2 text-gray-500">Loading...</div>
                       ) : suggestionsQuery.isError ? ( // Error state
                           <div className="p-2 text-red-500">Error: {suggestionsQuery.error.message}</div>
                        ) : suggestionsQuery.data && suggestionsQuery.data.length > 0 ? ( // Success state
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
                        ) : !suggestionsQuery.isFetching && debouncedInputValue.length >= 2 ? ( // No results found state
                           <div className="p-2 text-gray-500">No results found.</div>
                        ) : null /* Or a placeholder/prompt to type more */}
                    </div>
                )}
            </div>

            {/* Display Area for Entity Details - Driven by detailsQuery and ensureMutation */}
            <div className="mt-4 w-full max-w-2xl">
                {/* Loading: Either ensure is running OR details are fetching */}
                {(ensureMutation.isLoading || (selectedEntity && detailsQuery.isFetching)) && (
                    <div className="p-4 border border-gray-300 rounded-md bg-white shadow-sm text-gray-500 text-center">
                        Loading details...
                    </div>
                )}

                {/* Display Ensure Error */}
                 {ensureMutation.isError && !detailsQuery.isFetching && (
                     <div className="p-4 border border-red-300 rounded-md bg-red-50 shadow-sm text-red-700">
                        Error ensuring entity: {ensureMutation.error.message}
                     </div>
                 )}

                {/* Display Details Error (only if ensure didn't fail or isn't running) */}
                 {!ensureMutation.isLoading && !ensureMutation.isError && detailsQuery.isError && (
                     <div className="p-4 border border-red-300 rounded-md bg-red-50 shadow-sm text-red-700">
                         Error loading details: {detailsQuery.error.message}
                     </div>
                 )}

                 {/* Display Details Success */}
                 {!ensureMutation.isLoading && !detailsQuery.isFetching && detailsQuery.isSuccess && selectedEntity && (
                    <EntityDetailsDisplay entityDetails={detailsQuery.data} />
                 )}

                 {/* Placeholder when nothing is selected and not loading */}
                {!selectedEntity && !ensureMutation.isLoading && !detailsQuery.isFetching && (
                    <div className="p-4 border border-dashed border-gray-300 rounded-md bg-white/50 shadow-sm text-gray-500 text-center">
                        Select an item to view details.
                    </div>
                )}
            </div>
        </div>
    );
}

export default App
