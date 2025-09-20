import React, { useState, useEffect } from 'react';
import { useSpotifyPlayer } from '../contexts/SpotifyPlayerContext';

const BottomSpotifyPlayer = () => {
  const {
    isReady,
    isPlaying,
    currentTrack,
    position,
    duration,
    volume,
    queue,
    togglePlay,
    skipNext,
    skipPrevious,
    setVolume,
    seekToPosition,
  } = useSpotifyPlayer();

  const [isExpanded, setIsExpanded] = useState(true);
  const [showQueue, setShowQueue] = useState(true);

  // Debug queue state
  useEffect(() => {
    console.log('Queue state updated:', queue);
  }, [queue]);

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
    <div className={`bottom-spotify-player ${isExpanded ? 'expanded' : 'collapsed'}`}>
      {/* Mini Player Bar */}
      <div className="player-bar">
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

        <div className="basic-controls">
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
      </div>

      {/* Expanded Player */}
      {isExpanded && (
        <div className="expanded-player">
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
      )}

      {/* Queue Panel */}
      {isExpanded && (
        <div className="queue-panel">
          <h4 className="queue-title">Queue</h4>
          {queue && queue.length > 0 ? (
            <div className="queue-list">
              {queue.map((track, index) => (
                <div key={index} className="queue-item">
                  {track.album?.images?.[2] && (
                    <img 
                      src={track.album.images[2].url} 
                      alt={track.name}
                      className="queue-item-image"
                    />
                  )}
                  <div className="queue-item-info">
                    <div className="queue-item-name">{track.name}</div>
                    <div className="queue-item-artist">
                      {track.artists?.map(artist => artist.name).join(', ')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="queue-empty">
              Queue is empty
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BottomSpotifyPlayer;
