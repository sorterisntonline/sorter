import React from 'react';
import { useDynamicTheme } from '../contexts/DynamicThemeContext';

// Reusable component to display individual vote items
function VoteItem({ vote, showDelete = false, onDelete, isDeleting, compact = false, getSongById }) {
  const { getRightScoreColors } = useDynamicTheme();
  
  // Handle different vote data structures
  const leftEntity = vote.left_entity_pk || vote.left_pk;
  const rightEntity = vote.right_entity_pk || vote.right_pk;
  const leftNamespace = vote.left_entity_ns || vote.left_ns;
  const rightNamespace = vote.right_entity_ns || vote.right_ns;
  
  // For selected song votes, we have opponent_title
  const opponentTitle = vote.opponent_title;
  
  // Get song data from store
  const getSongData = (namespace: string, pk: string, title?: string) => {
    if (title) return { title, artist: null, image: null };
    
    // Try to get song data from store if it's a Spotify track
    if (namespace?.includes('spotify.track') && getSongById) {
      const song = getSongById(pk);
      if (song) {
        console.log('VoteItem: Found song in store:', song.title, 'album_art:', song.album_art);
        return {
          title: song.title,
          artist: song.artist,
          image: song.album_art
        };
      } else {
        console.log('VoteItem: Song not found in store for ID:', pk);
      }
    }
    
    return {
      title: `${namespace?.split('.')[1] || 'item'}: ${pk}`,
      artist: null,
      image: null
    };
  };

  const leftSong = getSongData(leftNamespace, leftEntity, vote.left_title);
  const rightSong = opponentTitle 
    ? { title: opponentTitle, artist: null, image: null }
    : getSongData(rightNamespace, rightEntity, vote.right_title);
  
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
    // Use right theme colors instead of hardcoded colors
    const normalizedMagnitude = (Math.abs(magnitude) + 50) / 100; // 0 to 1 scale
    const rightColors = getRightScoreColors(normalizedMagnitude, { min: 0, max: 1 });
    return rightColors.backgroundColor;
  };

  // Visual magnitude slider component
  const MagnitudeSlider = ({ magnitude }) => {
    const normalizedPosition = ((magnitude + 50) / 100) * 100; // Convert -50 to 50 range to 0-100%
    const color = getMagnitudeColor(magnitude);
    
    return (
      <div className="magnitude-slider-container">
        <div className="magnitude-slider-track">
          <div 
            className="magnitude-slider-fill"
            style={{
              width: `${normalizedPosition}%`,
              backgroundColor: color,
              background: `var(--right-theme-gradient)`
            }}
          />
          <div 
            className="magnitude-slider-thumb"
            style={{
              left: `${normalizedPosition}%`,
              backgroundColor: `var(--right-theme-accent)`,
              borderColor: `var(--right-theme-accent-dark)`
            }}
          />
        </div>
        <div className="magnitude-value" style={{ color: `var(--right-theme-accent)` }}>
          {magnitude > 0 ? '+' : ''}{magnitude}
        </div>
      </div>
    );
  };

  if (compact) {
    // Compact version for selected song panel
    return (
      <div className="vote-item-compact">
        <div className="compact-song-info">
          {rightSong.image && (
            <img src={rightSong.image} alt="" className="compact-album-art" />
          )}
          <div className="compact-text">
            <span className="vote-comparison">vs {rightSong.title}</span>
            {rightSong.artist && <span className="compact-artist">{rightSong.artist}</span>}
          </div>
        </div>
        <MagnitudeSlider magnitude={vote.magnitude} />
      </div>
    );
  }

  // Full version for vote history panel
  return (
    <div className="vote-history-item-modern">
      <div className="vote-matchup">
        <div className="vote-song">
          {leftSong.image && (
            <img src={leftSong.image} alt="" className="vote-album-art" />
          )}
          <div className="vote-song-info">
            <div className="vote-song-title">{leftSong.title}</div>
            {leftSong.artist && <div className="vote-song-artist">{leftSong.artist}</div>}
          </div>
        </div>
        
        <div className="vote-vs-section">
          <span className="vote-vs-text">VS</span>
          <div className="vote-date-modern">{formatDate(vote.created_at)}</div>
        </div>
        
        <div className="vote-song">
          {rightSong.image && (
            <img src={rightSong.image} alt="" className="vote-album-art" />
          )}
          <div className="vote-song-info">
            <div className="vote-song-title">{rightSong.title}</div>
            {rightSong.artist && <div className="vote-song-artist">{rightSong.artist}</div>}
          </div>
        </div>
      </div>
      
      <div className="vote-result-section">
        <div className="vote-magnitude-label">{getMagnitudeLabel(vote.magnitude)}</div>
        <MagnitudeSlider magnitude={vote.magnitude} />
      </div>
      
      {showDelete && (
        <button
          className="delete-vote-btn-modern"
          onClick={() => onDelete(vote)}
          disabled={isDeleting}
          title="Delete this vote"
        >
          <svg className="delete-icon" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9zM4 5a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM6 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default VoteItem;
