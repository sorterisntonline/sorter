import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import chroma from 'chroma-js';
import { AuthAPI } from '../api/auth';
import SelectedSongPanel from '../components/SelectedSongPanel';
import VoteHistoryPanel from '../components/VoteHistoryPanel';
import RankingHistoryGraph from '../components/RankingHistoryGraph';
import ThreePanelLayout from '../components/ThreePanelLayout';
import { useSpotifyPlayer } from '../contexts/SpotifyPlayerContext';
import { useDynamicTheme } from '../contexts/DynamicThemeContext';
import { fetchPairFn, submitVoteFn } from '../fetchers/voteEndpoints';
import { createListAction } from '../fetchers/listActionsEndpoints';
import usePinnedSongStore from '../stores/pinnedSongStore';
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
function VoteItemDisplay({ item, isDisabled, onSkip }) {
  const { playTrack, queueTrack, isReady, accessToken } = useSpotifyPlayer();
  
  if (!item) return null;

  const { title, ns, pk, metadata, profile_picture_url } = item;
  const entityType = ns?.split('.')[1] || 'item';
  const isSpotifyTrack = ns?.includes('spotify.track');
  const isSpotifyAlbum = ns?.includes('spotify.album');

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
          {onSkip && (
            <button 
              className="skip-btn" 
              onClick={onSkip}
              disabled={isDisabled}
              title="Skip this song"
            >
              ⏭️
            </button>
          )}
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

  const [sliderValue, setSliderValue] = useState(0);
  const [luminanceThreshold, setLuminanceThreshold] = useState(0.6);
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { updateThemeFromImage, updateRightThemeFromImage, getScoreColors, getCSSVariables, theme } = useDynamicTheme();
  const { pinnedSong, setPinnedSong, clearPinnedSong, setSongs } = usePinnedSongStore();
  
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
    if (pinnedSong) {
      return ['pair', 'children', 'sorter.user', user.handle, 'spotify.track', pinnedSong.id];
    }
    return ['pair', 'children', 'sorter.user', user.handle];
  };

  // Query for voting pairs (only if user exists)
  const pairQuery = useQuery({
    queryKey: buildVoteQueryKey(),
    queryFn: fetchPairFn,
    enabled: !!user,
    staleTime: pinnedSong ? 0 : 5 * 60 * 1000, // Don't cache when pinned
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
        queryClient.invalidateQueries({ queryKey: ['pair', 'children', 'sorter.user', user.handle] });
        queryClient.invalidateQueries({ queryKey: ['spotify-ranking', user.handle] });
        queryClient.invalidateQueries({ queryKey: ['ranking-history', user.handle] });
        queryClient.invalidateQueries({ queryKey: ['vote-history', user.id] });
      }
      setSliderValue(0);
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
        const key = `${rankedEntity.identifier.ns}:${rankedEntity.identifier.pk}`;
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
        const key = `${identifier.ns}:${identifier.pk}`;
        return songsMap[key];
      })
      .filter(Boolean);

    return { rankedSongs, unrankedSongs, scoreRange };
  }, [songs, ranking]);

  // Populate songs store when songs data changes
  useEffect(() => {
    if (songs) {
      setSongs(songs);
    }
  }, [songs, setSongs]);

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
      
      console.log('🎨 New voting pair - extracting colors from:', imageUrl, 'for song:', leftEntity.title);
      
      if (imageUrl) {
        updateThemeFromImage(imageUrl);
      } else {
        console.log('⚠️ No image URL found for entity:', leftEntity);
      }
    }
  }, [pairQuery.data, updateThemeFromImage]);

  // Update right theme when voting pair changes (use right song for right panel theming)
  useEffect(() => {
    if (pairQuery.data?.right_entity) {
      const rightEntity = pairQuery.data.right_entity;
      // Try to get album art from metadata or profile picture
      let imageUrl = null;
      
      if (rightEntity.metadata?.album?.images?.[0]?.url) {
        imageUrl = rightEntity.metadata.album.images[0].url;
      } else if (rightEntity.metadata?.images?.[0]?.url) {
        imageUrl = rightEntity.metadata.images[0].url;
      } else if (rightEntity.profile_picture_url) {
        imageUrl = rightEntity.profile_picture_url;
      }
      
      console.log('🎨 New voting pair - extracting colors from RIGHT song:', imageUrl, 'for song:', rightEntity.title);
      
      if (imageUrl) {
        updateRightThemeFromImage(imageUrl);
      } else {
        console.log('⚠️ No image URL found for RIGHT entity:', rightEntity);
      }
    }
  }, [pairQuery.data, updateRightThemeFromImage]);

  const handleSliderChange = (e) => {
    setSliderValue(parseInt(e.target.value));
  };

  const handleVoteSubmit = async () => {
    if (!pairQuery.data?.left_entity || !pairQuery.data?.right_entity) return;
    
    const { left_entity, right_entity } = pairQuery.data;
    
    try {
      await voteMutation.mutateAsync({
        left_ns: left_entity.ns,
        left_pk: left_entity.pk,
        right_ns: right_entity.ns,
        right_pk: right_entity.pk,
        attribute_id: 1,
        magnitude: sliderValue
      });
    } catch (error) {
      console.error('Vote submission failed:', error);
    }
  };

  const handleSkipLeft = async () => {
    // Get a new left item by pinning the right item temporarily for the API call
    const rightEntity = pairQuery.data?.right_entity;
    const leftEntity = pairQuery.data?.left_entity;

    if (!rightEntity || !leftEntity || !user) return;

    try {
      // First, exclude the left entity using list-actions
      await createListAction({
        list_ns: 'sorter.user',
        list_pk: user.handle,
        entity_ns: leftEntity.ns,
        entity_pk: leftEntity.pk,
        action: 'deny',
      });
      console.log('Excluded left entity:', leftEntity.title);

      // Make API call to get a new pair with the right item pinned and random left selection
      const response = await fetch(`/api/pair?ns=sorter.user&pk=${user.handle}&right_pin_ns=${rightEntity.ns}&right_pin_pk=${rightEntity.pk}&random=true`, {
        credentials: 'include'
      });

      if (!response.ok) throw new Error('Failed to fetch new pair');
      const newPair = await response.json();

      // Update the query data directly without triggering a full refetch
      const queryKey = buildVoteQueryKey();
      console.log('Updating query cache with key:', queryKey);
      console.log('New left entity:', newPair.left_entity.title);
      console.log('Keeping right entity:', rightEntity.title);

      queryClient.setQueryData(queryKey, {
        left_entity: newPair.left_entity,
        right_entity: rightEntity // Keep the current right entity
      });

      // Invalidate queries to update the ranking and remove blocked song
      queryClient.invalidateQueries({ queryKey: ['spotify-ranking', user.handle] });
      queryClient.invalidateQueries({ queryKey: ['listState'] });

    } catch (error) {
      console.error('Failed to skip left song:', error);
    }

    setSliderValue(0);
  };

  const handleSkipRight = async () => {
    // Get a new right item by pinning the left item temporarily for the API call
    const rightEntity = pairQuery.data?.right_entity;
    const leftEntity = pairQuery.data?.left_entity;

    if (!rightEntity || !leftEntity || !user) return;

    try {
      // First, exclude the right entity using list-actions
      await createListAction({
        list_ns: 'sorter.user',
        list_pk: user.handle,
        entity_ns: rightEntity.ns,
        entity_pk: rightEntity.pk,
        action: 'deny',
      });
      console.log('Excluded right entity:', rightEntity.title);

      // Make API call to get a new pair with the left item pinned and random right selection
      const response = await fetch(`/api/pair?ns=sorter.user&pk=${user.handle}&left_pin_ns=${leftEntity.ns}&left_pin_pk=${leftEntity.pk}&random=true`, {
        credentials: 'include'
      });

      if (!response.ok) throw new Error('Failed to fetch new pair');
      const newPair = await response.json();

      // Update the query data directly without triggering a full refetch
      const queryKey = buildVoteQueryKey();
      console.log('Updating query cache with key:', queryKey);
      console.log('Keeping left entity:', leftEntity.title);
      console.log('New right entity:', newPair.right_entity.title);

      queryClient.setQueryData(queryKey, {
        left_entity: leftEntity, // Keep the current left entity
        right_entity: newPair.right_entity
      });

      // Invalidate queries to update the ranking and remove blocked song
      queryClient.invalidateQueries({ queryKey: ['spotify-ranking', user.handle] });
      queryClient.invalidateQueries({ queryKey: ['listState'] });

    } catch (error) {
      console.error('Failed to skip right song:', error);
    }

    setSliderValue(0);
  };

  const handleImportSongs = async () => {
    setIsImporting(true);
    setImportMessage('');
    
    try {
      const result = await AuthAPI.importRecentSongs();
      setImportMessage(result.message);
      
      // Refresh songs data and ranking
      queryClient.invalidateQueries({ queryKey: ['spotify-songs'] });
      queryClient.invalidateQueries({ queryKey: ['spotify-ranking', user?.handle] });
    } catch (error) {
      setImportMessage(`Error: ${error.message}`);
    } finally {
      setIsImporting(false);
    }
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

  // Left Panel - Songs List
  const leftPanel = (
    <>
      {/* Header Panel */}
      <div className="songs-header">
        <span className="songs-title">sorter</span>
        <div className="header-controls">
          <Link 
            to="/spotify/pool" 
            className="nav-link pool-link"
            title="Manage song pool"
          >
            Pool
          </Link>
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
                queryClient.invalidateQueries({ queryKey: ['spotify-songs'] });
                queryClient.invalidateQueries({ queryKey: ['spotify-ranking', user?.handle] });
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
      </div>
      
      {!rankingLoading && ranking && rankedSongs.length > 0 && (
        <div className="songs-container" style={{ marginBottom: '16px' }}>
          <div>
            {rankedSongs.map((song, index) => {
              const { backgroundColor, color } = getScoreColors(song.score);
              return (
                <div 
                  key={song.id} 
                  className={`song-item ${selectedSong?.id === song.id ? 'selected' : ''}`}
                  onClick={() => setSelectedSong(selectedSong?.id === song.id ? null : song)}
                  style={{ 
                    backgroundColor, 
                    color,
                  } as any}
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
                onClick={() => setSelectedSong(selectedSong?.id === song.id ? null : song)}
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
    </>
  );

  // Center Panel - Voting Interface
  const centerPanel = (
    <>
      {pinnedSong && (
        <div className="pinned-song-indicator">
          <div className="pinned-song-info">
            <span className="pin-icon">📌</span>
            <span>Comparing: <strong>{pinnedSong.title}</strong> by {pinnedSong.artist}</span>
            <button 
              className="unpin-button"
              onClick={clearPinnedSong}
              title="Stop comparing"
            >
              ✕
            </button>
          </div>
        </div>
      )}
      
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
                width: '100%',
            }}>
              <div className="vote-items-container">
                <VoteItemDisplay 
                  item={pairQuery.data.left_entity} 
                  isDisabled={voteMutation.isPending || pairQuery.isPending}
                  onSkip={handleSkipLeft}
                />
                <VoteItemDisplay 
                  item={pairQuery.data.right_entity} 
                  isDisabled={voteMutation.isPending || pairQuery.isPending}
                  onSkip={handleSkipRight}
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
                    background: `linear-gradient(to right, var(--theme-accent) 0%, var(--theme-accent-light) 50%, var(--theme-accent) 100%)`
                  } as any}
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
    </>
  );

  // Right Panel - Song Details and Vote History
  const rightPanel = (
    <>
      {selectedSong && (
        <SelectedSongPanel selectedSong={selectedSong} user={user} onSongSelect={setSelectedSong} />
      )}
      <VoteHistoryPanel user={user} selectedSong={selectedSong} />
    </>
  );

  return (
    <div className="spotify-page" style={getCSSVariables()}>
      <ThreePanelLayout
        leftPanel={leftPanel}
        centerPanel={centerPanel}
        rightPanel={rightPanel}
        className="spotify-layout"
        style={{
          background: `linear-gradient(145deg, var(--theme-primary) 0%, var(--theme-secondary) 50%, var(--theme-primary) 100%)`,
          minHeight: '100vh'
        }}
      />
    </div>
  );
}

export default SpotifySongsPage;
