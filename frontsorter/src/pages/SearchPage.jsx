import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom'; // Import useNavigate
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from 'use-debounce';

// --- Helper Functions (Copied from old App.jsx) ---
const formatArtists = (artists) => {
    if (!artists || artists.length === 0) return '';
    return artists.map(a => a.name).join(', ');
};

const getSmallestImageUrl = (images) => {
    if (!images || images.length === 0) return null;
    return images[images.length - 1].url;
};

// --- API Fetching Functions (Copied from old App.jsx) ---
const fetchSuggestionsFn = async (query) => {
    if (!query || query.length < 2) {
        return [];
    }
    console.log("Fetching suggestions for:", query);
    const response = await fetch(`/api/spotify/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

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

const ensureEntityFn = async ({ pk_namespace, pk, title, metadata }) => {
    const isSpotifyEntity = pk_namespace.startsWith('spotify.');
    if (!isSpotifyEntity) {
        console.log(`Skipping ensure for non-Spotify entity: ${pk_namespace}/${pk}`);
        return { skipped: true };
    }

    console.log(`Ensuring Spotify entity: ${pk_namespace}/${pk}`);
    const response = await fetch(`/api/spotify/ensure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pk_namespace, pk, title, metadata }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to ensure entity ${pk_namespace}/${pk}: ${response.status} ${errorText}`);
        throw new Error(`Ensure failed for ${pk_namespace}/${pk}: ${response.status} ${errorText}`, { cause: { status: response.status } });
    }
    console.log(`Ensure successful or entity already existed for: ${pk_namespace}/${pk}`);
    return await response.json();
};


// --- Search Page Component ---
function SearchPage() {
    const [inputValue, setInputValue] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const suggestionBoxRef = useRef(null);
    const queryClient = useQueryClient();
    const navigate = useNavigate(); // Use navigate hook
    const [debouncedInputValue] = useDebounce(inputValue, 300);

    // --- React Query Hooks ---
    const suggestionsQuery = useQuery({
        queryKey: ['suggestions', debouncedInputValue],
        queryFn: () => fetchSuggestionsFn(debouncedInputValue),
        enabled: debouncedInputValue.length >= 2,
        staleTime: 5 * 60 * 1000,
        keepPreviousData: true,
    });

    const ensureMutation = useMutation({
        mutationFn: ensureEntityFn,
        onSuccess: (data, variables) => {
            console.log("Ensure mutation successful:", data);
            // Optional: Invalidate details query if needed elsewhere, but not strictly required on Search page
            // queryClient.invalidateQueries({ queryKey: ['entityDetails', variables.pk_namespace, variables.pk] });
        },
        onError: (error, variables) => {
            console.error(`Ensure mutation failed for ${variables.pk_namespace}/${variables.pk}:`, error);
            // TODO: Add user feedback for ensure failure if needed
        },
    });

    // --- Event Handlers ---
    const handleInputChange = (event) => {
        const value = event.target.value;
        setInputValue(value);
        setHighlightedIndex(-1);
    };

    // Function to navigate to the selected entity's page
    const navigateToEntity = (suggestion) => {
        if (suggestion) {
            const { pk_namespace, pk } = suggestion;
            console.log("Navigating to entity:", pk_namespace, pk);

            // Proactive ensure before navigating
            // Check if details *might* be stale or non-existent before ensuring
            // This check is optional but can save ensure calls if data is fresh enough
            const existingData = queryClient.getQueryData(['entityDetails', pk_namespace, pk]);
            if (!existingData) {
                console.log("Proactively ensuring selected item:", pk_namespace, pk);
                ensureMutation.mutate({
                    pk_namespace: pk_namespace, pk: pk, title: suggestion.name,
                    metadata: {
                        imageUrl: getSmallestImageUrl(suggestion.images),
                        source: 'frontend_search_selection',
                        ...(suggestion.artists && { artists: formatArtists(suggestion.artists) }),
                        ...(suggestion.album?.name && { albumName: suggestion.album.name }),
                        ...(suggestion.type !== 'unknown' && { type: suggestion.type }),
                    },
                });
            } else {
                 console.log("Details likely cached for selected item, skipping proactive ensure.");
            }

            // Navigate to the entity page
            navigate(`/entity?pk_namespace=${encodeURIComponent(pk_namespace)}&pk=${encodeURIComponent(pk)}`);

            // Clear input after navigation
            setInputValue('');
            setHighlightedIndex(-1);
        }
    };

    const handleKeyDown = (event) => {
        const currentSuggestions = suggestionsQuery.data || [];
        const canShowSuggestions = inputValue.length > 0 || suggestionsQuery.isFetching;

        if (canShowSuggestions && currentSuggestions.length > 0) {
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                setHighlightedIndex(prevIndex => (prevIndex + 1) % currentSuggestions.length);
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setHighlightedIndex(prevIndex => (prevIndex - 1 + currentSuggestions.length) % currentSuggestions.length);
            } else if (event.key === 'Enter') {
                event.preventDefault();
                if (highlightedIndex >= 0 && currentSuggestions[highlightedIndex]) {
                    navigateToEntity(currentSuggestions[highlightedIndex]); // Navigate on selection
                }
            }
        }
        // Note: Backspace logic to remove tag is not needed here as there's no selected tag display
    };

    // --- Effect for closing suggestion box on outside click ---
    useEffect(() => {
        function handleClickOutside(event) {
            const inputElement = document.getElementById('search-input'); // Changed ID
            const suggestionsElement = suggestionBoxRef.current;

            if (suggestionsElement && !suggestionsElement.contains(event.target) &&
                (!inputElement || !inputElement.contains(event.target)))
            {
                setInputValue(''); // Clear input to hide suggestions
                setHighlightedIndex(-1);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [suggestionBoxRef]); // Dependency is only the ref

    // --- Rendering Logic ---
    const renderSuggestionDetails = (suggestion) => {
        // This function remains the same as in MainView
        const imageUrl = getSmallestImageUrl(suggestion.images);
        const imageElement = imageUrl ? (
            <img
                src={imageUrl}
                alt=""
                className="suggestion-preview-image w-6 h-6 mr-2 rounded inline-block object-cover align-middle"
            />
        ) : (
             <span className={`suggestion-preview-image w-6 h-6 mr-2 rounded inline-block ${suggestion.type === 'tag' ? 'bg-gray-400' : 'bg-gray-200'} align-middle flex items-center justify-center text-xs text-white`}>
                 {suggestion.type === 'tag' ? '#' : '?'}
             </span>
        );

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
             case 'tag': {
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

    const showSuggestions = (inputValue.length > 0 || suggestionsQuery.isFetching) && debouncedInputValue.length >= 2;

    return (
        <div className="w-full max-w-lg mx-auto"> {/* Center the search bar */}
            <h1 className="text-2xl font-semibold mb-4">Search</h1>
            <div className="relative"> {/* Container for input and dropdown */}
                {/* Input field */}
                <div className="flex flex-wrap items-center bg-white shadow-card border border-gray-200 rounded-smd px-3 py-2 focus-within:ring-2 focus-within:ring-brand-400 gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        id="search-input" // Use a more specific ID
                        type="text"
                        value={inputValue}
                        onChange={handleInputChange}
                        onKeyDown={handleKeyDown}
                        placeholder="Search Spotify, #tags..."
                        className="flex-grow p-0 outline-none text-sm min-w-[100px]"
                        autoComplete="off"
                    />
                    {/* Optional: Add a clear button? */}
                </div>

                {/* Suggestions dropdown */}
                {showSuggestions && (
                    <div ref={suggestionBoxRef} className="absolute z-20 w-full mt-1 bg-white/95 backdrop-blur border border-gray-200 shadow-card rounded-smd max-h-60 overflow-y-auto">
                        {(() => {
                            const isLoadingSuggestions = suggestionsQuery.isFetching && !suggestionsQuery.data?.length;
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
                                                // Use onMouseDown for better click handling before blur potentially clears input
                                                onMouseDown={(e) => { e.preventDefault(); navigateToEntity(suggestion); }}
                                            >
                                                {renderSuggestionDetails(suggestion)}
                                            </li>
                                        ))}
                                    </ul>
                                );
                            } else if (!suggestionsQuery.isFetching && debouncedInputValue.length >= 2 && (!suggestionsQuery.data || suggestionsQuery.data.length === 0)) {
                                return <div className="p-2 text-gray-500">No results found.</div>;
                            } else {
                                return null; // Render nothing if no condition met
                            }
                        })()}
                    </div>
                )}
            </div>
            {/* Optional: Display search history or other relevant info */}
        </div>
    );
}

export default SearchPage;