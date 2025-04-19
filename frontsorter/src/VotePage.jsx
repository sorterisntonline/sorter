import { useSearchParams, Link } from 'react-router-dom';
// Import react-query hooks
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react'; // Import useState

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
    // Expect data format: { pk_namespace, pk, title, profile_picture_url, metadata, created_at }
    return data;
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
    const parentNs = searchParams.get('parent_ns');
    const parentPk = searchParams.get('parent_pk');
    // const childType = searchParams.get('type'); // Currently unused
    const left_ns = searchParams.get('left_ns');
    const left_pk = searchParams.get('left_pk');
    const right_ns = searchParams.get('right_ns');
    const right_pk = searchParams.get('right_pk');

    // State for the slider value (0-100, default 50)
    const [sliderValue, setSliderValue] = useState(50);

    const queryOptions = {
        staleTime: 5 * 60 * 1000, // Cache for 5 minutes
        retry: 1,
    };

    // --- Data Fetching --- (No changes here)
    const leftQuery = useQuery({ queryKey: ['entity', left_ns, left_pk], queryFn: () => fetchEntityFn(left_ns, left_pk), enabled: !!left_ns && !!left_pk, ...queryOptions });
    const rightQuery = useQuery({ queryKey: ['entity', right_ns, right_pk], queryFn: () => fetchEntityFn(right_ns, right_pk), enabled: !!right_ns && !!right_pk, ...queryOptions });

    // --- Event Handlers ---
    const handleSliderChange = (event) => {
        setSliderValue(event.target.value);
    };

    // Updated handleVote to take slider value
    const handleVoteSubmit = () => {
        if (!leftQuery.data || !rightQuery.data) return; // Ensure data is loaded

        console.log("Vote Submitted:");
        console.log("  Parent:", parentNs, parentPk);
        console.log("  Left Item:", left_ns, left_pk);
        console.log("  Right Item:", right_ns, right_pk);
        console.log("  Slider Value:", sliderValue); // 0 = Left, 100 = Right, 50 = Neutral

        // TODO: Call mutation to submit vote data { parentNs, parentPk, left_ns, left_pk, right_ns, right_pk, value: sliderValue }
        alert(`Vote submitted with value: ${sliderValue} (Implementation pending)`);

        // TODO: Potentially navigate away or fetch next pair
    };

    // --- Render Logic --- (No changes needed for state calculation)
    const isLoading = leftQuery.isLoading || rightQuery.isLoading;
    const isError = leftQuery.isError || rightQuery.isError;
    const error = leftQuery.error || rightQuery.error;
    const isSuccess = leftQuery.isSuccess && rightQuery.isSuccess;
    const leftItem = leftQuery.data;
    const rightItem = rightQuery.data;

    // --- Parent Link --- (No changes needed)
    const parentLink = parentNs && parentPk ? (
        <Link to={`/?pk_namespace=${encodeURIComponent(parentNs)}&pk=${encodeURIComponent(parentPk)}`} className="text-brand-600 hover:underline text-sm">
            &larr; Back to Parent
        </Link>
    ) : null;

    // --- Main Return ---
    return (
        <div className="min-h-screen bg-brand-50/60 flex flex-col items-center pt-10 pb-10 px-4">
            <div className="w-full max-w-4xl"> {/* Increased max-width slightly for wider embeds */}
                <div className="mb-6 flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-gray-800">How much better?</h2>
                    {parentLink}
                </div>

                {isLoading && (
                    <div className="text-center text-gray-500 py-10">Loading pair...</div>
                )}

                {isError && (
                    <div className="text-center text-red-600 bg-red-50 border border-red-200 p-4 rounded-md shadow-sm">
                        <p>Error loading voting pair:</p>
                        {leftQuery.isError && <p className="text-sm mt-1">Left item error: {leftQuery.error?.message || 'Unknown error'}</p>}
                        {rightQuery.isError && <p className="text-sm mt-1">Right item error: {rightQuery.error?.message || 'Unknown error'}</p>}
                        {error?.status === 404 && <p className="text-sm mt-1">Could not find one or both items.</p>}
                    </div>
                )}

                {/* Only display items and slider if both queries are successful */}
                {isSuccess && leftItem && rightItem && (
                    <div className="flex flex-col items-center justify-center gap-6 bg-white p-6"> {/* Added rounded-lg shadow */}
                        {/* Container for the two items */}
                        <div className="flex w-full items-start justify-around gap-4"> {/* Changed to justify-around and items-start */}
                            {/* Left Item - Wrapped in Link */}
                            <Link to={`/?pk_namespace=${encodeURIComponent(left_ns)}&pk=${encodeURIComponent(left_pk)}`} className="no-underline hover:opacity-80 transition-opacity">
                                <VoteItemDisplay item={leftItem} />
                            </Link>

                            {/* Right Item - Wrapped in Link */}
                            <Link to={`/?pk_namespace=${encodeURIComponent(right_ns)}&pk=${encodeURIComponent(right_pk)}`} className="no-underline hover:opacity-80 transition-opacity">
                                <VoteItemDisplay item={rightItem} />
                            </Link>
                        </div>

                        {/* Slider - Moved below items */}
                        <div className="w-full max-w-lg px-4 pt-4"> {/* Adjusted width and padding */}
                            <input
                                id="slider"
                                type="range"
                                min="-50"
                                max="50"
                                value={sliderValue}
                                onChange={handleSliderChange}
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-brand-500"
                            />
                        </div>


                        {/* Submit Button */}
                        <button
                            onClick={handleVoteSubmit}
                            className="mt-4 px-6 py-2 bg-[#e0e0e0]  hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 transition-colors" // Added text-white
                        >
                            Submit Vote
                        </button>
                    </div>
                )}

                {/* Optional Debug Info */}
                {/* <div className="mt-8 p-3 bg-gray-50 border border-gray-200 rounded text-xs text-gray-600">
                    <p>Parent: {parentNs}/{parentPk}</p>
                    <p>Left: {left_ns}/{left_pk} (Status: {leftQuery.status})</p>
                    <p>Right: {right_ns}/{right_pk} (Status: {rightQuery.status})</p>
                    <p>Slider: {sliderValue}</p>
                </div> */}
            </div>
        </div>
    );
}

export { VotePage };