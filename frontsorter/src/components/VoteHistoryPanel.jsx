import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AuthAPI } from '../api/auth';
import VoteItem from './VoteItem';



function VoteHistoryPanel({ user }) {
  const queryClient = useQueryClient();

  // Query for user's vote history
  const { data: votes = [], isLoading, error } = useQuery({
    queryKey: ['vote-history', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const response = await fetch(`/api/vote?user_id=${user.id}`, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to fetch vote history');
      }
      return response.json();
    },
    enabled: !!user?.id,
    refetchOnWindowFocus: false,
  });

  // Mutation for deleting votes
  const deleteMutation = useMutation({
    mutationFn: async (vote) => {
      const response = await fetch(
        `/api/vote/${encodeURIComponent(vote.left_entity_pk_namespace)}/${encodeURIComponent(vote.left_entity_pk)}/${encodeURIComponent(vote.right_entity_pk_namespace)}/${encodeURIComponent(vote.right_entity_pk)}/${vote.user_id}/${vote.attribute_id}`,
        {
          method: 'DELETE',
          credentials: 'include'
        }
      );
      if (!response.ok) {
        throw new Error('Failed to delete vote');
      }
      return response.json();
    },
    onSuccess: () => {
      // Refresh vote history
      queryClient.invalidateQueries(['vote-history', user?.id]);
      // Also refresh any ranking data that might be affected
      queryClient.invalidateQueries(['spotify-ranking']);
    },
    onError: (error) => {
      console.error('Error deleting vote:', error);
    }
  });

  if (!user) {
    return (
      <div className="vote-history-panel">
        <h3 className="panel-title">Vote History</h3>
        <div className="panel-content">
          <div className="empty-state">
            Please log in to view vote history
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="vote-history-panel">
      <h3 className="panel-title">Vote History</h3>
      <div className="panel-content">
        {isLoading && (
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <span>Loading votes...</span>
          </div>
        )}

        {error && (
          <div className="error-state">
            Error loading votes: {error.message}
          </div>
        )}

        {votes && votes.length === 0 && !isLoading && (
          <div className="empty-state">
            No votes yet. Start voting to see your history here.
          </div>
        )}

        {votes && votes.length > 0 && (
          <div className="vote-history-list">
            {votes.map((vote, index) => (
              <VoteItem
                key={`${vote.left_entity_pk_namespace}-${vote.left_entity_pk}-${vote.right_entity_pk_namespace}-${vote.right_entity_pk}-${vote.created_at}-${index}`}
                vote={vote}
                showDelete={true}
                onDelete={deleteMutation.mutate}
                isDeleting={deleteMutation.isPending}
                compact={false}
              />
            ))}
          </div>
        )}

        {deleteMutation.isError && (
          <div className="error-state">
            Error deleting vote: {deleteMutation.error.message}
          </div>
        )}
      </div>
    </div>
  );
}

export default VoteHistoryPanel;
