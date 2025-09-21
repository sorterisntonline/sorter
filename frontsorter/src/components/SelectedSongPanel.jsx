import React from 'react';
import { useQuery } from '@tanstack/react-query';
import VoteItem from './VoteItem';
import { useSpotifyPlayer } from '../contexts/SpotifyPlayerContext';

function SelectedSongPanel({ selectedSong, user, onSongSelect }) {
  const { playTrack, queueTrack, isReady, accessToken } = useSpotifyPlayer();
  
  // Query for votes involving this song
  const { data: songVotes = [], isLoading: votesLoading } = useQuery({
    queryKey: ['song-votes', selectedSong?.id],
    queryFn: async () => {
      if (!selectedSong?.id) return [];
      
      const response = await fetch(`/api/vote/entity?namespace=spotify.track&pk=${encodeURIComponent(selectedSong.id)}&limit=20`);
      if (!response.ok) {
        throw new Error('Failed to fetch song votes');
      }
      return response.json();
    },
    enabled: !!selectedSong?.id,
    refetchOnWindowFocus: false,
  });



  if (!selectedSong) {
    return (
      <div className="selected-song-panel">
        <h3 className="panel-title">Selected Song</h3>
        <div className="panel-content">
          <div className="empty-state">
            Click on a song to view details, player, and relationships
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="selected-song-panel">
      <h3 className="panel-title">Selected Song</h3>
      <div className="panel-content">
        {/* Song Details */}
        <div className="song-details-section">
          <div className="song-header">
            {selectedSong.album_art && (
              <img 
                src={selectedSong.album_art} 
                alt={`${selectedSong.title} album art`}
                className="selected-song-art"
              />
            )}
            <div className="song-meta">
              <h4 className="song-title">{selectedSong.title}</h4>
              <p className="song-artist">{selectedSong.artist}</p>
              {selectedSong.album && (
                <p className="song-album">{selectedSong.album}</p>
              )}
            </div>
          </div>
        </div>

        {/* Playback Controls */}
        <div className="playback-section">
          <h4 className="section-title">Playback</h4>
          <div className="playback-controls">
            <button 
              className="control-btn play-btn-large" 
              onClick={() => playTrack(`spotify:track:${selectedSong.id}`)}
              disabled={!isReady || !accessToken}
              title="Play now"
            >
              ▶️ Play
            </button>
            <button 
              className="control-btn queue-btn-large" 
              onClick={() => queueTrack(`spotify:track:${selectedSong.id}`)}
              disabled={!isReady || !accessToken}
              title="Add to queue"
            >
              ➕ Add to Queue
            </button>
          </div>
        </div>



        {/* Votes involving this song */}
        <div className="song-votes-section">
          <h4 className="section-title">Votes</h4>
          {votesLoading ? (
            <div className="loading-state">
              <span>Loading votes...</span>
            </div>
          ) : songVotes.length > 0 ? (
            <div className="song-votes-list">
              {songVotes.map((vote, index) => (
                <VoteItem 
                  key={index} 
                  vote={vote} 
                  compact={true} 
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              No votes found for this song yet
            </div>
          )}
        </div>

        {/* Actions */}
        {user && (
          <div className="song-actions-section">
            <button 
              className="action-button primary"
              onClick={() => {
                // Navigate to vote page with this song pinned
                const url = `/vote?ns=sorter.user&pk=${encodeURIComponent(user.handle)}&left_pin_ns=spotify.track&left_pin_pk=${encodeURIComponent(selectedSong.id)}`;
                window.location.href = url;
              }}
            >
              Compare This Song
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default SelectedSongPanel;
