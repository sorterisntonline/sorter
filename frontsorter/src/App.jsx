import { useState, useEffect, useRef } from 'react';
// Import react-router-dom hook
import { useSearchParams, Link, Routes, Route } from 'react-router-dom';
// Import react-query hooks
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
// Import use-debounce hook
import { useDebounce } from 'use-debounce';
// Import CSSTransition for animations (Step 9)
import { CSSTransition, SwitchTransition } from 'react-transition-group';
import { VotePage } from './VotePage';
import SpotifyPlayer from './SpotifyPlayer'; // Import the new component
import './App.css'

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

    return await response.json(); // Return potential entity data from ensure
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

// --- Child List Item Component (Step 6) ---
function ChildListItem({ child, onItemClick }) {
    return (
        <div
            className="flex items-center gap-2 px-2 py-1.5 rounded-smd cursor-pointer hover:bg-gray-100 hover:text-brand-600 transition-colors duration-100 ease-in-out"
            onClick={(e) => onItemClick(e, child.pk_namespace, child.pk)}
        >
            {child.profile_picture_url ? (
                <img src={child.profile_picture_url} alt={child.title || 'Child item image'} className="w-7 h-7 rounded-smd object-cover flex-shrink-0" />
            ) : (
                <div className="w-7 h-7 bg-gray-100 border border-gray-200 inline-flex items-center justify-center text-gray-400 text-lg flex-shrink-0 rounded-smd">?</div>
            )}
            <span className="truncate flex-1">{child.title}</span>
        </div>
    );
}

// --- EntityDetailsDisplay Component (Step 5 & 7) ---
function EntityDetailsDisplay({ entityDetails, onNavigate, onEnsureManually, isEnsuring }) {
    if (!entityDetails || !entityDetails.entity) {
        return <div className="text-gray-500">No details available.</div>;
    }

    const { entity, parents, children } = entityDetails;
    const { title, pk_namespace, pk, metadata } = entity;
    const entityType = pk_namespace.split('.')[1]; // e.g., 'album', 'artist', 'track'
    const spotifyUri = `spotify:${entityType}:${pk}`; // Construct Spotify URI

    // Handler for manual ensure button
    const handleManualEnsure = () => {
        if (onEnsureManually && !isEnsuring) {
            console.log(`Manually ensuring ${pk_namespace}/${pk}`);
            onEnsureManually({
                pk_namespace,
                pk,
                title,
                metadata // Pass existing metadata
            });
        }
    };

    // Basic info: Title and Type
    let basicInfo = (
         <h3 className="text-2xl font-semibold flex items-center gap-2 mb-2">
             <span>{title}</span>
             <span className="text-sm font-normal text-gray-500">[{entityType}]</span>
             {/* Manual Ensure Button */}
             {pk_namespace?.startsWith('spotify.') && onEnsureManually && (
                 <button
                     onClick={handleManualEnsure}
                     disabled={isEnsuring}
                     className={`text-xs px-2 py-0.5 rounded ${isEnsuring ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-brand-100 text-brand-700 hover:bg-brand-200'}`}
                     title={`Manually trigger backend sync for ${title}`}
                 >
                     {isEnsuring ? 'Syncing...' : 'Sync'}
                 </button>
             )}
         </h3>
    );

    let imageElement = null;
    if (entity.profile_picture_url) {
        const imageUrl = entity.profile_picture_url;
        if (imageUrl) {
             imageElement = (
                 <img
                     src={imageUrl}
                     alt={`Cover for ${title}`}
                     className="w-40 h-40 object-cover rounded-smd shadow"
                 />
             );
        }
    } else {
        imageElement = <div className="w-40 h-40 bg-gray-200 rounded-smd shadow flex items-center justify-center text-gray-400 text-4xl flex-shrink-0">?</div>;
    }

    let detailsList = [];

    // Common details based on type
    if (metadata?.artists && Array.isArray(metadata.artists)) {
        detailsList.push(
            <li key="artists"><span className="font-medium text-gray-600">Artist(s):</span> {formatArtists(metadata.artists)}</li>
        );
    }
     if (metadata?.release_date) {
        detailsList.push(
            <li key="release"><span className="font-medium text-gray-600">Released:</span> {metadata.release_date}</li>
        );
    }
     if (metadata?.label) {
        detailsList.push(
            <li key="label"><span className="font-medium text-gray-600">Label:</span> {metadata.label}</li>
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
            const childType = child.pk_namespace;
            if (!groupedChildren[childType]) {
                groupedChildren[childType] = [];
            }
            groupedChildren[childType].push(child);
        });
    }
    // Sort types alphabetically for consistent order (optional)
    const sortedChildTypes = Object.keys(groupedChildren).sort();
    // --- End Grouping ---

    // Conditionally render the Spotify Player for tracks
    const trackPlayer = entityType === 'track'
        ? <SpotifyPlayer uri={spotifyUri} /> : null;

    return (
        <div className="bg-white shadow-card border border-gray-100 rounded-smd p-5 flex flex-col gap-5">
            {/* Render Parents */}
            {parents && parents.length > 0 && (
                <div className="text-xs text-gray-600">
                    <span className="font-semibold text-gray-700 mr-1">Part of:</span>
                    {parents.map((parent, index) => {
                        const parentType = parent.pk_namespace.split('.')[1];
                        return (
                            <span key={`${parent.pk_namespace}-${parent.pk}`}>
                                <a href={`/?pk_namespace=${parent.pk_namespace}&pk=${parent.pk}`}
                                    onClick={(e) => handleLinkClick(e, parent.pk_namespace, parent.pk)}
                                    className="text-brand-600 hover:underline cursor-pointer">
                                        {parent.title} <span className="text-gray-500 capitalize">[{parentType}]</span>
                                </a>
                                {index < parents.length - 1 && ', '}
                            </span>
                        );
                    })}
                </div>
            )}
            <div className="flex gap-5">
                {imageElement || <div className="w-40 h-40 bg-gray-100 border border-gray-200 rounded-smd shadow flex items-center justify-center text-gray-400 text-4xl flex-shrink-0">?</div>}
                <div className="flex-1">
                    {basicInfo}
                    {trackPlayer}
                    {detailsList.length > 0 && (
                         <ul className="mt-2 space-y-1.5 text-sm text-gray-700 list-none">
                             {detailsList}
                         </ul>
                    )}
                </div>
            </div>
            {/* Render Children - Grouped by Type */}
            {sortedChildTypes.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                    {sortedChildTypes.map(childType => {
                        const childrenOfType = groupedChildren[childType];
                        let itemPairElement = null;

                        // --- BEGIN: Item Pair Preview (Step 7) ---
                        if (childrenOfType && childrenOfType.length >= 2) {
                            // Select two random distinct indices
                            let index1 = Math.floor(Math.random() * childrenOfType.length);
                            let index2 = Math.floor(Math.random() * childrenOfType.length);
                            // Ensure distinct indices if possible and length > 1
                            while (index1 === index2 && childrenOfType.length > 1) {
                                index2 = Math.floor(Math.random() * childrenOfType.length);
                            }

                            const item1 = childrenOfType[index1];
                            const item2 = childrenOfType[index2];
                            const item1ImageUrl = item1.profile_picture_url;
                            const item2ImageUrl = item2.profile_picture_url;
                            const voteLink = `/vote?parent_ns=${encodeURIComponent(entity.pk_namespace)}`
                            + `&parent_pk=${encodeURIComponent(entity.pk)}`
                            + `&type=${encodeURIComponent(childType)}`
                            + `&left_ns=${encodeURIComponent(item1.pk_namespace)}`
                            + `&left_pk=${encodeURIComponent(item1.pk)}`
                            + `&right_ns=${encodeURIComponent(item2.pk_namespace)}`
                            + `&right_pk=${encodeURIComponent(item2.pk)}`;

                            itemPairElement = (
                                <Link to={voteLink} className="cursor-pointer my-3 p-3 border border-brand-200 rounded-smd bg-brand-50/40 flex items-center justify-around gap-2 relative group no-underline transition transform hover:-translate-y-0.5">
                                    {/* Item 1 Preview */}
                                    <div className="text-center flex flex-col items-center w-1/3">
                                        {item1ImageUrl && <img src={item1ImageUrl} alt={item1.title} className="w-12 h-12 object-cover rounded-smd mb-1 shadow"/>}
                                        {!item1ImageUrl && <div className="w-12 h-12 bg-gray-200 rounded-smd mb-1 flex items-center justify-center text-gray-400 text-xl shadow">?</div>}
                                        <span className="text-xs text-gray-700 truncate w-full px-1">{item1.title}</span>
                                    </div>

                                    {/* Overlay VOTE text on hover */}
                                    <div className="absolute inset-0 flex items-center justify-center bg-brand-600/80 opacity-0 group-hover:opacity-100 transition-opacity rounded-smd">
                                        <span className="text-white text-3xl tracking-wide font-bold">VOTE</span>
                                    </div>

                                    {/* Item 2 Preview */}
                                    <div className="text-center flex flex-col items-center w-1/3">
                                        {item2ImageUrl && <img src={item2ImageUrl} alt={item2.title} className="w-12 h-12 object-cover rounded-smd mb-1 shadow"/>}
                                        {!item2ImageUrl && <div className="w-12 h-12 bg-gray-200 rounded-smd mb-1 flex items-center justify-center text-gray-400 text-xl shadow">?</div>}
                                        <span className="text-xs text-gray-700 truncate w-full px-1">{item2.title}</span>
                                    </div>
                                </Link>
                            );
                        }
                        // --- END: Add Item Pair Preview ---


                        return (
                            <div key={childType} className="mb-4">
                                <h5 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                                    {childType.replace(/^spotify\./, '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                </h5>
                                {itemPairElement}
                                <div className="text-sm text-gray-700 space-y-1">
                                    {childrenOfType.map((child) => (
                                        <ChildListItem
                                            key={`${child.pk_namespace}-${child.pk}`}
                                            child={child}
                                            onItemClick={handleLinkClick}
                                        />
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
// --- END EntityDetailsDisplay ---


// --- App Component ---
function MainView() {
    const [inputValue, setInputValue] = useState('');
    // Selected tags now derived primarily from URL/details query result
    const [selectedTags, setSelectedTags] = useState([]);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const suggestionBoxRef = useRef(null);
    const queryClient = useQueryClient();
    // Use the useDebounce hook
    const [debouncedInputValue] = useDebounce(inputValue, 300);
    // --- Search Params ---
    const [searchParams, setSearchParams] = useSearchParams();
    const urlPkNamespace = searchParams.get('pk_namespace');
    const urlPk = searchParams.get('pk');

    const entityDetailsNodeRef = useRef(null); // Ref for CSSTransition (Step 9)

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

    const handleInputChange = (event) => {
        const value = event.target.value;
        setInputValue(value);
        setHighlightedIndex(-1); // Reset highlight on input change
    };

    // Navigate function to update URL params
    const navigateToEntity = (pk_ns, pk) => {
        console.log("Navigating to:", pk_ns, pk);
        setSearchParams({ pk_namespace: pk_ns, pk: pk });
        // Clear input *after* setting params
        setInputValue('');
        // No need to manually clear debouncedInputValue
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
                 // No need to manually clear debouncedInputValue, it derives from inputValue
                 setHighlightedIndex(-1);
             }
         }
         document.addEventListener("mousedown", handleClickOutside);
         return () => {
             document.removeEventListener("mousedown", handleClickOutside);
         };
     }, [suggestionBoxRef]); // Removed urlPkNamespace dependency


    // --- Rendering Logic ---
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

    return (
        <div className="min-h-screen bg-brand-50/60 flex flex-col items-center pt-14 px-4">
            {/* Input and Tag Display Area */}
            <div className="w-full max-w-lg relative mb-4">
                <div className="flex flex-wrap items-center bg-white shadow-card border border-gray-200 rounded-smd px-3 py-2 focus-within:ring-2 focus-within:ring-brand-400 gap-2">
                  {/* Display tag if successfully loaded */}
                  {displayTag && (
                    <span key={`${displayTag.pk_namespace}-${displayTag.pk}`} className="selected-tag-display flex items-center bg-brand-500/90 text-white text-sm font-medium px-2.5 py-0.5 rounded-full gap-1">
                      {displayTag.imageUrl && (
                          <img src={displayTag.imageUrl} alt="" className="tag-preview-image w-4 h-4 rounded-sm object-cover"/>
                      )}
                      {displayTag.name} <span className='text-xs opacity-80 ml-1'>[{displayTag.type}]</span>
                      <button
                        type="button"
                        className="text-white/70 hover:text-white focus:outline-none"
                        onClick={removeTag}
                        aria-label={`Remove ${displayTag.name} (${displayTag.type})`}
                      >
                        &times;
                      </button>
                    </span>
                  )}
                  {/* Input field */}
                  <input
                    id="tag-input" type="text" value={inputValue}
                    onChange={handleInputChange} onKeyDown={handleKeyDown}
                    placeholder={!hasActiveEntity ? "Search Spotify, #tags..." : "Search another..."}
                    className={`flex-grow p-0 outline-none text-sm min-w-[100px] ${hasActiveEntity ? 'pl-1' : ''}`}
                    autoComplete="off"
                  />
                </div>

                {/* Suggestions dropdown - (Step 4) */}
                 {showSuggestions && (
                      <div ref={suggestionBoxRef} className="absolute z-20 w-full mt-1 bg-white/95 backdrop-blur border border-gray-200 shadow-card rounded-smd max-h-60 overflow-y-auto">
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
                                                  className={`px-3 py-2 flex items-center gap-2 cursor-pointer ${index === highlightedIndex ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
                                                  onMouseDown={(e) => { e.preventDefault(); addTag(suggestion); }}
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

            {/* Display Area for Entity Details (Step 9: Wrapped in SwitchTransition/CSSTransition) */}
            <div className="mt-4 w-full max-w-2xl">
                 {/* Use SwitchTransition for smoother change between states */}
                 <SwitchTransition mode="out-in">
                     <CSSTransition
                         // Use a combination of state variables as the key to trigger transitions
                         key={`${displayState}-${urlPkNamespace}-${urlPk}`}
                         nodeRef={entityDetailsNodeRef} // Use nodeRef for findDOMNode compatibility
                         timeout={180} // Match CSS transition duration
                         classNames="fade" // Match CSS class names (Step 9)
                         unmountOnExit // Remove element when exited
                     >
                         {/* Wrap the content in a div with the ref */}
                         <div ref={entityDetailsNodeRef}>
                             {/* Loading state */}
                             {displayState === 'loading' && (
                                 <div className="p-5 border border-gray-200 rounded-smd bg-white shadow-card text-gray-500 text-center">
                                     Loading details... {ensureMutation.isLoading ? '(Ensuring entity...)' : ''}
                                 </div>
                             )}
                             {/* Error states */}
                             {displayState === 'error_ensure' && (
                                 <div className="p-5 border border-red-300 rounded-smd bg-red-50 shadow-card text-red-700">
                                     Error ensuring entity: {ensureMutation.error?.message || 'Unknown error'}
                                 </div>
                             )}
                             {displayState === 'error_details' && ensureMutation.status !== 'error' && (
                                 <div className="p-5 border border-red-300 rounded-smd bg-red-50 shadow-card text-red-700">
                                     Error loading details: {detailsQuery.error?.message || 'Unknown error'}
                                     {detailsQuery.error?.status === 404 && urlPkNamespace?.startsWith('spotify.') && ' (Could not find or ensure the Spotify entity)'}
                                 </div>
                             )}
                             {/* Success state */}
                             {displayState === 'success' && detailsQuery.data && (
                                 <EntityDetailsDisplay
                                     entityDetails={detailsQuery.data}
                                     onNavigate={navigateToEntity}
                                     onEnsureManually={ensureMutation.mutate}
                                     isEnsuring={ensureMutation.isLoading}
                                 />
                             )}
                             {/* Placeholder state */}
                             {displayState === 'placeholder' && (
                                 <div className="p-5 border border-dashed border-gray-300 rounded-smd bg-white/50 shadow-sm text-gray-500 text-center">
                                     Search for an item or select one to view details.
                                 </div>
                             )}
                         </div>
                     </CSSTransition>
                 </SwitchTransition>
            </div>
        </div>
    );
}

function App() {
    return (
        <Routes>
            <Route path="/" element={<MainView />} />
            <Route path="/vote" element={<VotePage />} />
            {/* Add other routes here if needed */}
        </Routes>
    );
}

export default App
