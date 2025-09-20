import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AuthAPI } from '../api/auth';

// Component to display individual vote history item
function VoteHistoryItem({ vote, onDelete, isDeleting }) {
  // Get entity info for display
  const leftEntity = `${vote.left_entity_pk_namespace.split('.')[1] || 'item'}: ${vote.left_entity_pk}`;
  const rightEntity = `${vote.right_entity_pk_namespace.split('.')[1] || 'item'}: ${vote.right_entity_pk}`;
  
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getMagnitudeLabel = (magnitude) => {
    if (magnitude > 25) return 'Strongly Right';
    if (magnitude > 0) return 'Right';
    if (magnitude < -25) return 'Strongly Left';
    if (magnitude < 0) return 'Left';
    return 'Neutral';
  };

  const getMagnitudeColor = (magnitude) => {
    if (Math.abs(magnitude) > 25) return '#e74c3c';
    if (Math.abs(magnitude) > 0) return '#f39c12';
    return '#95a5a6';
  };

  return (
    <div className="vote-history-item">
      <div className="vote-entities">
        <span className="vote-entity left">{leftEntity}</span>
        <span className="vote-vs">vs</span>
        <span className="vote-entity right">{rightEntity}</span>
      </div>
      <div className="vote-details">
        <span 
          className="vote-magnitude" 
          style={{ color: getMagnitudeColor(vote.magnitude) }}
        >
          {getMagnitudeLabel(vote.magnitude)} ({vote.magnitude > 0 ? '+' : ''}{vote.magnitude})
        </span>
        <span className="vote-date">{formatDate(vote.created_at)}</span>
      </div>
      <button
        className="delete-vote-btn"
        onClick={() => onDelete(vote)}
        disabled={isDeleting}
        title="Delete this vote"
      >
        <svg className="delete-icon" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9zM4 5a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM6 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
}

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
              <VoteHistoryItem
                key={`${vote.left_entity_pk_namespace}-${vote.left_entity_pk}-${vote.right_entity_pk_namespace}-${vote.right_entity_pk}-${vote.created_at}-${index}`}
                vote={vote}
                onDelete={deleteMutation.mutate}
                isDeleting={deleteMutation.isPending}
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
