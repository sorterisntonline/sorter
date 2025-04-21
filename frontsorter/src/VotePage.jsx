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

// --- API Function to Fetch Votes (filtered by parent) ---
const fetchVotesFn = async (parentNs, parentPk) => {
    // Only fetch if parent info is available
    if (!parentNs || !parentPk) {
        console.log("Parent info missing, skipping vote fetch.");
        return []; // Return empty array if no parent to filter by
    }

    // Construct the URL with query parameters
    const apiUrl = `/api/vote?parent_entity_ns=${encodeURIComponent(parentNs)}&parent_entity_pk=${encodeURIComponent(parentPk)}`;
    console.log("Fetching previous votes from:", apiUrl);
    const response = await fetch(apiUrl);

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to fetch votes. Status: ${response.status}. Body: ${errorText}`);
        const error = new Error(`HTTP error fetching votes! status: ${response.status}. ${errorText}`);
        error.status = response.status; // Attach status code
        throw error;
    }
    const data = await response.json();
    // Assuming the API returns an array of Vote objects
    return data || []; // Return data or empty array
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

// --- New Component for Displaying a Single Previous Vote ---
function PreviousVoteItem({ vote }) {
    // Determine styling based on magnitude
    const magnitudeClass = vote.magnitude > 0
        ? 'bg-green-100 text-green-800 border border-green-200' // Added border, refined colors
        : vote.magnitude < 0
            ? 'bg-red-100 text-red-800 border border-red-200'   // Added border, refined colors
            : 'bg-gray-100 text-gray-700 border border-gray-200'; // Adjusted gray

    // Helper function to extract entity type
    const getEntityType = (ns) => ns.split('.').pop() || ns;

    // Extract and format necessary data
    const leftType = getEntityType(vote.left_entity_pk_namespace);
    const rightType = getEntityType(vote.right_entity_pk_namespace);
    // const leftPkShort = vote.left_entity_pk.substring(0, 8); // No longer primary display
    // const rightPkShort = vote.right_entity_pk.substring(0, 8); // No longer primary display
    const userIdShort = vote.user_id.substring(0, 8);
    // Use a more compact date/time format
    const voteDate = new Date(vote.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
    const magnitudeValue = vote.magnitude > 0 ? `+${vote.magnitude}` : vote.magnitude;

    let queryOptions = {
        staleTime: 5 * 60 * 1000, // Cache for 5 minutes
        retry: 1,
        // Optional: Add placeholderData or initialData if useful
    };
    const { data: leftEntity, isLoading: leftEntityLoading, error: leftEntityError } = useQuery({ queryKey: ['entity', vote.left_entity_pk_namespace, vote.left_entity_pk], queryFn: () => fetchEntityFn(vote.left_entity_pk_namespace, vote.left_entity_pk), enabled: !!vote.left_entity_pk_namespace && !!vote.left_entity_pk, ...queryOptions });
    const { data: rightEntity, isLoading: rightEntityLoading, error: rightEntityError } = useQuery({ queryKey: ['entity', vote.right_entity_pk_namespace, vote.right_entity_pk], queryFn: () => fetchEntityFn(vote.right_entity_pk_namespace, vote.right_entity_pk), enabled: !!vote.right_entity_pk_namespace && !!vote.right_entity_pk, ...queryOptions });

    // Helper to display entity title or loading/error state
    const renderEntityName = (entity, isLoading, error, pk) => {
        if (isLoading) return <span className="italic text-gray-400">Loading...</span>;
        if (error) return <span className="italic text-red-500" title={error.message}>Error</span>;
        if (entity?.title) return <span className="font-semibold" title={pk}>{entity.title}</span>;
        return <span className="italic text-gray-500" title={pk}>Unknown</span>; // Fallback if title is missing
    };


    return (
        // Use white background, rounded corners, subtle shadow, and hover effect
        <li className="p-3 border border-gray-200 rounded-md bg-white shadow-sm hover:shadow-md transition-shadow duration-150 ease-in-out">
            <div className="flex justify-between items-center mb-1.5"> {/* Increased margin-bottom */}
                {/* Entity Comparison with Types and Fetched Titles */}
                <span
                    className="font-normal text-gray-800 text-sm truncate" // Changed default weight
                    title={`${vote.left_entity_pk_namespace}:${vote.left_entity_pk} vs ${vote.right_entity_pk_namespace}:${vote.right_entity_pk}`} // Tooltip for full info
                >
                    <span className="text-gray-500 text-xs capitalize">({leftType})</span> {renderEntityName(leftEntity, leftEntityLoading, leftEntityError, vote.left_entity_pk)}
                    <span className="mx-1.5 text-gray-400 font-light">vs</span> {/* Adjusted spacing and weight */}
                    <span className="text-gray-500 text-xs capitalize">({rightType})</span> {renderEntityName(rightEntity, rightEntityLoading, rightEntityError, vote.right_entity_pk)}
                </span>

                {/* Magnitude Badge - Rounded pill shape, bolder */}
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${magnitudeClass} flex-shrink-0 ml-2`}> {/* Added flex-shrink-0 and margin */}
                    {magnitudeValue}
                </span>
            </div>
            {/* Metadata line */}
            <div className="text-xs text-gray-500 flex justify-between items-center">
                 {/* Attribute and User Info */}
                 <span className="truncate"> {/* Added truncate */}
                    Attr: <span className="font-medium text-gray-600">{vote.attribute_id}</span>
                    <span className="mx-1.5 text-gray-400">|</span> {/* Separator */}
                    User: <span className="font-medium text-gray-600" title={vote.user_id}>{userIdShort}...</span>
                 </span>
                 {/* Timestamp */}
                 <span className="flex-shrink-0 ml-2" title={new Date(vote.created_at).toISOString()}> {/* Add full ISO date title */}
                    {voteDate}
                 </span>
            </div>
             {/* Optional: Display entity fetch errors more explicitly if needed */}
             {(leftEntityError || rightEntityError) && (
                <div className="text-xs text-red-500 mt-1 border-t pt-1">
                    {leftEntityError && <p>Error loading left item: {leftEntityError.status === 404 ? 'Not Found' : 'Fetch Failed'}</p>}
                    {rightEntityError && <p>Error loading right item: {rightEntityError.status === 404 ? 'Not Found' : 'Fetch Failed'}</p>}
                </div>
            )}
        </li>
    );
}

// --- Vote Page Component ---
function VotePage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate(); // Hook for navigation
    const queryClient = useQueryClient(); // Hook for query invalidation
    const parentNs = searchParams.get('parent_ns');
    const parentPk = searchParams.get('parent_pk');
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

    // --- Query for Previous Votes (filtered by parent) ---
    const votesQuery = useQuery({
        queryKey: ['votes', parentNs, parentPk], // Include parent in query key
        queryFn: () => fetchVotesFn(parentNs, parentPk),
        enabled: !!parentNs && !!parentPk, // Only run if parent info exists
        ...queryOptions
    });

    // --- Mutation Setup ---
    const voteMutation = useMutation({
        mutationFn: submitVoteFn,
        onSuccess: (data) => {
            console.log("Vote submission successful:", data);
            // Invalidate the votes query for the current parent to refetch
            queryClient.invalidateQueries({ queryKey: ['votes', parentNs, parentPk] });

            // TODO: Navigate to next pair or back to parent
            // For now, just show alert and maybe navigate back if possible
            if (parentNs && parentPk) {
                // Optionally navigate back, or implement logic for next pair
                // navigate(`/?pk_namespace=${encodeURIComponent(parentNs)}&pk=${encodeURIComponent(parentPk)}`);
                 console.log("Navigation to next pair/parent not implemented yet.");
            }
        },
        onError: (error) => {
            console.error("Vote submission failed:", error);
            // Show user-friendly error message
        },
    });

    // --- Event Handlers ---
    const handleSliderChange = (event) => {
        setSliderValue(parseInt(event.target.value, 10)); // Ensure value is integer
    };

    const handleVoteSubmit = () => {
        if (!leftQuery.data || !rightQuery.data || voteMutation.isPending) return;

        console.log("Submitting Vote:");
        // TODO: Get actual attribute_id if different from default
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
    // Combine potential errors (add votesQuery error)
    const combinedError = leftQuery.error || rightQuery.error || voteMutation.error || votesQuery.error;
    const isSuccess = leftQuery.isSuccess && rightQuery.isSuccess;
    const leftItem = leftQuery.data;
    const rightItem = rightQuery.data;
    const previousVotes = votesQuery.data || []; // Default to empty array

    // --- Parent Link --- (No changes needed)
    const parentLink = parentNs && parentPk ? (
        <Link to={`/?pk_namespace=${encodeURIComponent(parentNs)}&pk=${encodeURIComponent(parentPk)}`} className="text-blue-600 hover:underline text-sm">
            &larr; Back to Parent
        </Link>
    ) : null;

    // --- Main Return ---
    return (
        <div className="min-h-screen bg-gray-50/60 flex flex-col items-center pt-10 pb-10 px-4">
            <div className="w-full max-w-4xl"> {/* Increased max-width slightly for wider embeds */}
                <div className="mb-6 flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-gray-800">How much better?</h2>
                    {parentLink}
                </div>

                {isLoading && (
                    <div className="text-center text-gray-500 py-10">Loading pair...</div>
                )}

                 {/* Display combined errors (fetch or mutation) */}
                {combinedError && !isLoading && ( // Show only if not loading initially
                    <div className="text-center text-red-600 bg-red-50 border border-red-200 p-4 rounded-md shadow-sm mb-4">
                        <p>Error:</p>
                        {leftQuery.isError && <p className="text-sm mt-1">Loading left item: {leftQuery.error?.message || 'Unknown error'}</p>}
                        {rightQuery.isError && <p className="text-sm mt-1">Loading right item: {rightQuery.error?.message || 'Unknown error'}</p>}
                        {voteMutation.isError && <p className="text-sm mt-1">Submitting vote: {voteMutation.error?.message || 'Unknown error'}</p>}
                        {votesQuery.isError && <p className="text-sm mt-1">Loading previous votes: {votesQuery.error?.message || 'Unknown error'}</p>}
                        {(leftQuery.error?.status === 404 || rightQuery.error?.status === 404) && <p className="text-sm mt-1">Could not find one or both items.</p>}
                    </div>
                )}

                {/* Only display items and slider if both queries are successful */}
                {isSuccess && leftItem && rightItem && (
                    <div className="flex flex-col items-center justify-center gap-6 bg-white p-6 mb-8">
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

                {/* --- Previous Votes Section --- */}
                 {parentNs && parentPk && ( // Only show if we have parent info to filter by
                    <div className="w-full max-w-4xl mt-8 p-4 bg-white rounded-lg shadow">
                        <h3 className="text-lg font-semibold mb-3 text-gray-700 border-b pb-2">Previous Votes for Parent</h3>
                        {votesQuery.isLoading && <p className="text-gray-500">Loading votes...</p>}
                        {/* Error handled globally above */}
                        {votesQuery.isSuccess && previousVotes.length === 0 && (
                            <p className="text-gray-500">No votes found for this parent yet.</p>
                        )}
                        {votesQuery.isSuccess && previousVotes.length > 0 && (
                            <ul className="space-y-2 text-sm">
                                {previousVotes.map((vote, index) => (
                                    // Use the new component here
                                    <PreviousVoteItem key={index} vote={vote} />
                                ))}
                            </ul>
                        )}
                    </div>
                 )}

                {/* Optional Debug Info */}
                {/* <div className="mt-8 p-3 bg-gray-50 border border-gray-200 rounded text-xs text-gray-600">
                    <p>Parent: {parentNs}/{parentPk}</p>
                    <p>Left: {left_ns}/{left_pk} (Status: {leftQuery.status})</p>
                    <p>Right: {right_ns}/{right_pk} (Status: {rightQuery.status})</p>
                    <p>Slider: {sliderValue}</p>
                    <p>Votes Query Status: {votesQuery.status} (# {previousVotes.length})</p> // Added votes query debug
                </div> */}
            </div>
        </div>
    );
}

export { VotePage };