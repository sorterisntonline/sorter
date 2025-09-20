import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import chroma from 'chroma-js';
import { AuthAPI } from '../api/auth';
import SelectedSongPanel from '../components/SelectedSongPanel';
import VoteHistoryPanel from '../components/VoteHistoryPanel';
import RankingHistoryGraph from '../components/RankingHistoryGraph';
import { useSpotifyPlayer } from '../contexts/SpotifyPlayerContext';
import { useDynamicTheme } from '../contexts/DynamicThemeContext';
import { fetchPairFn, submitVoteFn } from '../fetchers/voteEndpoints';
import '../styles/spotify.css';
import '../styles/vote.css';
import '../styles/ranking-history-graph.css';
import '../styles/dynamic-theme.css';

// Helper function to get the largest image URL
const getLargestImageUrl = (images) => {
  if (!images || images.length === 0) return null;
  return images[0].url;
};

// Vote Item Display Component
function VoteItemDisplay({ item, isDisabled }) {
  const { playTrack, queueTrack, isReady, accessToken } = useSpotifyPlayer();
  
  if (!item) return null;

  const { title, pk_namespace, pk, metadata, profile_picture_url } = item;
  const entityType = pk_namespace?.split('.')[1] || 'item';
  const isSpotifyTrack = pk_namespace?.includes('spotify.track');
  const isSpotifyAlbum = pk_namespace?.includes('spotify.album');

  const handlePlay = () => {
    if (isSpotifyTrack || isSpotifyAlbum) {
      const uri = `spotify:${isSpotifyTrack ? 'track' : 'album'}:${pk}`;
      playTrack(uri);
    }
  };

  const handleQueue = () => {
    if (isSpotifyTrack || isSpotifyAlbum) {
      const uri = `spotify:${isSpotifyTrack ? 'track' : 'album'}:${pk}`;
      queueTrack(uri);
    }
  };

  // Extract album art from metadata for Spotify tracks
  if (isSpotifyTrack || isSpotifyAlbum) {
    const artist = metadata?.artists?.[0]?.name || metadata?.artist || 'Unknown Artist';
    const albumArt = metadata?.album?.images?.[0]?.url || metadata?.images?.[0]?.url || profile_picture_url;
    
    return (
      <div className={`vote-item ${isDisabled ? 'disabled' : ''}`}>
        <div className="track-info">
          {albumArt && <img src={albumArt} alt={title} className="vote-item-image" />}
          <div className="track-details">
            <h4 className="vote-item-title" title={title}>{title || 'Unknown Title'}</h4>
            <p className="vote-item-artist">{artist}</p>
            <p className="vote-item-type">[{entityType}]</p>
          </div>
        </div>
        <div className="vote-item-controls">
          <button 
            className="play-btn" 
            onClick={handlePlay}
            disabled={!isReady || !accessToken || isDisabled}
            title="Play"
          >
            ▶️
          </button>
          <button 
            className="queue-btn" 
            onClick={handleQueue}
            disabled={!isReady || !accessToken || isDisabled}
            title="Add to queue"
          >
            ➕
          </button>
        </div>
      </div>
    );
  }

  // Fallback for non-Spotify items
  const imageUrl = profile_picture_url || getLargestImageUrl(metadata?.images);
  return (
    <div className={`vote-item ${isDisabled ? 'disabled' : ''}`}>
      {imageUrl ? (
        <img src={imageUrl} alt={`Cover for ${title}`} className="vote-item-image" />
      ) : (
        <div className="vote-item-placeholder">?</div>
      )}
      <h4 className="vote-item-title" title={title}>{title || 'Unknown Title'}</h4>
      <p className="vote-item-type">[{entityType}]</p>
    </div>
  );
}

function SpotifySongsPage() {
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedSong, setSelectedSong] = useState(null);
  const [rightPanelTab, setRightPanelTab] = useState('selected'); // 'selected', 'history', or 'ranking-history'
  const [sliderValue, setSliderValue] = useState(0);
  const [luminanceThreshold, setLuminanceThreshold] = useState(0.6);
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { updateThemeFromImage, getScoreColors, getCSSVariables, theme } = useDynamicTheme();
  
  // Query for current user info
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: AuthAPI.getMe,
    refetchOnWindowFocus: false,
  });

  // Query for user's recent songs (relationships where parent is current user and child is spotify.track)
  const { data: songs, isLoading, error } = useQuery({
    queryKey: ['spotify-songs'],
    queryFn: AuthAPI.getSpotifySongs,
    refetchOnWindowFocus: false,
  });

  // Query for ranking data
  const { data: ranking, isLoading: rankingLoading } = useQuery({
    queryKey: ['spotify-ranking', user?.handle],
    queryFn: () => AuthAPI.getSpotifyRanking('sorter.user', user.handle),
    enabled: !!user && !!songs,
    refetchOnWindowFocus: false,
  });

  // Build query key for voting
  const buildVoteQueryKey = () => {
    if (!user) return null;
    return ['pair', 'children', 'sorter.user', user.handle];
  };

  // Query for voting pairs (only if user exists)
  const pairQuery = useQuery({
    queryKey: buildVoteQueryKey(),
    queryFn: fetchPairFn,
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // Vote mutation
  const voteMutation = useMutation({
    mutationFn: submitVoteFn,
    onSuccess: (data) => {
      console.log("Vote submission successful:", data);
      // Invalidate queries to refresh data
      if (user) {
        queryClient.invalidateQueries(['pair', 'children', 'sorter.user', user.handle]);
        queryClient.invalidateQueries(['spotify-ranking', user.handle]);
        queryClient.invalidateQueries(['ranking-history', user.handle]);
        queryClient.invalidateQueries(['vote-history', user.id]);
      }
      setSliderValue(0);
      // Switch to ranking history tab to show the new vote impact
      setRightPanelTab('ranking-history');
    },
    onError: (error) => {
      console.error("Vote submission failed:", error);
    },
  });

  // Process ranking data to organize songs
  const { rankedSongs, unrankedSongs, scoreRange } = React.useMemo(() => {
    if (!songs || !ranking) {
      return { rankedSongs: [], unrankedSongs: songs || [], scoreRange: { min: 0, max: 1 } };
    }

    // Create a map of songs by their identifier
    const songsMap = {};
    songs.forEach(song => {
      const key = `spotify.track:${song.id}`;
      songsMap[key] = song;
    });

    // Process ranked songs
    const rankedSongs = ranking.sorted
      .map(rankedEntity => {
        const key = `${rankedEntity.identifier.pk_namespace}:${rankedEntity.identifier.pk}`;
        const song = songsMap[key];
        if (song) {
          return { ...song, score: rankedEntity.score };
        }
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score); // Sort by score descending

    // Calculate score range for dynamic theming
    let scoreRange = { min: 0, max: 1 };
    if (rankedSongs.length > 0) {
      const scores = rankedSongs.map(song => song.score);
      scoreRange = {
        min: Math.min(...scores),
        max: Math.max(...scores)
      };
    }

    // Process unranked songs
    const unrankedSongs = ranking.unsorted
      .map(identifier => {
        const key = `${identifier.pk_namespace}:${identifier.pk}`;
        return songsMap[key];
      })
      .filter(Boolean);

    return { rankedSongs, unrankedSongs, scoreRange };
  }, [songs, ranking]);

  // Update theme when voting pair changes (use left song for theming)
  useEffect(() => {
    if (pairQuery.data?.left_entity) {
      const leftEntity = pairQuery.data.left_entity;
      // Try to get album art from metadata or profile picture
      let imageUrl = null;
      
      if (leftEntity.metadata?.album?.images?.[0]?.url) {
        imageUrl = leftEntity.metadata.album.images[0].url;
      } else if (leftEntity.metadata?.images?.[0]?.url) {
        imageUrl = leftEntity.metadata.images[0].url;
      } else if (leftEntity.profile_picture_url) {
        imageUrl = leftEntity.profile_picture_url;
      }
      
      if (imageUrl) {
        updateThemeFromImage(imageUrl);
      }
    }
  }, [pairQuery.data, updateThemeFromImage]);

  const handleImportSongs = async () => {
    setIsImporting(true);
    setImportMessage('');
    
    try {
      const result = await AuthAPI.importRecentSongs();
      setImportMessage(result.message);
      
      // Refresh songs data and ranking
      queryClient.invalidateQueries(['spotify-songs']);
      queryClient.invalidateQueries(['spotify-ranking', user?.handle]);
    } catch (error) {
      setImportMessage(`Error: ${error.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  // Voting event handlers
  const handleSliderChange = (event) => {
    setSliderValue(parseInt(event.target.value, 10));
  };

  const handleVoteSubmit = () => {
    const leftItem = pairQuery.data?.left_entity;
    const rightItem = pairQuery.data?.right_entity;

    if (!leftItem || !rightItem || voteMutation.isPending || pairQuery.isPending) return;

    const voteData = {
      left_ns: leftItem.pk_namespace,
      left_pk: leftItem.pk,
      right_ns: rightItem.pk_namespace,
      right_pk: rightItem.pk,
      magnitude: sliderValue,
      attribute_id: 1,
    };

    voteMutation.mutate(voteData);
  };

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <p>Loading your songs...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error">
        Error loading songs: {error.message}
      </div>
    );
  }

  return (
    <div className="spotify-page" style={getCSSVariables()}>
      <div className="combined-layout" style={{
        background: `linear-gradient(145deg, var(--theme-primary) 0%, var(--theme-secondary) 50%, var(--theme-primary) 100%)`,
        minHeight: '100vh'
      }}>
        {/* Left Panel - Songs List */}
        <div className="songs-panel">
          {/* Header Panel */}
          <div className="songs-header">
            <span className="songs-title">sorter</span>
            <button 
              className={`refresh-button ${isRefreshing ? 'refreshing' : ''}`}
              onClick={async () => {
                setIsRefreshing(true);
                try {
                  const response = await fetch('/api/auth/import-recent-songs', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    credentials: 'include'
                  });
                  
                  if (response.ok) {
                    const result = await response.json();
                    console.log('Imported songs:', result);
                    // Invalidate queries after successful import
                    queryClient.invalidateQueries(['spotify-songs']);
                    queryClient.invalidateQueries(['spotify-ranking', user?.handle]);
                  }
                } catch (error) {
                  console.error('Failed to import songs:', error);
                } finally {
                  setIsRefreshing(false);
                }
              }}
              disabled={isLoading || rankingLoading || isRefreshing}
              title="Import fresh songs from Spotify"
            >
              {isRefreshing ? '⟳' : '↻'}
            </button>
          </div>
          
          {!rankingLoading && ranking && rankedSongs.length > 0 && (
            <div className="songs-container" style={{ marginBottom: '16px' }}>
              <div>
                {rankedSongs.map((song, index) => {
                  const { backgroundColor, textColor } = getScoreColors(song.score, scoreRange);
                  return (
                    <div 
                      key={song.id} 
                      className={`song-item ${selectedSong?.id === song.id ? 'selected' : ''}`}
                      onClick={() => setSelectedSong(song)}
                      style={{ 
                        backgroundColor, 
                        color: textColor,
                        '--text-color': textColor 
                      }}
                    >
                      <span className="rank-number">{index + 1}</span>
                      {song.album_art && (
                        <img 
                          src={song.album_art} 
                          alt={`${song.title} album art`}
                          className="album-art"
                        />
                      )}
                      <div className="song-info">
                        <div className="song-title">{song.title}</div>
                        <div className="song-artist">{song.artist}</div>
                        {song.album && (
                          <div className="song-album">{song.album}</div>
                        )}
                      </div>
                      <div className="score-display">
                        {song.score.toFixed(4)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!rankingLoading && ranking && unrankedSongs.length > 0 && (
            <div className="songs-container">
              <div>
                {unrankedSongs.map((song) => (
                  <div 
                    key={song.id} 
                    className={`song-item ${selectedSong?.id === song.id ? 'selected' : ''}`}
                    onClick={() => setSelectedSong(song)}
                  >
                    {song.album_art && (
                      <img 
                        src={song.album_art} 
                        alt={`${song.title} album art`}
                        className="album-art"
                      />
                    )}
                    <div className="song-info">
                      <div className="song-title">{song.title}</div>
                      <div className="song-artist">{song.artist}</div>
                      {song.album && (
                        <div className="song-album">{song.album}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {songs && songs.length === 0 && (
            <div className="songs-container">
              <div className="empty-state">
                <svg className="empty-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
                <div className="empty-title">No songs imported yet</div>
                <p className="empty-description">
                  Import your recently played Spotify tracks to start sorting them.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Center Panel - Voting Interface */}
        <div className="vote-panel">
          {user && songs && songs.length > 0 && (
            <div className="vote-section">
              
              {pairQuery.isPending && (
                <div className="loading-container">
                  <div className="loading-spinner"></div>
                  <p>Loading pair...</p>
                </div>
              )}

              {pairQuery.error && (
                <div className="error-container">
                  <p>Error loading voting pair: {pairQuery.error?.message}</p>
                </div>
              )}

              {pairQuery.data && pairQuery.data.left_entity && pairQuery.data.right_entity && (
                <div className="vote-container" style={{
                  background: theme.extractedColors?.css?.radialGradient || 'var(--theme-radial-gradient)',
                  borderRadius: '16px',
                  padding: '24px',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid var(--theme-accent)',
                  boxShadow: `0 8px 32px ${theme.colors?.accentDark || 'var(--theme-accent)'}20`
                }}>
                  <div className="vote-items-container">
                    <VoteItemDisplay 
                      item={pairQuery.data.left_entity} 
                      isDisabled={voteMutation.isPending || pairQuery.isPending}
                    />
                    <VoteItemDisplay 
                      item={pairQuery.data.right_entity} 
                      isDisabled={voteMutation.isPending || pairQuery.isPending}
                    />
                  </div>

                  <div className="slider-container">
                    <div className="slider-labels">
                      <span>Strongly Left</span>
                      <span>Neutral</span>
                      <span>Strongly Right</span>
                    </div>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      step="1"
                      value={sliderValue}
                      onChange={handleSliderChange}
                      className="vote-slider"
                      disabled={voteMutation.isPending || pairQuery.isPending}
                      style={{
                        background: `linear-gradient(to right, var(--theme-accent) 0%, var(--theme-accent-light) 50%, var(--theme-accent) 100%)`,
                        '--slider-thumb-color': theme.colors?.vibrant || 'var(--theme-accent)'
                      }}
                    />
                  </div>

                  <button
                    onClick={handleVoteSubmit}
                    disabled={voteMutation.isPending || pairQuery.isPending}
                    className="submit-button"
                  >
                    {voteMutation.isPending ? 'Submitting...' : 'Submit Vote'}
                  </button>
                </div>
              )}

              {pairQuery.isSuccess && !pairQuery.data?.left_entity && !pairQuery.data?.right_entity && (
                <div style={{ textAlign: 'center', color: '#6b7280', padding: '40px 0' }}>
                  No pairs available for voting at the moment.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Panel - Selected Song / Vote History */}
        <div className="spotify-right-panel">
          <div className="panel-tabs">
            <button 
              className={`panel-tab ${rightPanelTab === 'selected' ? 'active' : ''}`}
              onClick={() => setRightPanelTab('selected')}
            >
              Selected Song
            </button>
            <button 
              className={`panel-tab ${rightPanelTab === 'history' ? 'active' : ''}`}
              onClick={() => setRightPanelTab('history')}
            >
              Vote History
            </button>

          </div>

          <div className="panel-content-wrapper">
            {rightPanelTab === 'selected' ? (
              <SelectedSongPanel selectedSong={selectedSong} user={user} onSongSelect={setSelectedSong} />
            ) : (
              <VoteHistoryPanel user={user} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SpotifySongsPage;
