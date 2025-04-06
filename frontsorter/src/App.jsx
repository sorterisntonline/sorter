import { useState, useEffect, useCallback, useRef } from 'react';
// Import react-router-dom hook
import { useSearchParams } from 'react-router-dom';
// Import react-query hooks
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
// Consider using a dedicated debounce hook library like 'use-debounce' for cleaner implementation
// import { useDebounce } from 'use-debounce';
import './App.css'
import SpotifyEmbed from './SpotifyEmbed'; // Import the new component

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
function EntityDetailsDisplay({ entityDetails, onNavigate }) {
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

    // Handler for clicking parent/child links
    const handleLinkClick = (e, pk_ns, pk) => {
        e.preventDefault(); // Prevent full page reload
        onNavigate(pk_ns, pk); // Call the navigation handler passed from App
    };

    // --- Group Children by Type ---
    const groupedChildren = {};
    if (children && children.length > 0) {
        children.forEach(child => {
            const childType = child.pk_namespace.split('.')[1] || 'unknown';
            if (!groupedChildren[childType]) {
                groupedChildren[childType] = [];
            }
            groupedChildren[childType].push(child);
        });
    }
    // Sort types alphabetically for consistent order (optional)
    const sortedChildTypes = Object.keys(groupedChildren).sort();
    // --- End Grouping ---

    return (
        <div className="flex flex-col gap-4">
            {/* Render Parents */}
            {parents && parents.length > 0 && (
                <div className="mt-4 pt-2  border-gray-200">
                    <ul className="text-xs text-gray-600 list-disc list-inside space-y-1">
                        {parents.map((parent) => {
                            const parentType = parent.pk_namespace.split('.')[1];
                            // Use button/anchor styled as link and call handleLinkClick onClick
                            return (
                                <li key={`${parent.pk_namespace}-${parent.pk}`}>
                                    <a href={`/?pk_namespace=${parent.pk_namespace}&pk=${parent.pk}`}
                                        onClick={(e) => handleLinkClick(e, parent.pk_namespace, parent.pk)}
                                        className="text-blue-600 hover:underline cursor-pointer">
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
            {/* Render Children - Grouped by Type */}
            {sortedChildTypes.length > 0 && (
                <div className="mt-3 pt-2  border-gray-200"> {/* Adjusted margin/padding */}
                    {sortedChildTypes.map(childType => (
                        <div key={childType} className="mb-2"> {/* Add margin between type groups */}
                            <h5 className="text-xs font-semibold mt-1 capitalize text-gray-600">[{childType}]</h5>
                            <ul className="text-xs text-gray-600 list-disc list-inside space-y-1 pl-4"> {/* Indent child list */}
                                {groupedChildren[childType].map((child) => (
                                    <li key={`${child.pk_namespace}-${child.pk}`}>
                                        <a href={`/?pk_namespace=${child.pk_namespace}&pk=${child.pk}`}
                                           onClick={(e) => handleLinkClick(e, child.pk_namespace, child.pk)}
                                           className="text-blue-600 hover:underline cursor-pointer">
                                             {child.title} {/* Removed explicit type here as it's under the group heading */}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
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
    // Selected tags now derived primarily from URL/details query result
    const [selectedTags, setSelectedTags] = useState([]);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const suggestionBoxRef = useRef(null);
    const queryClient = useQueryClient();
    // --- Search Params ---
    const [searchParams, setSearchParams] = useSearchParams();
    const urlPkNamespace = searchParams.get('pk_namespace');
    const urlPk = searchParams.get('pk');

    // --- React Query Hooks ---

    // Suggestions query - enable based on input length, not URL state
    const suggestionsQuery = useQuery({
        queryKey: ['suggestions', debouncedInputValue],
        queryFn: () => fetchSuggestionsFn(debouncedInputValue),
        // Enable only based on input length
        enabled: debouncedInputValue.length >= 2,
        staleTime: 5 * 60 * 1000,
        keepPreviousData: true, // Keep showing old suggestions while new ones load
    });

    // --- Ensure Mutation (No change needed here) ---
    const ensureMutation = useMutation({
        mutationFn: ensureEntityFn,
        onSuccess: (data, variables) => {
            console.log("Ensure mutation successful:", data);
            // Invalidate details query based on URL params now
            queryClient.invalidateQueries({ queryKey: ['entityDetails', variables.pk_namespace, variables.pk] });
        },
        onError: (error, variables) => {
            console.error(`Ensure mutation failed for ${variables.pk_namespace}/${variables.pk}:`, error);
            // Maybe clear URL params if ensure fails critically? Or show persistent error.
            // For now, just log.
        },
    });

    // --- Details Query (Uses URL params) ---
    const detailsQuery = useQuery({
        // Use URL params directly in the query key
        queryKey: ['entityDetails', urlPkNamespace, urlPk],
        queryFn: () => fetchEntityDetailsFn(urlPkNamespace, urlPk),
        // Enable only if both params are present in the URL
        enabled: !!urlPkNamespace && !!urlPk,
        staleTime: 10 * 60 * 1000,
        retry: (failureCount, error) => {
            if (error.status === 404 && urlPkNamespace?.startsWith('spotify.')) {
                return false; // Don't retry 404 for Spotify, trigger ensure instead
            }
            return failureCount < 3;
        },
        onError: (error) => {
             console.error(`Failed to fetch entity details for ${urlPkNamespace}/${urlPk}:`, error.message);
             if (error.status === 404 && urlPkNamespace?.startsWith('spotify.') && !ensureMutation.isLoading) {
                 console.log(`Details fetch failed with 404 for ${urlPkNamespace}/${urlPk}. Triggering ensure.`);
                 // We need some basic info to potentially pass to ensure.
                 // Ideally, the suggestion data would be cached or passed, but we don't have it here if loaded via URL.
                 // We might need a fallback or fetch minimal info first.
                 // For now, ensure with minimal data if possible.
                 // This part needs refinement: How do we get 'title'/'metadata' if we only have pk from URL?
                 // Option 1: Ensure API doesn't strictly require them if entity exists.
                 // Option 2: Make a preliminary small fetch.
                 // Option 3: Show an error "Cannot find entity to ensure".
                 // Let's try Option 1 assumption for now.
                 ensureMutation.mutate({
                     pk_namespace: urlPkNamespace,
                     pk: urlPk,
                     title: `Entity ${urlPk}`, // Placeholder title
                     metadata: { source: 'frontend_url_retry' }, // Minimal metadata
                 });
             }
             // Clear selected tags state if details fail to load from URL
             setSelectedTags([]);
        },
         onSuccess: (data) => {
             console.log(`Details query succeeded for URL item: ${urlPkNamespace}/${urlPk}`, data.entity.title);
             // Sync selectedTags state with the data loaded from URL
             if (data?.entity) {
                 const entity = data.entity;
                 const imageUrl = getSmallestImageUrl(entity.metadata?.images);
                 setSelectedTags([{
                     pk_namespace: entity.pk_namespace,
                     pk: entity.pk,
                     name: entity.title,
                     type: entity.pk_namespace.split('.')[1] || 'unknown', // Extract type
                     imageUrl: imageUrl,
                     // We don't have artist/album easily here unless it's in metadata
                     artists: entity.metadata?.artists,
                     albumName: entity.metadata?.album?.name, // Assuming metadata might have album info
                 }]);
             }
         },
    });

     // Effect to clear selectedTags state if URL params are removed
     useEffect(() => {
         if (!urlPkNamespace || !urlPk) {
             // If URL params are cleared, ensure local state reflects this
             if (selectedTags.length > 0) {
                 setSelectedTags([]);
             }
             // Optionally clear input when URL is cleared externally
             // setInputValue('');
             // setDebouncedInputValue('');
         }
     }, [urlPkNamespace, urlPk, selectedTags.length]);


    // --- Event Handlers and Effects ---

    const debouncedSetQuery = useCallback(debounce(setDebouncedInputValue, 300), []);

    const handleInputChange = (event) => {
        const value = event.target.value;
        setInputValue(value);
        // Trigger suggestion fetch based on input
        debouncedSetQuery(value);
        setHighlightedIndex(-1); // Reset highlight on input change
    };

    // Navigate function to update URL params
    const navigateToEntity = (pk_ns, pk) => {
        console.log("Navigating to:", pk_ns, pk);
        setSearchParams({ pk_namespace: pk_ns, pk: pk });
        // Clear input and debounced value *after* setting params
        setInputValue('');
        setDebouncedInputValue(''); // Stop suggestions query
        setHighlightedIndex(-1);
    };


    // addTag now updates URL instead of local state directly
    const addTag = (suggestion) => {
        if (suggestion) {
             // Update URL, which will trigger detailsQuery and onSuccess state update
             navigateToEntity(suggestion.pk_namespace, suggestion.pk);

             // Proactive ensure can still be useful
             const existingData = queryClient.getQueryData(['entityDetails', suggestion.pk_namespace, suggestion.pk]);
             if (!existingData || queryClient.isQueryStale(['entityDetails', suggestion.pk_namespace, suggestion.pk])) {
                 console.log("Proactively ensuring selected tag:", suggestion.pk_namespace, suggestion.pk);
                 ensureMutation.mutate({
                     pk_namespace: suggestion.pk_namespace, pk: suggestion.pk, title: suggestion.name,
                     metadata: {
                         imageUrl: getSmallestImageUrl(suggestion.images),
                         source: 'frontend_selection',
                         ...(suggestion.artists && { artists: formatArtists(suggestion.artists) }),
                         ...(suggestion.album?.name && { albumName: suggestion.album.name }),
                         ...(suggestion.type !== 'unknown' && { type: suggestion.type }),
                     },
                 });
            } else {
                 console.log("Details might be cached for selected tag, skipping proactive ensure check here.");
            }
        }
    };

    // removeTag clears URL params
    const removeTag = () => {
        setSearchParams({}); // Clear pk_namespace and pk from URL
        // Optionally focus the input after removing the tag
        document.getElementById('tag-input')?.focus();
    };

    const handleKeyDown = (event) => {
        const currentSuggestions = suggestionsQuery.data || [];
        // Handle arrows/enter only if suggestions ARE potentially visible
        // (i.e. input has length > 0 or we are fetching)
        const canShowSuggestions = inputValue.length > 0 || suggestionsQuery.isFetching;

        if (canShowSuggestions && currentSuggestions.length > 0) {
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                setHighlightedIndex(prevIndex => (prevIndex + 1) % currentSuggestions.length);
                return;
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                 setHighlightedIndex(prevIndex => (prevIndex - 1 + currentSuggestions.length) % currentSuggestions.length);
                return;
            } else if (event.key === 'Enter') {
                 event.preventDefault();
                 if (highlightedIndex >= 0 && currentSuggestions[highlightedIndex]) {
                    addTag(currentSuggestions[highlightedIndex]);
                    // Values cleared inside addTag/navigateToEntity now
                 }
                return; // Prevent other keydown actions if Enter was handled
            }
        }
        // Allow backspace to remove tag IF the input is empty and a tag IS selected
        if (event.key === 'Backspace' && inputValue === '' && displayTag) {
           removeTag();
        }
    };

    // useEffect for closing suggestion box - click outside should clear input/suggestions state
     useEffect(() => {
         function handleClickOutside(event) {
             const inputElement = document.getElementById('tag-input');
             const suggestionsElement = suggestionBoxRef.current;
             const tagElement = document.querySelector('.selected-tag-display');

             // Check if the click is outside the input, the suggestions box, and the displayed tag
             if (suggestionsElement && !suggestionsElement.contains(event.target) &&
                 (!inputElement || !inputElement.contains(event.target)) &&
                 (!tagElement || !tagElement.contains(event.target)))
             {
                 // Clear the input and hide suggestions
                 setInputValue('');
                 setDebouncedInputValue('');
                 setHighlightedIndex(-1);
             }
         }
         document.addEventListener("mousedown", handleClickOutside);
         return () => {
             document.removeEventListener("mousedown", handleClickOutside);
         };
     }, [suggestionBoxRef]); // Removed urlPkNamespace dependency


    // --- Rendering Logic ---
    // renderSuggestionDetails remains the same
    // ... renderSuggestionDetails function (unchanged) ...
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


    // Determine current display state based on URL and query states
     const displayState = (() => {
         if (!urlPkNamespace || !urlPk) return 'placeholder'; // No entity selected via URL
         // If ensure is running due to a 404 retry, show loading
         if (ensureMutation.isLoading && detailsQuery.status === 'error' && detailsQuery.error?.status === 404) return 'loading';
         if (detailsQuery.isLoading) return 'loading'; // Details are loading
         if (ensureMutation.isError) return 'error_ensure'; // Ensure failed (and wasn't handled gracefully)
         if (detailsQuery.isError) return 'error_details'; // Details failed (and ensure didn't run or failed silently)
         if (detailsQuery.isSuccess) return 'success'; // Details loaded
         return 'loading'; // Default/intermediate state while URL is set but query hasn't started/finished
     })();

    // Get the tag to display (now derived from selectedTags, which is populated by detailsQuery.onSuccess)
    const displayTag = selectedTags.length === 1 ? selectedTags[0] : null;
    // *Corrected*: Show suggestions based on input/fetching state only
    const showSuggestions = (inputValue.length > 0 || suggestionsQuery.isFetching) && debouncedInputValue.length >= 2;
    // A flag to know if *any* entity is supposed to be loaded (even if loading/error)
    const hasActiveEntity = !!urlPkNamespace && !!urlPk;

    // --- Prepare data for rendering ---
    const entityData = displayState === 'success' ? detailsQuery.data : null;
    const isSpotifyEntity = entityData?.entity?.pk_namespace?.startsWith('spotify.');
    const spotifyUri = isSpotifyEntity
        ? `spotify:${entityData.entity.pk_namespace.split('.')[1]}:${entityData.entity.pk}`
        : null;

    return (
        <div className="app-container flex flex-col items-center justify-start min-h-screen bg-gray-100 p-4 pt-10">
            {/* Input and Tag Display Area */}
            <div className="w-full max-w-lg relative mb-4">
                <div className="flex flex-wrap items-center border border-gray-300 rounded-md p-2 bg-white shadow-sm focus-within:ring-1 focus-within:ring-blue-500 focus-within:border-blue-500">
                  {/* Display tag if successfully loaded */}
                  {displayTag && (
                    <span key={`${displayTag.pk_namespace}-${displayTag.pk}`} className="selected-tag-display flex items-center bg-blue-500 text-white text-sm font-medium mr-2 mb-1 px-2.5 py-0.5 rounded-full">
                      {displayTag.imageUrl && (
                          <img src={displayTag.imageUrl} alt="" className="tag-preview-image w-4 h-4 mr-1.5 rounded-sm object-cover"/>
                      )}
                      {displayTag.name} <span className='text-xs opacity-80 ml-1'>[{displayTag.type}]</span>
                      <button
                        type="button"
                        className="ml-1.5 flex-shrink-0 text-blue-100 hover:text-white focus:outline-none"
                        onClick={removeTag} // Use removeTag which clears URL params
                        aria-label={`Remove ${displayTag.name} (${displayTag.type})`}
                      >
                        &times;
                      </button>
                    </span>
                  )}
                  {/* Input field is always rendered */}
                  <input
                    id="tag-input" type="text" value={inputValue}
                    onChange={handleInputChange} onKeyDown={handleKeyDown}
                    // Placeholder logic remains the same
                    placeholder={!hasActiveEntity ? "Search Spotify, #tags..." : "Search another..."}
                    // Input is conceptually always enabled, just looks different maybe
                    className={`flex-grow p-1 outline-none text-sm min-w-[100px] ${hasActiveEntity ? 'pl-1' : ''}`} // Adjust padding if needed when tag is shown
                    autoComplete="off"
                    // No longer disable the input field
                    // disabled={!!displayTag}
                  />
                </div>

                {/* Suggestions dropdown - Render based on the corrected showSuggestions flag */}
                 {showSuggestions && (
                      <div ref={suggestionBoxRef} className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                          {(() => {
                              // Loading state: Show if fetching and no data yet OR if debounced value changed but fetch hasn't started/returned
                              const isLoadingSuggestions = suggestionsQuery.isFetching && !suggestionsQuery.data?.length;
                              // console.log("Dropdown content check:", { isLoading: isLoadingSuggestions, isError: suggestionsQuery.isError, data: suggestionsQuery.data, isFetching: suggestionsQuery.isFetching, debouncedInputValueLength: debouncedInputValue.length });

                              if (isLoadingSuggestions) {
                                  return <div className="p-2 text-gray-500">Loading...</div>;
                              } else if (suggestionsQuery.isError) {
                                  return <div className="p-2 text-red-500">Error: {suggestionsQuery.error.message}</div>;
                              } else if (suggestionsQuery.data && suggestionsQuery.data.length > 0) {
                                  return (
                                      <ul>
                                          {suggestionsQuery.data.map((suggestion, index) => (
                                              <li
                                                  key={`${suggestion.pk_namespace}-${suggestion.pk}`}
                                                  className={`p-2 cursor-pointer hover:bg-blue-100 ${index === highlightedIndex ? 'bg-blue-100' : ''}`}
                                                  onMouseDown={(e) => { e.preventDefault(); addTag(suggestion); }} // Use addTag which updates URL
                                              >
                                                 {renderSuggestionDetails(suggestion)}
                                              </li>
                                          ))}
                                      </ul>
                                  );
                              // Check if not loading/fetching, input is sufficient length, but data is empty
                              } else if (!suggestionsQuery.isFetching && debouncedInputValue.length >= 2 && (!suggestionsQuery.data || suggestionsQuery.data.length === 0)) {
                                 return <div className="p-2 text-gray-500">No results found.</div>;
                              } else {
                                 // Should ideally not be reached if showSuggestions is true and length >= 2, but acts as fallback
                                 return null;
                              }
                          })()}
                      </div>
                 )}
            </div>

            {/* Display Area for Entity Details / Embed */}
            <div className="mt-4 w-full max-w-2xl">
                 {/* Loading state covers initial load from URL and ensure retries */}
                 {displayState === 'loading' && (
                     <div className="p-4 border border-gray-300 rounded-md bg-white shadow-sm text-gray-500 text-center">
                         Loading details... {ensureMutation.isLoading ? '(Ensuring entity...)' : ''}
                     </div>
                 )}
                 {/* Error States */}
                 {displayState === 'error_ensure' && (
                      <div className="p-4 border border-red-300 rounded-md bg-red-50 shadow-sm text-red-700">
                         Error ensuring entity: {ensureMutation.error?.message || 'Unknown error'}
                      </div>
                  )}
                  {/* Show details error only if ensure didn't explicitly fail */}
                 {displayState === 'error_details' && ensureMutation.status !== 'error' && (
                      <div className="p-4 border border-red-300 rounded-md bg-red-50 shadow-sm text-red-700">
                          Error loading details: {detailsQuery.error?.message || 'Unknown error'}
                          {detailsQuery.error?.status === 404 && urlPkNamespace?.startsWith('spotify.') && ' (Could not find or ensure the Spotify entity)'}
                      </div>
                  )}

                 {/* Success state - Render Embed or Details */}
                 {displayState === 'success' && entityData && (
                    <div className="flex flex-col gap-4"> {/* Added wrapper to maintain spacing like EntityDetailsDisplay */}
                         {/* Render Parents (Always render if available) */}
                         {entityData.parents && entityData.parents.length > 0 && (
                             <div className="pt-2 border-gray-200"> {/* Removed mt-4 as parent div has it */}
                                 <ul className="text-xs text-gray-600 list-disc list-inside space-y-1">
                                     {entityData.parents.map((parent) => {
                                         const parentType = parent.pk_namespace.split('.')[1];
                                         return (
                                             <li key={`${parent.pk_namespace}-${parent.pk}`}>
                                                 <a href={`/?pk_namespace=${parent.pk_namespace}&pk=${parent.pk}`}
                                                     onClick={(e) => { e.preventDefault(); navigateToEntity(parent.pk_namespace, parent.pk); }}
                                                     className="text-blue-600 hover:underline cursor-pointer">
                                                         {parent.title} <span className="text-gray-500 capitalize">[{parentType}]</span>
                                                 </a>
                                             </li>
                                         );
                                     })}
                                 </ul>
                             </div>
                         )}

                        {/* CONDITIONAL RENDER: Spotify Embed or Fallback Details */}
                        <div className="p-4 border border-gray-300 rounded-md bg-white shadow-sm clear-both">
                             {isSpotifyEntity && spotifyUri ? (
                                 <SpotifyEmbed spotifyUri={spotifyUri} height={entityData.entity.pk_namespace.split('.')[1] === 'track' ? 80 : 352} /> // Smaller height for tracks
                             ) : (
                                 // Fallback to existing display for non-spotify or if data is somehow wrong
                                <EntityDetailsDisplay entityDetails={entityData} onNavigate={navigateToEntity} />
                             )}
                         </div>

                        {/* Render Children (Always render if available) */}
                        {entityData.children && entityData.children.length > 0 && (
                             <div className="pt-2 border-gray-200"> {/* Removed mt-3 as parent div gap handles it */}
                                {(() => {
                                    const groupedChildren = {};
                                    entityData.children.forEach(child => {
                                        const childType = child.pk_namespace.split('.')[1] || 'unknown';
                                        if (!groupedChildren[childType]) groupedChildren[childType] = [];
                                        groupedChildren[childType].push(child);
                                    });
                                    const sortedChildTypes = Object.keys(groupedChildren).sort();

                                    return sortedChildTypes.map(childType => (
                                        <div key={childType} className="mb-2">
                                             <h5 className="text-xs font-semibold mt-1 capitalize text-gray-600">[{childType}]</h5>
                                             <ul className="text-xs text-gray-600 list-disc list-inside space-y-1 pl-4">
                                                 {groupedChildren[childType].map((child) => (
                                                     <li key={`${child.pk_namespace}-${child.pk}`}>
                                                         <a href={`/?pk_namespace=${child.pk_namespace}&pk=${child.pk}`}
                                                            onClick={(e) => { e.preventDefault(); navigateToEntity(child.pk_namespace, child.pk); }}
                                                            className="text-blue-600 hover:underline cursor-pointer">
                                                              {child.title}
                                                         </a>
                                                     </li>
                                                 ))}
                                             </ul>
                                         </div>
                                     ));
                                })()}
                             </div>
                         )}
                    </div>
                 )}

                 {/* Placeholder: Show if no URL params and not in an error/loading state */}
                 {displayState === 'placeholder' && (
                    <div className="p-4 border border-dashed border-gray-300 rounded-md bg-white/50 shadow-sm text-gray-500 text-center">
                        Search for an item or select one to view details.
                    </div>
                )}
            </div>
        </div>
    );
}

export default App
