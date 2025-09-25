import React from 'react';

// Reusable component to display individual vote items
function VoteItem({ vote, showDelete = false, onDelete, isDeleting, compact = false, getSongById }) {
  // Handle different vote data structures
  const leftEntity = vote.left_entity_pk || vote.left_pk;
  const rightEntity = vote.right_entity_pk || vote.right_pk;
  const leftNamespace = vote.left_entity_ns || vote.left_ns;
  const rightNamespace = vote.right_entity_ns || vote.right_ns;
  
  // For selected song votes, we have opponent_title
  const opponentTitle = vote.opponent_title;
  
  // Format entity display
  const getEntityDisplay = (namespace: string, pk: string, title?: string) => {
    if (title) return title;
    
    // Try to get song title from store if it's a Spotify track
    if (namespace?.includes('spotify.track') && getSongById) {
      const song = getSongById(pk);
      if (song) {
        return song.title;
      }
    }
    
    return `${namespace?.split('.')[1] || 'item'}: ${pk}`;
  };

  const leftDisplay = getEntityDisplay(leftNamespace, leftEntity, vote.left_title);
  const rightDisplay = opponentTitle || getEntityDisplay(rightNamespace, rightEntity, vote.right_title);
  
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

  if (compact) {
    // Compact version for selected song panel
    return (
      <div className="vote-item-compact">
        <span className="vote-comparison">vs {rightDisplay}</span>
        <span 
          className="vote-result-compact" 
          style={{ color: getMagnitudeColor(vote.magnitude) }}
        >
          {vote.magnitude > 0 ? '+' : ''}{vote.magnitude}
        </span>
      </div>
    );
  }

  // Full version for vote history panel
  return (
    <div className="vote-history-item">
      <div className="vote-entities">
        <span className="vote-entity left">{leftDisplay}</span>
        <span className="vote-vs">vs</span>
        <span className="vote-entity right">{rightDisplay}</span>
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
      {showDelete && (
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
      )}
    </div>
  );
}

export default VoteItem;
