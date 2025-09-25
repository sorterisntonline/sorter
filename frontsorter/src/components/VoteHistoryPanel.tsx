import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AuthAPI } from '../api/auth';
import VoteItem from './VoteItem';
import { DeleteVoteParams } from '../types/api';
import usePinnedSongStore from '../stores/pinnedSongStore';
import '../styles/vote-modern.css';



function VoteHistoryPanel({ user, selectedSong }) {
  const queryClient = useQueryClient();
  const { getSongById } = usePinnedSongStore();

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
    mutationFn: async (vote: DeleteVoteParams) => {
      const response = await fetch(
        `/api/vote/${encodeURIComponent(vote.left_entity_ns)}/${encodeURIComponent(vote.left_entity_pk)}/${encodeURIComponent(vote.right_entity_ns)}/${encodeURIComponent(vote.right_entity_pk)}/${vote.user_id}/${vote.attribute_id}`,
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
      queryClient.invalidateQueries({ queryKey: ['vote-history', user?.id] });
      // Also refresh any ranking data that might be affected
      queryClient.invalidateQueries({ queryKey: ['spotify-ranking'] });
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

  // Filter votes by selected song if one is selected
  const filteredVotes = React.useMemo(() => {
    if (!selectedSong || !votes) return votes;
    
    const selectedSongId = selectedSong.id;
    return votes.filter(vote => {
      // Check if the vote involves the selected song (either as left or right entity)
      const leftEntityId = vote.left_entity_pk;
      const rightEntityId = vote.right_entity_pk;
      const isSpotifyTrack = vote.left_entity_ns?.includes('spotify.track') || 
                            vote.right_entity_ns?.includes('spotify.track');
      
      return isSpotifyTrack && (leftEntityId === selectedSongId || rightEntityId === selectedSongId);
    });
  }, [votes, selectedSong]);

  const panelTitle = selectedSong ? `Vote History - ${selectedSong.title}` : 'Vote History';
  const emptyMessage = selectedSong 
    ? `No votes involving "${selectedSong.title}" yet.`
    : 'No votes yet. Start voting to see your history here.';

  return (
    <div className="vote-history-panel">
      <h3 className="panel-title">{panelTitle}</h3>
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

        {filteredVotes && filteredVotes.length === 0 && !isLoading && (
          <div className="empty-state">
            {emptyMessage}
          </div>
        )}

        {filteredVotes && filteredVotes.length > 0 && (
          <div className="vote-history-list">
            {filteredVotes.map((vote, index) => (
              <VoteItem
                key={`${vote.left_entity_ns}-${vote.left_entity_pk}-${vote.right_entity_ns}-${vote.right_entity_pk}-${vote.created_at}-${index}`}
                vote={vote}
                showDelete={true}
                onDelete={deleteMutation.mutate}
                isDeleting={deleteMutation.isPending}
                compact={false}
                getSongById={getSongById}
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
