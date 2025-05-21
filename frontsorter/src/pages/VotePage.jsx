import { useSearchParams, Link } from 'react-router-dom';
// Import react-query hooks
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react'; // Import useState
// import { useNavigate } from 'react-router-dom'; // Not needed at the moment

// Helper function to get the smallest image URL (can be moved to a utils file)
const getSmallestImageUrl = (images) => {
    if (!images || images.length === 0) return null;
    // Assuming the API returns images sorted from largest to smallest
    return images[images.length - 1].url;
};

// --- API Fetching Function for a PAIR ---
const fetchPairFn = async ({ queryKey }) => {
    // Destructure parameters from the queryKey
    const [_key, type, param1, param2, param3, param4] = queryKey; // e.g., ['pair', 'specific', ns, pk, ns, pk] or ['pair', 'children', ns, pk]

    let apiUrl = '/api/pair';
    const params = new URLSearchParams();

    if (type === 'specific' && param1 && param2 && param3 && param4) {
        params.append('left_ns', param1);
        params.append('left_pk', param2);
        params.append('right_ns', param3);
        params.append('right_pk', param4);
    } else if (type === 'children' && param1 && param2) {
        params.append('pk_namespace', param1);
        params.append('pk', param2);
    }
    // If type is 'default' or params are missing for specific/children,
    // we send no query parameters, letting the backend provide a default pair.

    const queryString = params.toString();
    if (queryString) {
        apiUrl += `?${queryString}`;
    }

    console.log(`Fetching pair (${type}) from:`, apiUrl);
    const response = await fetch(apiUrl);

    if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`HTTP error! status: ${response.status} for ${apiUrl}. ${errorText}`);
        error.status = response.status; // Attach status code
        throw error;
    }
    const data = await response.json();
    if (data.error) {
        throw new Error(data.error);
    }
    if (!data.left_entity || !data.right_entity) {
         console.warn("API response missing left_entity or right_entity:", data);
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
                <img src={imageUrl} alt={`Cover for ${title}`} className="w-28 h-28 object-cover mb-2" />
            ) : (
                <div className="w-28 h-28 bg-gray-200 mb-2 flex items-center justify-center text-gray-400 text-3xl">?</div>
            )}
            <h4 className="text-xs font-semibold text-center truncate w-full" title={title}>{title || 'Unknown Title'}</h4>
            <p className="text-xs text-gray-500 capitalize">[{entityType}]</p>
        </div>
    );
}

// --- Vote Page Component ---
function VotePage() {
    const [searchParams, setSearchParams] = useSearchParams();
    // const navigate = useNavigate(); // Not currently used
    const queryClient = useQueryClient();

    // Get potential pair identifiers from URL
    const url_left_ns = searchParams.get('left_ns');
    const url_left_pk = searchParams.get('left_pk');
    const url_right_ns = searchParams.get('right_ns');
    const url_right_pk = searchParams.get('right_pk');
    // Get parent context parameters
    const parent_pk_namespace = searchParams.get('pk_namespace');
    const parent_pk = searchParams.get('pk');

    const [sliderValue, setSliderValue] = useState(0);

    // --- Determine Query Type and Construct Query Key ---
    let queryType = 'default'; // Assume default if no specific params match
    let queryKeyParams = [];

    if (url_left_ns && url_left_pk && url_right_ns && url_right_pk) {
        queryType = 'specific';
        queryKeyParams = [url_left_ns, url_left_pk, url_right_ns, url_right_pk];
    } else if (parent_pk_namespace && parent_pk) {
        // Only treat as 'children' if specific params are NOT set
        queryType = 'children';
        queryKeyParams = [parent_pk_namespace, parent_pk];
    }
    // else: queryType remains 'default', queryKeyParams remains empty

    const queryKey = ['pair', queryType, ...queryKeyParams];
    // Examples:
    // ['pair', 'specific', 'ns1', 'pk1', 'ns2', 'pk2']
    // ['pair', 'children', 'parent_ns', 'parent_pk']
    // ['pair', 'default']

    const queryOptions = {
        staleTime: 5 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false, // Usually good for voting pages
    };

    // Single query, but the key now reflects the request type
    const pairQuery = useQuery({
        queryKey: queryKey, // Use the dynamically constructed key
        queryFn: fetchPairFn, // fetchPairFn now uses the queryKey
        enabled: true,
        ...queryOptions,
        onSuccess: (data) => {
            // Update URL parameters to reflect the *returned* pair's specific IDs
            // This standardizes the URL after any type of request resolves.
             const currentParams = new URLSearchParams(searchParams);
             let changed = false;

             // Always try to set left/right based on response
             if (data?.left_entity) {
                 if (currentParams.get('left_ns') !== data.left_entity.pk_namespace || currentParams.get('left_pk') !== data.left_entity.pk) {
                     currentParams.set('left_ns', data.left_entity.pk_namespace);
                     currentParams.set('left_pk', data.left_entity.pk);
                     changed = true;
                 }
             }
            if (data?.right_entity) {
                 if (currentParams.get('right_ns') !== data.right_entity.pk_namespace || currentParams.get('right_pk') !== data.right_entity.pk) {
                    currentParams.set('right_ns', data.right_entity.pk_namespace);
                    currentParams.set('right_pk', data.right_entity.pk);
                    changed = true;
                 }
            }

            // If the original request was for children, we might want to remove
            // the parent pk/namespace params now that we have specific children in the URL.
            // Or keep them for context? Let's remove them for cleaner URLs reflecting the current view.
            if (queryType === 'children') {
                if (currentParams.has('pk_namespace')) {
                    currentParams.delete('pk_namespace');
                    changed = true;
                }
                if (currentParams.has('pk')) {
                    currentParams.delete('pk');
                    changed = true;
                }
            }


             if (changed) {
                setSearchParams(currentParams, { replace: true });
                console.log("Updated URL parameters based on fetched pair.");
             }
        }
    });


    // --- Mutation Setup ---
    const voteMutation = useMutation({
        mutationFn: submitVoteFn,
        onSuccess: (data) => {
            console.log("Vote submission successful:", data);
            // Invalidate the *current* query to force refetch of a *new* pair
            // This works regardless of whether it was 'specific', 'children', or 'default' originally
            queryClient.invalidateQueries({ queryKey: queryKey });

             // Reset slider after successful vote
             setSliderValue(0);
             // TODO: Decide on navigation - refetching might be sufficient
             console.log("Refetching for next pair.");
        },
        onError: (error) => {
            console.error("Vote submission failed:", error);
        },
    });

    // --- Event Handlers ---
    const handleSliderChange = (event) => {
        setSliderValue(parseInt(event.target.value, 10)); // Ensure value is integer
    };

    const handleVoteSubmit = () => {
        // Use data directly from pairQuery
        const leftItem = pairQuery.data?.left_entity;
        const rightItem = pairQuery.data?.right_entity;

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
    const leftItem = pairQuery.data?.left_entity;
    const rightItem = pairQuery.data?.right_entity;

    // --- Main Return ---
    return (
        <div className="min-h-screen bg-gray-50/60 flex flex-col items-center pt-10 pb-10 px-4">
            <div className="w-full max-w-4xl"> {/* Increased max-width slightly for wider embeds */}
                {isLoading && (
                    <div className="text-center text-gray-500 py-10">Loading pair...</div>
                )}

                 {/* Display combined errors (fetch or mutation) */}
                {combinedError && !isLoading && ( // Show only if not loading initially
                    <div className="text-center text-red-600 bg-red-50 border border-red-200 p-4 mb-4">
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
                    <div className="flex flex-col items-center justify-center gap-6 p-6 mb-8">
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
                                className="w-full h-2 bg-gray-200 appearance-none cursor-pointer dark:bg-gray-700 accent-blue-500"
                                disabled={voteMutation.isPending || isLoading} // Disable slider during submission or loading
                            />
                        </div>

                        {/* Submit Button */}
                        <button
                            onClick={handleVoteSubmit}
                            disabled={voteMutation.isPending || isLoading} // Disable if loading pair or submitting
                            className={`mt-4 px-6 py-2 cursor-pointer text-white font-medium transition-colors focus:outline-none ${
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