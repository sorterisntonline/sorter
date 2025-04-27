import { useSearchParams, Link } from 'react-router-dom';
// Import react-query hooks
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react'; // Import useState
import { useNavigate } from 'react-router-dom'; // Import useNavigate

// Helper function to get the smallest image URL (can be moved to a utils file)
const getSmallestImageUrl = (images) => {
    if (!images || images.length === 0) return null;
    // Assuming the API returns images sorted from largest to smallest
    return images[images.length - 1].url;
};

// --- API Fetching Function for a PAIR ---
const fetchPairFn = async ({ left_ns, left_pk, right_ns, right_pk }) => {
    // Construct the URL, potentially including query parameters for a specific pair
    let apiUrl = '/api/pair';
    const params = new URLSearchParams();
    if (left_ns && left_pk) {
        params.append('left_ns', left_ns);
        params.append('left_pk', left_pk);
    }
    if (right_ns && right_pk) {
        params.append('right_ns', right_ns);
        params.append('right_pk', right_pk);
    }
    const queryString = params.toString();
    if (queryString) {
        apiUrl += `?${queryString}`;
    }

    console.log("Fetching pair details from:", apiUrl);
    const response = await fetch(apiUrl);

    if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`HTTP error! status: ${response.status} for ${apiUrl}. ${errorText}`);
        error.status = response.status; // Attach status code
        throw error;
    }
    const data = await response.json();
    // Assume API returns { leftEntity: { ... }, rightEntity: { ... }, otherInfo... }
    // Or { error: "message" } if no pair is found/available
    if (data.error) {
        throw new Error(data.error);
    }
    // TODO: Adjust based on the actual structure returned by /api/pair
    if (!data.leftEntity || !data.rightEntity) {
         console.warn("API response missing leftEntity or rightEntity:", data);
         throw new Error("Incomplete pair data received from API.");
    }
    return data;
};

// --- API Function to Submit a Vote (Append-Only) ---
const submitVoteFn = async ({
    left_ns, left_pk, right_ns, right_pk, attribute_id, magnitude
    // voter_user_id is no longer needed, obtained from auth token
}) => {

    // TODO: Allow selecting attribute_id (defaulting to 'like' = 1)
    // NOTE: The 'like' attribute ID is 1 based on the migration, not 0.
    const attributeIdToUse = attribute_id !== undefined ? attribute_id : 1; // Default to 1 for 'like'

    const createUrl = '/api/vote'; // Only POST endpoint is used now

    const createPayload = {
        left_entity_pk_namespace: left_ns,
        left_entity_pk: left_pk,
        right_entity_pk_namespace: right_ns,
        right_entity_pk: right_pk,
        attribute_id: attributeIdToUse,
        magnitude: magnitude,
        // No voter_user_id here, backend gets it from auth
    };

    console.log("Submitting vote (POST):", createUrl, createPayload);

    const response = await fetch(createUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createPayload),
    });

    if (response.ok) {
         console.log("Vote created successfully");
        return await response.json(); // Return created vote data
    }

     // Handle specific errors like Conflict (409) or Bad Request (400)
    if (response.status === 409) {
         console.warn("Vote conflict detected.");
         // This might happen if the exact same vote (same pair, user, attr, timestamp) was somehow submitted twice,
         // or if the PK doesn't include timestamp and a vote already exists for the pair/user/attr.
         throw new Error("Vote conflict. It might already exist.");
    }
    if (response.status === 400) {
        const errorText = await response.text();
        console.error("Bad request (400):", errorText);
        throw new Error(`Invalid vote data: ${errorText}`);
    }

    // Handle other errors
    const errorText = await response.text();
    console.error(`Failed to submit vote. Status: ${response.status}. Body: ${errorText}`);
    const error = new Error(`Failed to submit vote. Status: ${response.status}.`);
    error.status = response.status;
    throw error;
};

// --- Vote Item Component (Now just displays, no voting click) ---
function VoteItemDisplay({ item, isDisabled }) { // Removed isSelected, pk is unused now
    if (!item) return null;

    // Assume item structure is now consistent as returned by /api/pair
    const { title, pk_namespace, pk, metadata, profile_picture_url } = item;
    const entityType = pk_namespace?.split('.')[1] || 'item'; // Add optional chaining
    const isSpotifyTrack = pk_namespace?.includes('spotify.track');
    const isSpotifyAlbum = pk_namespace?.includes('spotify.album');


    // Conditionally render Spotify Embed
    if (isSpotifyTrack || isSpotifyAlbum) {
        const embedType = isSpotifyTrack ? 'track' : 'album';
        return (
            <div className={`flex flex-col items-center p-1 transition-all duration-200 ease-in-out ${isDisabled ? 'opacity-50' : ''}`}>
                {/* Spotify Embed */}
                <iframe
                    style={{ borderRadius: '12px' }} // Optional: Spotify's recommended style
                    src={`https://open.spotify.com/embed/${embedType}/${pk}`}
                    width="300" // Adjust as needed for your layout
                    height="380" // Adjust as needed for your layout
                    frameBorder="0"
                    allowFullScreen=""
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    loading="lazy"
                    title={`${embedType}: ${title || 'Spotify Content'}`} // Add a title for accessibility
                ></iframe>
                 {/* Keep title and type below embed */}
                 <h4 className="text-xs font-semibold text-center truncate w-full mt-2" title={title}>{title || 'Unknown Title'}</h4>
                 <p className="text-xs text-gray-500 capitalize">[{entityType}]</p>
            </div>
        );
    }

    // Fallback for non-Spotify items
    const imageUrl = profile_picture_url || getSmallestImageUrl(metadata?.images); // Use passed item directly

    // Link wrapper will handle navigation
    return (
        <div
            className={`flex flex-col items-center p-3 transition-all duration-200 ease-in-out w-40 ${isDisabled ? 'opacity-50' : 'bg-white'}`}
        >
            {imageUrl ? (
                <img src={imageUrl} alt={`Cover for ${title}`} className="w-28 h-28 object-cover rounded-md mb-2" />
            ) : (
                <div className="w-28 h-28 bg-gray-200 rounded-md mb-2 flex items-center justify-center text-gray-400 text-3xl">?</div>
            )}
            <h4 className="text-xs font-semibold text-center truncate w-full" title={title}>{title || 'Unknown Title'}</h4>
            <p className="text-xs text-gray-500 capitalize">[{entityType}]</p>
        </div>
    );
}

// --- Vote Page Component ---
function VotePage() {
    const [searchParams, setSearchParams] = useSearchParams(); // Add setSearchParams
    const navigate = useNavigate(); // Hook for navigation
    const queryClient = useQueryClient(); // Hook for query invalidation
    // Get potential pair identifiers from URL
    const url_left_ns = searchParams.get('left_ns');
    const url_left_pk = searchParams.get('left_pk');
    const url_right_ns = searchParams.get('right_ns');
    const url_right_pk = searchParams.get('right_pk');
    // Keep parent context if available (might be needed for navigation or context)
    const parent_pk_namespace = searchParams.get('pk_namespace');
    const parent_pk = searchParams.get('pk');


    const [sliderValue, setSliderValue] = useState(0); // Default to 0 (neutral)

    const queryOptions = {
        staleTime: 5 * 60 * 1000, // Cache for 5 minutes
        retry: 1,
        // Refetch when URL params change, but maybe not on window focus if pair is fixed
        refetchOnWindowFocus: false,
    };

    // Single query to fetch the pair
    const pairQuery = useQuery({
        // Query key includes potential identifiers to refetch if they change
        queryKey: ['pair', url_left_ns, url_left_pk, url_right_ns, url_right_pk],
        // Pass identifiers to the fetch function
        queryFn: () => fetchPairFn({
            left_ns: url_left_ns,
            left_pk: url_left_pk,
            right_ns: url_right_ns,
            right_pk: url_right_pk,
        }),
        // Enable the query (always enabled now, as it fetches a default pair if no params)
        enabled: true,
        ...queryOptions,
        // onSuccess to potentially update URL if API returned a *different* pair than requested
        // or if it provided a default pair when none was specified.
        onSuccess: (data) => {
            // Update URL parameters if the fetched pair differs from URL, or if URL was empty
             const currentParams = new URLSearchParams(searchParams);
             let changed = false;
             if (data?.leftEntity && (data.leftEntity.pk_namespace !== url_left_ns || data.leftEntity.pk !== url_left_pk)) {
                 currentParams.set('left_ns', data.leftEntity.pk_namespace);
                 currentParams.set('left_pk', data.leftEntity.pk);
                 changed = true;
             }
             if (data?.rightEntity && (data.rightEntity.pk_namespace !== url_right_ns || data.rightEntity.pk !== url_right_pk)) {
                 currentParams.set('right_ns', data.rightEntity.pk_namespace);
                 currentParams.set('right_pk', data.rightEntity.pk);
                 changed = true;
             }
             // If we fetched a default pair (no params initially) ensure they are set
            if (!url_left_ns && !url_left_pk && !url_right_ns && !url_right_pk && data?.leftEntity && data?.rightEntity) {
                currentParams.set('left_ns', data.leftEntity.pk_namespace);
                currentParams.set('left_pk', data.leftEntity.pk);
                currentParams.set('right_ns', data.rightEntity.pk_namespace);
                currentParams.set('right_pk', data.rightEntity.pk);
                changed = true;
            }

             if (changed) {
                // Replace history state instead of pushing, avoids back button confusion
                setSearchParams(currentParams, { replace: true });
                console.log("Updated URL parameters with fetched pair identifiers.");
             }
        }
    });


    // --- Mutation Setup ---
    const voteMutation = useMutation({
        mutationFn: submitVoteFn,
        onSuccess: (data) => {
            console.log("Vote submission successful:", data);
            // Invalidate the current pair query to force refetch of a *new* pair
            queryClient.invalidateQueries({ queryKey: ['pair', url_left_ns, url_left_pk, url_right_ns, url_right_pk] });
            // Maybe navigate back to parent or specific history?
            // If parent context exists, maybe navigate back?
            if (parent_pk_namespace && parent_pk) {
                // navigate(`/?pk_namespace=${encodeURIComponent(parent_pk_namespace)}&pk=${encodeURIComponent(parent_pk)}`);
                 console.log("Navigation after vote not fully implemented yet.");
            } else {
                // Or simply refetching the pair might load the next one.
                 console.log("Refetching for next pair.");
            }
             // Reset slider after successful vote
             setSliderValue(0);
        },
        onError: (error) => {
            console.error("Vote submission failed:", error);
            // Show user-friendly error message (potentially in a toast/alert)
        },
    });

    // --- Event Handlers ---
    const handleSliderChange = (event) => {
        setSliderValue(parseInt(event.target.value, 10)); // Ensure value is integer
    };

    const handleVoteSubmit = () => {
        // Use data directly from pairQuery
        const leftItem = pairQuery.data?.leftEntity;
        const rightItem = pairQuery.data?.rightEntity;

        if (!leftItem || !rightItem || voteMutation.isPending || pairQuery.isLoading) return;

        console.log("Submitting Vote:");
        const voteData = {
            // Use the pk/ns from the fetched data
            left_ns: leftItem.pk_namespace,
            left_pk: leftItem.pk,
            right_ns: rightItem.pk_namespace,
            right_pk: rightItem.pk,
            magnitude: sliderValue, // Use the slider value directly as magnitude
            attribute_id: 1, // Placeholder, will be handled in submitVoteFn ('like') - ID is 1
        };
        console.log("  Data:", voteData);

        voteMutation.mutate(voteData);
    };

    // --- Render Logic ---
    const isLoading = pairQuery.isLoading;
    // Combine potential errors (fetch or mutation)
    const combinedError = pairQuery.error || voteMutation.error;
    const isSuccess = pairQuery.isSuccess;
    // Extract items from the fetched pair data
    const leftItem = pairQuery.data?.leftEntity;
    const rightItem = pairQuery.data?.rightEntity;

    // --- Main Return ---
    return (
        <div className="min-h-screen bg-gray-50/60 flex flex-col items-center pt-10 pb-10 px-4">
            <div className="w-full max-w-4xl"> {/* Increased max-width slightly for wider embeds */}
                {isLoading && (
                    <div className="text-center text-gray-500 py-10">Loading pair...</div>
                )}

                 {/* Display combined errors (fetch or mutation) */}
                 {combinedError && !isLoading && ( // Show only if not loading initially
                    <div className="text-center text-red-600 bg-red-50 border border-red-200 p-4 rounded-md mb-4">
                        <p>Error loading or submitting vote:</p>
                        {pairQuery.isError && <p className="text-sm mt-1">Loading pair: {pairQuery.error?.message || 'Unknown error'}</p>}
                        {voteMutation.isError && <p className="text-sm mt-1">Submitting vote: {voteMutation.error?.message || 'Unknown error'}</p>}
                        {/* Specific error message for API not finding a pair */}
                        {pairQuery.error?.message?.includes("Could not find") && <p className="text-sm mt-1">{pairQuery.error.message}</p>}
                        {pairQuery.error?.status === 404 && <p className="text-sm mt-1">Could not find the requested pair.</p>}
                    </div>
                )}

                {/* Only display items and slider if the pair query is successful and items exist */}
                 {isSuccess && leftItem && rightItem && (
                    <div className="flex flex-col items-center justify-center gap-6 p-6 mb-8 rounded-lg">
                        {/* Container for the two items */}
                        <div className="flex w-full items-start justify-around gap-4">
                            {/* Left Item - Wrapped in Link */}
                             <Link to={`/?pk_namespace=${encodeURIComponent(leftItem.pk_namespace)}&pk=${encodeURIComponent(leftItem.pk)}`} className="no-underline hover:opacity-80 transition-opacity">
                                <VoteItemDisplay item={leftItem} isDisabled={voteMutation.isPending || isLoading}/>
                            </Link>

                            {/* Right Item - Wrapped in Link */}
                            <Link to={`/?pk_namespace=${encodeURIComponent(rightItem.pk_namespace)}&pk=${encodeURIComponent(rightItem.pk)}`} className="no-underline hover:opacity-80 transition-opacity">
                                <VoteItemDisplay item={rightItem} isDisabled={voteMutation.isPending || isLoading}/>
                            </Link>
                        </div>

                        {/* Slider */}
                        <div className="w-full max-w-lg px-4 pt-4">
                             <div className="flex justify-between text-sm text-gray-600 mb-1">
                                <span>Strongly Left</span>
                                <span>Neutral</span>
                                <span>Strongly Right</span>
                            </div>
                            <input
                                id="slider"
                                type="range"
                                min="-50" // Represents strong preference for left
                                max="50"  // Represents strong preference for right
                                step="1" // Or adjust step as needed
                                value={sliderValue}
                                onChange={handleSliderChange}
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-blue-500"
                                disabled={voteMutation.isPending || isLoading} // Disable slider during submission or loading
                            />
                             <div className="text-center mt-2 font-medium text-gray-700">{sliderValue}</div> {/* Display current slider value */}
                        </div>

                        {/* Submit Button */}
                        <button
                            onClick={handleVoteSubmit}
                            disabled={voteMutation.isPending || isLoading} // Disable if loading pair or submitting
                            className={`mt-4 px-6 py-2 cursor-pointer text-white rounded font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                                voteMutation.isPending || isLoading
                                ? 'bg-gray-400 cursor-not-allowed'
                                : 'bg-blue-500 hover:bg-blue-600'
                            }`}
                        >
                            {voteMutation.isPending ? 'Submitting...' : 'Submit Vote'}
                        </button>
                    </div>
                )}

                 {/* Message when no pair is available (e.g., API returns error or empty) */}
                 {isSuccess && !leftItem && !rightItem && !isLoading && (
                    <div className="text-center text-gray-500 py-10">
                        No pair available for voting at the moment.
                    </div>
                )}
            </div>
        </div>
    );
}

export default VotePage;