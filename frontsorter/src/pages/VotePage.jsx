import { useSearchParams } from 'react-router-dom';
import { useState, useCallback } from 'react';
import { useVotePair, useSubmitVote, buildQueryKey } from '../hooks/useVotePair';
import VoteItemDisplay from '../components/VoteItemDisplay';
import VoteSlider from '../components/VoteSlider';
import FeedbackDisplay from '../components/FeedbackDisplay';

function VotePage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [sliderValue, setSliderValue] = useState(0);
    
    // URL management logic
    const handlePairFetched = useCallback((data, queryType) => {
        const currentParams = new URLSearchParams(searchParams);
        let changed = false;

        // Update URL with fetched pair data
        if (data?.left_entity) {
            currentParams.set('left_ns', data.left_entity.pk_namespace);
            currentParams.set('left_pk', data.left_entity.pk);
            changed = true;
        }
        if (data?.right_entity) {
            currentParams.set('right_ns', data.right_entity.pk_namespace);
            currentParams.set('right_pk', data.right_entity.pk);
            changed = true;
        }

        // Clean up parent params if we fetched children
        if (queryType === 'children') {
            currentParams.delete('pk_namespace');
            currentParams.delete('pk');
            changed = true;
        }

        if (changed) {
            setSearchParams(currentParams, { replace: true });
        }
    }, [searchParams, setSearchParams]);

    // Data fetching hooks
    const { queryKey } = buildQueryKey(searchParams);
    const pair = useVotePair(searchParams, handlePairFetched);
    const voteMutation = useSubmitVote(queryKey, () => setSliderValue(0));

    // Event handlers
    const handleVoteSubmit = () => {
        const { left_entity: left, right_entity: right } = pair.data || {};
        if (!left || !right || voteMutation.isPending || pair.isPending) return;

        voteMutation.mutate({
            left_ns: left.pk_namespace,
            left_pk: left.pk,
            right_ns: right.pk_namespace,
            right_pk: right.pk,
            magnitude: sliderValue,
            attribute_id: 1,
        });
    };

    if (pair.isPending) return <FeedbackDisplay type="loading" message="Loading pair..." />;

    const error = pair.error || voteMutation.error;
    if (error) return <FeedbackDisplay type="error" error={pair.error} voteMutationError={voteMutation.error} />;

    const { left_entity: leftItem, right_entity: rightItem } = pair.data || {};
    if (!leftItem || !rightItem) {
        return (
            <div className="min-h-screen bg-gray-50/60 flex items-center justify-center">
                <p className="text-gray-500">No pair available for voting at the moment.</p>
            </div>
        );
    }

    const isDisabled = voteMutation.isPending || pair.isPending;

    return (
        <div className="min-h-screen bg-gray-50/60 flex flex-col items-center pt-10 pb-10 px-4">
            <div className="w-full max-w-4xl">
                <div className="flex flex-col items-center justify-center gap-6 p-6 mb-8 rounded-lg">
                    <div className="flex w-full items-start justify-around gap-4">
                        <VoteItemDisplay item={leftItem} isDisabled={isDisabled} />
                        <VoteItemDisplay item={rightItem} isDisabled={isDisabled} />
                    </div>

                    <VoteSlider
                        value={sliderValue}
                        onChange={(e) => setSliderValue(parseInt(e.target.value, 10))}
                        disabled={isDisabled}
                    />

                    <button
                        onClick={handleVoteSubmit}
                        disabled={isDisabled}
                        className={`mt-4 px-6 py-2 cursor-pointer text-white rounded font-medium transition-colors 
                            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 
                            ${isDisabled ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'}`}
                    >
                        {voteMutation.isPending ? 'Submitting...' : 'Submit Vote'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default VotePage;