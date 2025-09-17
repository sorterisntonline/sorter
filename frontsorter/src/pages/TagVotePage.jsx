import { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
    fetchSlugResolutionFn, 
    createTagCollectionVoteFn 
} from '../fetchers/folksonomyEndpoints';

// Component to display a tag collection for voting
function TagCollectionCard({ collection, isDisabled, isSelected }) {
    if (!collection) return null;

    return (
        <div 
            className={`
                flex flex-col p-6 rounded-lg border-2 transition-all duration-200 
                ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:shadow-lg'}
                ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'}
            `}
        >
            {/* Collection header */}
            <div className="flex items-start justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 leading-tight">
                    {collection.name}
                </h3>
                <div className="flex flex-col items-end text-sm text-gray-500">
                    <div>Score: {collection.vote_score}</div>
                    <div>Votes: {collection.vote_count}</div>
                </div>
            </div>

            {/* Collection description */}
            {collection.description && (
                <p className="text-gray-700 text-sm mb-4 flex-grow">
                    {collection.description}
                </p>
            )}

            {/* Collection metadata */}
            <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded">
                    ID: {collection.id.slice(0, 8)}...
                </span>
                {collection.metadata?.visibility && (
                    <span className={`px-2 py-1 rounded ${
                        collection.metadata.visibility === 'private' 
                            ? 'bg-orange-100 text-orange-600' 
                            : 'bg-green-100 text-green-600'
                    }`}>
                        {collection.metadata.visibility}
                    </span>
                )}
                {collection.metadata?.community_curated && (
                    <span className="px-2 py-1 bg-blue-100 text-blue-600 rounded">
                        Community Curated
                    </span>
                )}
            </div>
        </div>
    );
}

// Main tag voting page component
function TagVotePage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const queryClient = useQueryClient();
    const [sliderValue, setSliderValue] = useState(0);
    const [reason, setReason] = useState('');

    // Get slug from URL parameters
    const slug = searchParams.get('slug') || 'Jedi'; // Default to Jedi for demo

    // Fetch slug resolution and competing collections
    const slugQuery = useQuery({
        queryKey: ['folksonomy', 'slug', slug, { include_disputed: true }],
        queryFn: fetchSlugResolutionFn,
        staleTime: 2 * 60 * 1000, // 2 minutes
        retry: 1,
    });

    // Vote mutation
    const voteMutation = useMutation({
        mutationFn: createTagCollectionVoteFn,
        onSuccess: (data) => {
            console.log('Tag collection vote successful:', data);
            // Invalidate queries to refresh data
            queryClient.invalidateQueries({ queryKey: ['folksonomy', 'slug', slug] });
            // Reset form
            setSliderValue(0);
            setReason('');
        },
        onError: (error) => {
            console.error('Tag collection vote failed:', error);
        },
    });

    // Event handlers
    const handleSliderChange = (event) => {
        setSliderValue(parseInt(event.target.value, 10));
    };

    const handleReasonChange = (event) => {
        setReason(event.target.value);
    };

    const handleVoteSubmit = () => {
        const collections = slugQuery.data?.competing_collections || [];
        
        if (collections.length < 2 || voteMutation.isPending) return;

        // For demo, vote between first two collections
        // In a real UI, user would select which collections to compare
        const leftCollection = collections[0];
        const rightCollection = collections[1];

        const voteData = {
            slug: slug,
            left_collection_id: leftCollection.id,
            right_collection_id: rightCollection.id,
            magnitude: sliderValue,
            attribute_id: 1, // 'like' attribute
            reason: reason.trim() || undefined,
        };

        console.log('Submitting tag collection vote:', voteData);
        voteMutation.mutate(voteData);
    };

    // Render states
    const isLoading = slugQuery.isLoading;
    const isSubmitting = voteMutation.isPending;
    const hasError = slugQuery.isError;
    const collections = slugQuery.data?.competing_collections || [];
    const currentResolution = slugQuery.data?.current;
    const historicalData = slugQuery.data?.historical || [];

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <div className="text-gray-600">Loading tag information for #{slug}...</div>
                </div>
            </div>
        );
    }

    if (hasError) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center max-w-md">
                    <div className="text-red-600 text-xl mb-4">⚠️ Tag Not Found</div>
                    <div className="text-gray-600 mb-4">
                        Could not find competing collections for #{slug}
                    </div>
                    <div className="text-sm text-red-600 mb-4">
                        {slugQuery.error?.message}
                    </div>
                    <div className="space-x-4">
                        <button 
                            onClick={() => slugQuery.refetch()}
                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                        >
                            Retry
                        </button>
                        <Link 
                            to="/folksonomy"
                            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                        >
                            Back to Folksonomy
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-6xl mx-auto px-4 py-8">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">
                        Vote on #{slug}
                    </h1>
                    <p className="text-gray-600">
                        Help decide which collection best represents this hashtag
                    </p>
                </div>

                {/* Navigation */}
                <div className="flex justify-center mb-8">
                    <div className="bg-white rounded-lg shadow-sm p-2 flex space-x-2">
                        <Link 
                            to="/folksonomy"
                            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                        >
                            ← Back to Folksonomy
                        </Link>
                        <input
                            type="text"
                            placeholder="Enter hashtag (e.g., Jedi)"
                            value={slug}
                            onChange={(e) => {
                                const newSlug = e.target.value.replace(/^#/, ''); // Remove # if present
                                setSearchParams({ slug: newSlug });
                            }}
                            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                </div>

                {/* Current winner */}
                {currentResolution && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-8">
                        <h2 className="text-lg font-semibold text-green-800 mb-2">
                            🏆 Current Winner for #{slug}
                        </h2>
                        <div className="text-green-700">
                            <div className="font-medium">Collection ID: {currentResolution.winning_collection_id}</div>
                            <div>Score: {currentResolution.winning_score}</div>
                            <div>Total Votes: {currentResolution.total_votes}</div>
                            {currentResolution.margin_of_victory && (
                                <div>Margin of Victory: {currentResolution.margin_of_victory}</div>
                            )}
                            {currentResolution.is_disputed && (
                                <div className="text-orange-600 font-medium mt-2">⚠️ Currently Disputed</div>
                            )}
                        </div>
                    </div>
                )}

                {/* Voting interface */}
                {collections.length >= 2 ? (
                    <div className="bg-white rounded-lg shadow-md p-6 mb-8">
                        <h2 className="text-xl font-semibold text-gray-900 mb-6 text-center">
                            Vote Between Competing Collections
                        </h2>

                        {/* Display two collections for comparison */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                            <TagCollectionCard 
                                collection={collections[0]} 
                                isDisabled={isSubmitting}
                            />
                            <TagCollectionCard 
                                collection={collections[1]} 
                                isDisabled={isSubmitting}
                            />
                        </div>

                        {/* Voting slider */}
                        <div className="max-w-lg mx-auto mb-6">
                            <div className="flex justify-between text-sm text-gray-600 mb-2">
                                <span>Strongly Left Collection</span>
                                <span>Neutral</span>
                                <span>Strongly Right Collection</span>
                            </div>
                            <input
                                type="range"
                                min="-50"
                                max="50"
                                step="1"
                                value={sliderValue}
                                onChange={handleSliderChange}
                                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                disabled={isSubmitting}
                            />
                            <div className="text-center text-sm text-gray-600 mt-2">
                                Current preference: {sliderValue > 0 ? 'Right' : sliderValue < 0 ? 'Left' : 'Neutral'} 
                                ({sliderValue})
                            </div>
                        </div>

                        {/* Reason input */}
                        <div className="max-w-lg mx-auto mb-6">
                            <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-2">
                                Reason (optional):
                            </label>
                            <textarea
                                id="reason"
                                value={reason}
                                onChange={handleReasonChange}
                                placeholder="Why do you prefer this collection?"
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                rows="3"
                                disabled={isSubmitting}
                            />
                        </div>

                        {/* Submit button */}
                        <div className="text-center">
                            <button
                                onClick={handleVoteSubmit}
                                disabled={isSubmitting}
                                className={`px-6 py-3 rounded-md font-medium transition-colors ${
                                    isSubmitting
                                        ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                                        : 'bg-blue-600 text-white hover:bg-blue-700'
                                }`}
                            >
                                {isSubmitting ? 'Submitting Vote...' : 'Submit Vote'}
                            </button>
                        </div>

                        {/* Vote result feedback */}
                        {voteMutation.isError && (
                            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
                                <p className="text-sm text-red-600">
                                    Vote failed: {voteMutation.error?.message || 'Unknown error'}
                                </p>
                            </div>
                        )}

                        {voteMutation.isSuccess && (
                            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
                                <p className="text-sm text-green-600">
                                    Vote submitted successfully! The results above have been updated.
                                </p>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
                        <div className="text-yellow-800">
                            <h3 className="font-semibold mb-2">No Competing Collections Found</h3>
                            <p className="text-sm">
                                There are fewer than 2 collections competing for #{slug}. 
                                Try creating some example scenarios from the main folksonomy page.
                            </p>
                        </div>
                    </div>
                )}

                {/* All competing collections */}
                {collections.length > 0 && (
                    <div className="bg-white rounded-lg shadow-md p-6">
                        <h2 className="text-xl font-semibold text-gray-900 mb-6">
                            All Competing Collections ({collections.length})
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {collections.map((collection, index) => (
                                <div key={collection.id} className="relative">
                                    <div className="absolute -top-2 -left-2 bg-blue-600 text-white text-xs px-2 py-1 rounded-full">
                                        #{index + 1}
                                    </div>
                                    <TagCollectionCard 
                                        collection={collection} 
                                        isDisabled={false}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Historical data */}
                {historicalData.length > 0 && (
                    <div className="mt-8 bg-white rounded-lg shadow-md p-6">
                        <h2 className="text-xl font-semibold text-gray-900 mb-6">
                            📜 Historical Resolutions
                        </h2>
                        <div className="space-y-2">
                            {historicalData.map((historical, index) => (
                                <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                                    <div>
                                        <span className="font-medium">{historical.collection_name}</span>
                                        <span className="text-sm text-gray-600 ml-2">
                                            (Score: {historical.vote_score})
                                        </span>
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        {historical.valid_from} - {historical.valid_to || 'present'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default TagVotePage;