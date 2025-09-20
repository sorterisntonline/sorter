import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AuthAPI } from '../api/auth';

const RankingHistoryPanel = ({ user, songs }) => {
  const [expandedSnapshots, setExpandedSnapshots] = useState(new Set());
  
  // Query for ranking history
  const { data: historyData, isLoading, error } = useQuery({
    queryKey: ['ranking-history', user?.handle],
    queryFn: () => AuthAPI.getRankingHistory('sorter.user', user.handle),
    enabled: !!user,
    refetchOnWindowFocus: false,
  });

  // Create a map of songs by identifier for quick lookup
  const songsMap = React.useMemo(() => {
    if (!songs) return {};
    const map = {};
    songs.forEach(song => {
      const key = `spotify.track:${song.id}`;
      map[key] = song;
    });
    return map;
  }, [songs]);

  const toggleSnapshot = (index) => {
    const newExpanded = new Set(expandedSnapshots);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedSnapshots(newExpanded);
  };

  const getSongInfo = (identifier) => {
    const key = `${identifier.pk_namespace}:${identifier.pk}`;
    return songsMap[key];
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="panel-content">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading ranking history...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="panel-content">
        <div className="error-container">
          <p>Error loading ranking history: {error.message}</p>
        </div>
      </div>
    );
  }

  if (!historyData?.snapshots || historyData.snapshots.length === 0) {
    return (
      <div className="panel-content">
        <div className="empty-state">
          <svg className="empty-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <div className="empty-title">No ranking history</div>
          <p className="empty-description">
            Start voting between songs to see how rankings evolve over time.
          </p>
        </div>
      </div>
    );
  }

  // Show most recent snapshots first
  const sortedSnapshots = [...historyData.snapshots].reverse();

  return (
    <div className="panel-content">
      <div className="panel-header">
        <h3>📊 Ranking History</h3>
        <p className="panel-subtitle">
          {historyData.snapshots.length} snapshot{historyData.snapshots.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="history-snapshots">
        {sortedSnapshots.map((snapshot, index) => {
          const isExpanded = expandedSnapshots.has(index);
          const reverseIndex = sortedSnapshots.length - 1 - index;
          
          return (
            <div key={index} className="snapshot-item">
              <div 
                className="snapshot-header"
                onClick={() => toggleSnapshot(index)}
                style={{ cursor: 'pointer' }}
              >
                <div className="snapshot-info">
                  <span className="snapshot-title">
                    Vote #{snapshot.vote_index}
                  </span>
                  <span className="snapshot-date">
                    {formatDate(snapshot.created_at)}
                  </span>
                </div>
                <div className="snapshot-summary">
                  <span className="ranked-count">
                    {snapshot.sorted.length} ranked
                  </span>
                  {snapshot.unsorted.length > 0 && (
                    <span className="unranked-count">
                      {snapshot.unsorted.length} unranked
                    </span>
                  )}
                  <svg 
                    className={`expand-icon ${isExpanded ? 'expanded' : ''}`}
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {isExpanded && (
                <div className="snapshot-details">
                  {snapshot.sorted.length > 0 && (
                    <div className="ranked-section">
                      <h4>🏆 Ranked Songs</h4>
                      <div className="ranked-list">
                        {snapshot.sorted.map((rankedEntity, rankIndex) => {
                          const song = getSongInfo(rankedEntity.identifier);
                          return (
                            <div key={rankIndex} className="ranked-item">
                              <span className="rank-position">#{rankIndex + 1}</span>
                              {song ? (
                                <div className="song-info">
                                  <div className="song-title">{song.title}</div>
                                  <div className="song-artist">{song.artist}</div>
                                </div>
                              ) : (
                                <div className="song-info">
                                  <div className="song-title">{rankedEntity.identifier.pk}</div>
                                </div>
                              )}
                              <span className="song-score">
                                {rankedEntity.score.toFixed(3)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {snapshot.unsorted.length > 0 && (
                    <div className="unranked-section">
                      <h4>⚡ Unranked Songs</h4>
                      <div className="unranked-list">
                        {snapshot.unsorted.map((identifier, unrankedIndex) => {
                          const song = getSongInfo(identifier);
                          return (
                            <div key={unrankedIndex} className="unranked-item">
                              {song ? (
                                <div className="song-info">
                                  <div className="song-title">{song.title}</div>
                                  <div className="song-artist">{song.artist}</div>
                                </div>
                              ) : (
                                <div className="song-info">
                                  <div className="song-title">{identifier.pk}</div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RankingHistoryPanel;
