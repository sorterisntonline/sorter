import { useSearchParams, Link } from 'react-router-dom';
// Import react-query hooks
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react'; // Import useState
import { useNavigate } from 'react-router-dom'; // Import useNavigate

import { fetchPairFn, submitVoteFn } from '../fetchers/voteEndpoints';
import { AuthAPI } from '../api/auth';
import VoteHistoryPanel from '../components/VoteHistoryPanel';
import '../styles/vote.css';

// Helper function to get the largest image URL (can be moved to a utils file)
const getLargestImageUrl = (images) => {
    if (!images || images.length === 0) return null;
    // Return the first image which should be the largest
    return images[0].url;
};

const buildQueryKey = params => {
        // Get potential pair identifiers from URL
    const url_left_ns = params.get('left_ns');
    const url_left_pk = params.get('left_pk');
    const url_right_ns = params.get('right_ns');
    const url_right_pk = params.get('right_pk');
    // Get parent context parameters
    const parent_pk_namespace = params.get('pk_namespace');
    const parent_pk = params.get('pk');

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

    return [queryKey, queryType]
}

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
            <div className={`vote-item ${isDisabled ? 'disabled' : ''}`}>
                {/* Spotify Embed */}
                <iframe
                    className="spotify-embed"
                    style={{ borderRadius: '12px' }}
                    src={`https://open.spotify.com/embed/${embedType}/${pk}`}
                    width="320"
                    height="450"
                    frameBorder="0"
                    allowFullScreen=""
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    loading="lazy"
                    title={`${embedType}: ${title || 'Spotify Content'}`}
                ></iframe>
                <h4 className="vote-item-title" title={title}>{title || 'Unknown Title'}</h4>
                <p className="vote-item-type">[{entityType}]</p>
            </div>
        );
    }

    // Fallback for non-Spotify items
    const imageUrl = profile_picture_url || getLargestImageUrl(metadata?.images);

    return (
        <div className={`vote-item ${isDisabled ? 'disabled' : ''}`}>
            {imageUrl ? (
                <img src={imageUrl} alt={`Cover for ${title}`} className="vote-item-image" />
            ) : (
                <div className="vote-item-placeholder">?</div>
            )}
            <h4 className="vote-item-title" title={title}>{title || 'Unknown Title'}</h4>
            <p className="vote-item-type">[{entityType}]</p>
        </div>
    );
}

// --- Vote Page Component ---
function VotePage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [sliderValue, setSliderValue] = useState(0);

    const [queryKey, queryType] = buildQueryKey(searchParams)

    // Query for current user info
    const { data: user } = useQuery({
        queryKey: ['user'],
        queryFn: AuthAPI.getMe,
        refetchOnWindowFocus: false,
    });

    const queryOptions = {
        staleTime: 5 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false, // Usually good for voting pages
    };

    // --- Pair Query setup ---
    // Single query, but the key now reflects the request type
    const pair = useQuery({
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

    // --- Vote Mutation Setup ---
    const voteMutation = useMutation({
        mutationFn: submitVoteFn,
        onSuccess: (data) => {
            console.log("Vote submission successful:", data);
            // Invalidate the *current* query to force refetch of a *new* pair
            // This works regardless of whether it was 'specific', 'children', or 'default' originally
            queryClient.invalidateQueries({ queryKey: queryKey });

            // Also invalidate Spotify ranking if this is a user's spotify tracks
            const parent_pk_namespace = searchParams.get('pk_namespace');
            const parent_pk = searchParams.get('pk');
            if (parent_pk_namespace === 'sorter.user' && parent_pk) {
                queryClient.invalidateQueries(['spotify-ranking', parent_pk]);
            }

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
        // Use data directly from pair
        const leftItem = pair.data?.left_entity;
        const rightItem = pair.data?.right_entity;

        if (!leftItem || !rightItem || voteMutation.isPending || pair.isPending) return;

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
    const loadingPair = pair.isPending;
    const submittingVote = voteMutation.isPending
    // Combine potential errors (fetch or mutation)
    const combinedError = pair.error || voteMutation.error;
    const isSuccess = pair.isSuccess;
    // Extract items from the fetched pair data
    const leftItem = pair.data?.left_entity;
    const rightItem = pair.data?.right_entity;

    // --- Main Return ---
    return (
        <div className="vote-page">
            <div className="vote-page-layout">
                {/* Main voting content */}
                <div className="vote-main-content">
                    {loadingPair && (
                        <div className="loading-container">
                            <div className="loading-spinner"></div>
                            <p>Loading pair...</p>
                        </div>
                    )}

                    {combinedError && !loadingPair && (
                        <div className="error-container">
                            <p>Error loading or submitting vote:</p>
                            {pair.isError && <p style={{ fontSize: '12px', marginTop: '4px' }}>Loading pair: {pair.error?.message || 'Unknown error'}</p>}
                            {voteMutation.isError && <p style={{ fontSize: '12px', marginTop: '4px' }}>Submitting vote: {voteMutation.error?.message || 'Unknown error'}</p>}
                            {pair.error?.message?.includes("Could not find") && <p style={{ fontSize: '12px', marginTop: '4px' }}>{pair.error.message}</p>}
                            {pair.error?.status === 404 && <p style={{ fontSize: '12px', marginTop: '4px' }}>Could not find the requested pair.</p>}
                        </div>
                    )}

                    {/* Only display items and slider if the pair query is successful and items exist */}
                    {isSuccess && leftItem && rightItem && (
                        <div className="vote-container">
                            {/* Container for the two items */}
                            <div className="vote-items-container">
                                {/* Left Item - Wrapped in Link */}
                                 <Link to={`/?pk_namespace=${encodeURIComponent(leftItem.pk_namespace)}&pk=${encodeURIComponent(leftItem.pk)}`} className="vote-item-link">
                                    <VoteItemDisplay item={leftItem} isDisabled={submittingVote || loadingPair}/>
                                </Link>

                                {/* Right Item - Wrapped in Link */}
                                <Link to={`/?pk_namespace=${encodeURIComponent(rightItem.pk_namespace)}&pk=${encodeURIComponent(rightItem.pk)}`} className="vote-item-link">
                                    <VoteItemDisplay item={rightItem} isDisabled={submittingVote || loadingPair}/>
                                </Link>
                            </div>

                            {/* Slider */}
                            <div className="slider-container">
                                 <div className="slider-labels">
                                    <span>Strongly Left</span>
                                    <span>Neutral</span>
                                    <span>Strongly Right</span>
                                </div>
                                <input
                                    id="slider"
                                    type="range"
                                    min="-50"
                                    max="50"
                                    step="1"
                                    value={sliderValue}
                                    onChange={handleSliderChange}
                                    className="vote-slider"
                                    disabled={submittingVote || loadingPair}
                                />
                            </div>

                            {/* Submit Button */}
                            <button
                                onClick={handleVoteSubmit}
                                disabled={submittingVote || loadingPair}
                                className="submit-button"
                            >
                                {submittingVote ? 'Submitting...' : 'Submit Vote'}
                            </button>
                        </div>
                    )}

                     {/* Message when no pair is available */}
                     {isSuccess && !leftItem && !rightItem && !loadingPair && (
                        <div style={{ textAlign: 'center', color: '#6b7280', padding: '40px 0' }}>
                            No pair available for voting at the moment.
                        </div>
                    )}
                </div>

                {/* Right panel - Vote History */}
                <div className="vote-right-panel">
                    <VoteHistoryPanel user={user} />
                </div>
            </div>
        </div>
    );
}

export default VotePage;