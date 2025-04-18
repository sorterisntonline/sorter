import { useSearchParams, Link } from 'react-router-dom';
// Import react-query hooks
import { useQuery } from '@tanstack/react-query';

// Helper function to get the smallest image URL (can be moved to a utils file)
const getSmallestImageUrl = (images) => {
    if (!images || images.length === 0) return null;
    // Assuming the API returns images sorted from largest to smallest
    return images[images.length - 1].url;
};

// --- API Fetching Function ---
const fetchVotePairDetailsFn = async (left_ns, left_pk, right_ns, right_pk) => {
    // Basic validation
    if (!left_ns || !left_pk || !right_ns || !right_pk) {
        throw new Error("Missing identifiers for voting pair.");
    }
    const apiUrl = `/api/vote_pair_details?left_ns=${encodeURIComponent(left_ns)}&left_pk=${encodeURIComponent(left_pk)}&right_ns=${encodeURIComponent(right_ns)}&right_pk=${encodeURIComponent(right_pk)}`;
    console.log("Fetching vote pair details from:", apiUrl);
    const response = await fetch(apiUrl);

    if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`HTTP error! status: ${response.status} for ${apiUrl}. ${errorText}`);
        error.status = response.status;
        throw error;
    }
    const data = await response.json();
    // Expect data format: { left: { entity details... }, right: { entity details... } }
    return data;
};


// --- Vote Item Component ---
function VoteItemDisplay({ item, onItemSelect, isSelected, isDisabled }) {
    if (!item) return null; // Should not happen if query is successful

    const { title, pk_namespace, pk, metadata } = item;
    const imageUrl = item.profile_picture_url || getSmallestImageUrl(metadata?.images); // Use profile_picture_url first if available
    const entityType = pk_namespace.split('.')[1] || 'item';

    return (
        <div
            className={`flex flex-col items-center p-4 border rounded-lg shadow-md cursor-pointer transition-all duration-200 ease-in-out w-full sm:w-52 ${isSelected ? 'border-brand-500 ring-2 ring-brand-300 bg-brand-50/50' : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-lg'} ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => !isDisabled && onItemSelect && onItemSelect(pk_namespace, pk)}
        >
            {imageUrl ? (
                <img src={imageUrl} alt={`Cover for ${title}`} className="w-32 h-32 object-cover rounded-md mb-3 shadow" />
            ) : (
                <div className="w-32 h-32 bg-gray-200 rounded-md mb-3 shadow flex items-center justify-center text-gray-400 text-4xl">?</div>
            )}
            <h4 className="text-sm font-semibold text-center truncate w-full" title={title}>{title}</h4>
            <p className="text-xs text-gray-500 capitalize">[{entityType}]</p>
        </div>
    );
}


// --- Vote Page Component ---
function VotePage() {
    const [searchParams] = useSearchParams();
    const parentNs = searchParams.get('parent_ns');
    const parentPk = searchParams.get('parent_pk');
    // const childType = searchParams.get('type'); // Type being voted on (e.g., spotify.track) - Currently unused
    const left_ns = searchParams.get('left_ns');
    const left_pk = searchParams.get('left_pk');
    const right_ns = searchParams.get('right_ns');
    const right_pk = searchParams.get('right_pk');

    // React Query to fetch details for the pair
    const votePairQuery = useQuery({
        queryKey: ['votePairDetails', left_ns, left_pk, right_ns, right_pk],
        queryFn: () => fetchVotePairDetailsFn(left_ns, left_pk, right_ns, right_pk),
        enabled: !!left_ns && !!left_pk && !!right_ns && !!right_pk, // Only run query if all params are present
        staleTime: 5 * 60 * 1000, // Cache for 5 minutes
        retry: 1, // Retry once on error
    });

    // TODO: Implement voting logic (useMutation?)
    const handleVote = (winner_ns, winner_pk, loser_ns, loser_pk) => {
        console.log("Vote cast for:", winner_ns, winner_pk);
        console.log("Loser:", loser_ns, loser_pk);
        // Here you would call a mutation to record the vote
        // e.g., voteMutation.mutate({ winner_ns, winner_pk, loser_ns, loser_pk, parentNs, parentPk });
        alert(`Voted for ${winner_pk}! (Implementation pending)`);
        // TODO: Potentially navigate away or fetch next pair after voting
    };

    const isLoading = votePairQuery.isLoading;
    const isError = votePairQuery.isError;
    const error = votePairQuery.error;
    const data = votePairQuery.data;

    const leftItem = data?.left;
    const rightItem = data?.right;

    // Parent link (if parent info is available)
    const parentLink = parentNs && parentPk ? (
        <Link to={`/?pk_namespace=${encodeURIComponent(parentNs)}&pk=${encodeURIComponent(parentPk)}`} className="text-brand-600 hover:underline text-sm">
            &larr; Back to Parent
        </Link>
    ) : null;

    return (
        <div className="min-h-screen bg-brand-50/60 flex flex-col items-center pt-10 pb-10 px-4">
            <div className="w-full max-w-3xl">
                <div className="mb-6 flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-gray-800">Which one is better?</h2>
                    {parentLink}
                </div>

                {isLoading && (
                    <div className="text-center text-gray-500 py-10">Loading pair...</div>
                )}

                {isError && (
                    <div className="text-center text-red-600 bg-red-50 border border-red-200 p-4 rounded-md shadow-sm">
                        <p>Error loading voting pair:</p>
                        <p className="text-sm mt-1">{error?.message || 'Unknown error'}</p>
                        {error?.status === 404 && <p className="text-sm mt-1">Could not find one or both items.</p>}
                    </div>
                )}

                {data && leftItem && rightItem && (
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-10">
                        {/* Left Item */}
                        <VoteItemDisplay
                            item={leftItem}
                            onItemSelect={() => handleVote(left_ns, left_pk, right_ns, right_pk)}
                        />

                        {/* VS Separator */}
                        <div className="text-3xl font-extrabold text-gray-400 my-4 sm:my-0">VS</div>

                        {/* Right Item */}
                        <VoteItemDisplay
                            item={rightItem}
                            onItemSelect={() => handleVote(right_ns, right_pk, left_ns, left_pk)}
                        />
                    </div>
                )}

                {/* Debug Info (Optional) */}
                {/* <div className="mt-8 p-3 bg-gray-50 border border-gray-200 rounded text-xs text-gray-600">
                    <p>Parent: {parentNs}/{parentPk}</p>
                    <p>Type: {childType}</p>
                    <p>Left: {left_ns}/{left_pk}</p>
                    <p>Right: {right_ns}/{right_pk}</p>
                    <p>Query Status: {votePairQuery.status}</p>
                </div> */}

            </div>
        </div>
    );
}

export { VotePage };