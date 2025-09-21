import React from 'react';
import { useSpotifyPlayer } from '../contexts/SpotifyPlayerContext';
import usePinnedSongStore from '../stores/pinnedSongStore';

function SelectedSongPanel({ selectedSong, user, onSongSelect }) {
  const { playTrack, queueTrack, isReady, accessToken } = useSpotifyPlayer();
  const { pinnedSong, setPinnedSong, clearPinnedSong, isSongPinned } = usePinnedSongStore();



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
      <div className="panel-header">
        <h3 className="panel-title">Selected Song</h3>
        <button 
          className="close-button"
          onClick={() => onSongSelect(null)}
          title="Clear selection"
        >
          ✕
        </button>
      </div>
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





        {/* Actions */}
        {user && (
          <div className="song-actions-section">
            <button 
              className={`action-button ${isSongPinned(selectedSong) ? 'secondary' : 'primary'}`}
              onClick={() => {
                // Navigate to vote page with this song pinned
                const url = `/vote?ns=sorter.user&pk=${encodeURIComponent(user.handle)}&left_pin_ns=spotify.track&left_pin_pk=${encodeURIComponent(selectedSong.id)}`;
                window.location.href = url;
              }}
            >
              {isSongPinned(selectedSong) ? 'Stop Comparing' : 'Compare This Song'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default SelectedSongPanel;
