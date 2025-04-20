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

// --- API Fetching Function for a SINGLE entity ---
const fetchEntityFn = async (pk_namespace, pk) => {
    // Basic validation
    if (!pk_namespace || !pk) {
        throw new Error("Missing identifiers for entity fetch.");
    }
    // Uses the existing endpoint from entity.rs
    // Note: We don't explicitly request parents/children here,
    // but the backend might return them by default or based on its own logic.
    const apiUrl = `/api/entity/${encodeURIComponent(pk_namespace)}/${encodeURIComponent(pk)}`;
    console.log("Fetching entity details from:", apiUrl);
    const response = await fetch(apiUrl);

    if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`HTTP error! status: ${response.status} for ${apiUrl}. ${errorText}`);
        error.status = response.status; // Attach status code
        throw error;
    }
    const data = await response.json();
    // Expect data format: { entity: { ... }, parents: [...], children: [...] }
    // We only need the core entity for the VotePage display for now.
    return data.entity;
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

    const { title, pk_namespace, pk, metadata } = item; // Add pk here
    const entityType = pk_namespace.split('.')[1] || 'item';
    const isSpotifyTrack = pk_namespace.includes('spotify.track');
    const isSpotifyAlbum = pk_namespace.includes('spotify.album');


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
                    title={`${embedType}: ${title}`} // Add a title for accessibility
                ></iframe>
                 {/* Keep title and type below embed */}
                 <h4 className="text-xs font-semibold text-center truncate w-full mt-2" title={title}>{title}</h4>
                 <p className="text-xs text-gray-500 capitalize">[{entityType}]</p>
            </div>
        );
    }

    // Fallback for non-Spotify items
    const imageUrl = item.profile_picture_url || getSmallestImageUrl(metadata?.images);

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
            <h4 className="text-xs font-semibold text-center truncate w-full" title={title}>{title}</h4>
            <p className="text-xs text-gray-500 capitalize">[{entityType}]</p>
        </div>
    );
}

// --- Vote Page Component ---
function VotePage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate(); // Hook for navigation
    const queryClient = useQueryClient(); // Hook for query invalidation
    const pk_namespace = searchParams.get('pk_namespace');
    const pk = searchParams.get('pk');
    // const childType = searchParams.get('type'); // Currently unused
    const left_ns = searchParams.get('left_ns');
    const left_pk = searchParams.get('left_pk');
    const right_ns = searchParams.get('right_ns');
    const right_pk = searchParams.get('right_pk');

    const [sliderValue, setSliderValue] = useState(0); // Default to 0 (neutral)

    const queryOptions = {
        staleTime: 5 * 60 * 1000, // Cache for 5 minutes
        retry: 1,
    };

    const leftQuery = useQuery({ queryKey: ['entity', left_ns, left_pk], queryFn: () => fetchEntityFn(left_ns, left_pk), enabled: !!left_ns && !!left_pk, ...queryOptions });
    const rightQuery = useQuery({ queryKey: ['entity', right_ns, right_pk], queryFn: () => fetchEntityFn(right_ns, right_pk), enabled: !!right_ns && !!right_pk, ...queryOptions });

    // --- Mutation Setup ---
    const voteMutation = useMutation({
        mutationFn: submitVoteFn,
        onSuccess: (data) => {
            console.log("Vote submission successful:", data);
            // TODO: Invalidate other relevant queries if needed, e.g., parent's children list

            // TODO: Navigate to next pair or back to parent
            if (pk_namespace && pk) {
                // Optionally navigate back, or implement logic for next pair
                console.log("Navigation to next pair/parent not implemented yet.");
                // Maybe navigate to history page?
                 // navigate(`/history?pk_namespace=${encodeURIComponent(pk_namespace)}&pk=${encodeURIComponent(pk)}`);
            } else {
                console.log("No parent context (pk_namespace, pk) found for navigation.");
            }
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
        if (!leftQuery.data || !rightQuery.data || voteMutation.isPending) return;

        console.log("Submitting Vote:");
        const voteData = {
            left_ns: left_ns,
            left_pk: left_pk,
            right_ns: right_ns,
            right_pk: right_pk,
            magnitude: sliderValue, // Use the slider value directly as magnitude
            attribute_id: 1, // Placeholder, will be handled in submitVoteFn ('like') - ID is 1
        };
        console.log("  Data:", voteData);

        voteMutation.mutate(voteData);
    };

    // --- Render Logic ---
    const isLoading = leftQuery.isLoading || rightQuery.isLoading;
    // Combine potential errors (removed votesQuery error)
    const combinedError = leftQuery.error || rightQuery.error || voteMutation.error;
    const isSuccess = leftQuery.isSuccess && rightQuery.isSuccess;
    const leftItem = leftQuery.data;
    const rightItem = rightQuery.data;

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
                        <p>Error:</p>
                        {leftQuery.isError && <p className="text-sm mt-1">Loading left item: {leftQuery.error?.message || 'Unknown error'}</p>}
                        {rightQuery.isError && <p className="text-sm mt-1">Loading right item: {rightQuery.error?.message || 'Unknown error'}</p>}
                        {voteMutation.isError && <p className="text-sm mt-1">Submitting vote: {voteMutation.error?.message || 'Unknown error'}</p>}
                        {(leftQuery.error?.status === 404 || rightQuery.error?.status === 404) && <p className="text-sm mt-1">Could not find one or both items.</p>}
                    </div>
                )}

                {/* Only display items and slider if both queries are successful */}
                {isSuccess && leftItem && rightItem && (
                    <div className="flex flex-col items-center justify-center gap-6 p-6 mb-8 rounded-lg">
                        {/* Container for the two items */}
                        <div className="flex w-full items-start justify-around gap-4">
                            {/* Left Item - Wrapped in Link */}
                            <Link to={`/?pk_namespace=${encodeURIComponent(left_ns)}&pk=${encodeURIComponent(left_pk)}`} className="no-underline hover:opacity-80 transition-opacity">
                                <VoteItemDisplay item={leftItem} />
                            </Link>

                            {/* Right Item - Wrapped in Link */}
                            <Link to={`/?pk_namespace=${encodeURIComponent(right_ns)}&pk=${encodeURIComponent(right_pk)}`} className="no-underline hover:opacity-80 transition-opacity">
                                <VoteItemDisplay item={rightItem} />
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
                                disabled={voteMutation.isPending} // Disable slider during submission
                            />
                        </div>

                        {/* Submit Button */}
                        <button
                            onClick={handleVoteSubmit}
                            disabled={voteMutation.isPending || isLoading} // Disable if loading entities or submitting
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
            </div>
        </div>
    );
}

export default VotePage;