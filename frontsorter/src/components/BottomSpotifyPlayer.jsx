import React, { useEffect } from 'react';
import { useSpotifyPlayer } from '../contexts/SpotifyPlayerContext';

const BottomSpotifyPlayer = () => {
  const {
    isReady,
    isPlaying,
    currentTrack,
    position,
    duration,
    volume,
    togglePlay,
    skipNext,
    skipPrevious,
    setVolume,
    seekToPosition,
  } = useSpotifyPlayer();

  // Format time helper
  const formatTime = (ms) => {
    if (!ms) return '0:00';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Handle seek on progress bar
  const handleSeek = (e) => {
    if (!duration) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newPosition = percent * duration;
    seekToPosition(newPosition);
  };

  if (!isReady || !currentTrack) {
    return null; // Don't show player if no track or not ready
  }

  return (
    <div className="bottom-spotify-player">
      <div className="player-content">
        {/* Track Info */}
        <div className="current-track-info">
          {currentTrack.album?.images?.[2] && (
            <img 
              src={currentTrack.album.images[2].url} 
              alt={currentTrack.name}
              className="track-thumbnail"
            />
          )}
          <div className="track-text">
            <div className="track-name">{currentTrack.name}</div>
            <div className="track-artist">
              {currentTrack.artists?.map(artist => artist.name).join(', ')}
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="progress-section">
          <span className="time-current">{formatTime(position)}</span>
          <div className="progress-bar" onClick={handleSeek}>
            <div 
              className="progress-fill" 
              style={{ width: duration ? `${(position / duration) * 100}%` : '0%' }}
            />
          </div>
          <span className="time-total">{formatTime(duration)}</span>
        </div>

        {/* Controls */}
        <div className="player-controls">
          <button 
            className="control-btn"
            onClick={() => skipPrevious()}
            disabled={!isReady}
          >
            ⏮️
          </button>
          <button 
            className="play-pause-btn"
            onClick={() => togglePlay()}
            disabled={!isReady}
          >
            {isPlaying ? '⏸️' : '▶️'}
          </button>
          <button 
            className="control-btn"
            onClick={() => skipNext()}
            disabled={!isReady}
          >
            ⏭️
          </button>
        </div>

        {/* Volume Control */}
        <div className="volume-control">
          <span className="volume-icon">🔊</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="volume-slider"
          />
        </div>
      </div>
    </div>
  );
};

export default BottomSpotifyPlayer;
