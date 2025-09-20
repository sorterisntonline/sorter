import React from 'react';
import { useQuery } from '@tanstack/react-query';

function SelectedSongPanel({ selectedSong, user, onSongSelect }) {
  // Query for votes involving this song
  const { data: songVotes = [], isLoading: votesLoading } = useQuery({
    queryKey: ['song-votes', selectedSong?.id],
    queryFn: async () => {
      if (!selectedSong?.id) return [];
      // For now, return empty array - we'd need a specific endpoint for song votes
      // This could be implemented later to show all votes involving this song
      return [];
    },
    enabled: !!selectedSong?.id,
    refetchOnWindowFocus: false,
  });

  // Query for entity relationships (if we want to show related entities)
  const { data: relationships = [], isLoading: relLoading } = useQuery({
    queryKey: ['song-relationships', selectedSong?.id],
    queryFn: async () => {
      if (!selectedSong?.id) return [];
      // For now, return empty array - we'd need entity relationship data
      return [];
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

        {/* Spotify Player Embed */}
        <div className="player-section">
          <h4 className="section-title">Player</h4>
          <iframe
            className="spotify-player"
            src={`https://open.spotify.com/embed/track/${selectedSong.id}`}
            width="100%"
            height="152"
            frameBorder="0"
            allowFullScreen=""
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            title={`Spotify Player: ${selectedSong.title}`}
          ></iframe>
        </div>

        {/* Entity Relationships */}
        <div className="relationships-section">
          <h4 className="section-title">Relationships</h4>
          {relLoading ? (
            <div className="loading-state">
              <span>Loading relationships...</span>
            </div>
          ) : relationships.length > 0 ? (
            <div className="relationships-list">
              {relationships.map((rel, index) => (
                <div key={index} className="relationship-item">
                  {rel.type}: {rel.target}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              No relationships found for this song
            </div>
          )}
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
                <div key={index} className="vote-item">
                  <span className="vote-comparison">
                    vs {vote.opponent_title || 'Unknown'}
                  </span>
                  <span className="vote-result">
                    {vote.magnitude > 0 ? '+' : ''}{vote.magnitude}
                  </span>
                </div>
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
                const url = `/vote?pk_namespace=sorter.user&pk=${encodeURIComponent(user.handle)}&left_pin_ns=spotify.track&left_pin_pk=${encodeURIComponent(selectedSong.id)}`;
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
