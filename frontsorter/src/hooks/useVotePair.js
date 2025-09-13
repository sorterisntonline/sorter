
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchPairFn, submitVoteFn } from '../fetchers/voteEndpoints';

export const buildQueryKey = (params) => {
    const url_left_ns = params.get('left_ns');
    const url_left_pk = params.get('left_pk');
    const url_right_ns = params.get('right_ns');
    const url_right_pk = params.get('right_pk');
    const parent_pk_namespace = params.get('pk_namespace');
    const parent_pk = params.get('pk');

    let queryType = 'default';
    let queryKeyParams = [];

    if (url_left_ns && url_left_pk && url_right_ns && url_right_pk) {
        queryType = 'specific';
        queryKeyParams = [url_left_ns, url_left_pk, url_right_ns, url_right_pk];
    } else if (parent_pk_namespace && parent_pk) {
        queryType = 'children';
        queryKeyParams = [parent_pk_namespace, parent_pk];
    }

    const queryKey = ['pair', queryType, ...queryKeyParams];
    return { queryKey, queryType };
};

export const useVotePair = (searchParams, onPairFetched) => {
    const { queryKey, queryType } = buildQueryKey(searchParams);
    
    return useQuery({
        queryKey,
        queryFn: fetchPairFn,
        staleTime: 5 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
        onSuccess: (data) => onPairFetched?.(data, queryType),
    });
};

export const useSubmitVote = (queryKey, onSuccess) => {
    const queryClient = useQueryClient();
    
    return useMutation({
        mutationFn: submitVoteFn,
        onSuccess: (data) => {
            console.log("Vote submission successful:", data);
            queryClient.invalidateQueries({ queryKey });
            onSuccess?.(data);
        },
        onError: (error) => {
            console.error("Vote submission failed:", error);
        },
    });
};