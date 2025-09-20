import React, { useState, useEffect } from 'react';
import { useSpotifyPlayer } from '../contexts/SpotifyPlayerContext';

const SpotifyPlayer = ({ trackId, trackUri, title, artist, albumArt, compact = false }) => {
  const {
    isReady,
    isPlaying,
    currentTrack,
    position,
    duration,
    volume,
    accessToken,
    playTrack,
    queueTrack,
    togglePlay,
    skipNext,
    skipPrevious,
    setVolume,
    seekToPosition,
  } = useSpotifyPlayer();

  const [isCurrentTrack, setIsCurrentTrack] = useState(false);

  // Check if this is the currently playing track
  useEffect(() => {
    setIsCurrentTrack(currentTrack?.id === trackId);
  }, [currentTrack, trackId]);

  // Format time
  const formatTime = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handlePlayClick = () => {
    if (isCurrentTrack && isPlaying) {
      togglePlay();
    } else {
      const uri = trackUri || `spotify:track:${trackId}`;
      playTrack(uri);
    }
  };

  const handleQueueClick = () => {
    const uri = trackUri || `spotify:track:${trackId}`;
    queueTrack(uri);
  };

  const handleSeek = (e) => {
    if (!isCurrentTrack || !duration) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newPosition = percent * duration;
    seekToPosition(newPosition);
  };

  if (compact) {
    // Compact version for voting comparison
    return (
      <div className="spotify-player-compact">
        <div className="track-info">
          {albumArt && <img src={albumArt} alt={title} className="album-art-small" />}
          <div className="track-details">
            <div className="track-title">{title}</div>
            <div className="track-artist">{artist}</div>
          </div>
        </div>
        <div className="player-controls-compact">
          <button 
            className="play-btn-compact" 
            onClick={handlePlayClick}
            disabled={!isReady || !accessToken}
            title={isCurrentTrack && isPlaying ? 'Pause' : 'Play'}
          >
            {isCurrentTrack && isPlaying ? '⏸️' : '▶️'}
          </button>
          <button 
            className="queue-btn-compact" 
            onClick={handleQueueClick}
            disabled={!isReady || !accessToken}
            title="Add to queue"
          >
            ➕
          </button>
        </div>
      </div>
    );
  }

  // Full player version for selected song panel
  return (
    <div className="spotify-player-full">
      <div className="track-header">
        {albumArt && <img src={albumArt} alt={title} className="album-art-large" />}
        <div className="track-info-full">
          <h3 className="track-title-full">{title}</h3>
          <h4 className="track-artist-full">{artist}</h4>
        </div>
      </div>

      {/* Progress bar */}
      {isCurrentTrack && (
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
      )}

      {/* Controls */}
      <div className="player-controls-full">
        <button 
          className="control-btn" 
          onClick={skipPrevious}
          disabled={!isReady}
          title="Previous"
        >
          ⏮️
        </button>
        <button 
          className="play-btn-main" 
          onClick={handlePlayClick}
          disabled={!isReady}
          title={isCurrentTrack && isPlaying ? 'Pause' : 'Play'}
        >
          {isCurrentTrack && isPlaying ? '⏸️' : '▶️'}
        </button>
        <button 
          className="control-btn" 
          onClick={skipNext}
          disabled={!isReady}
          title="Next"
        >
          ⏭️
        </button>
      </div>

      {/* Volume control */}
      <div className="volume-section">
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

      {/* Queue button */}
      <div className="queue-section">
        <button 
          className="queue-btn-full" 
          onClick={handleQueueClick}
          disabled={!isReady}
          title="Add to queue"
        >
          ➕ Add to Queue
        </button>
      </div>

      {/* Player status */}
      {!isReady && (
        <div className="player-status">
          <span>🔄 Connecting to Spotify...</span>
        </div>
      )}
    </div>
  );
};

export default SpotifyPlayer;
