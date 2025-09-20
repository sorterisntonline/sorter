import React, { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthAPI } from '../api/auth';
import SelectedSongPanel from '../components/SelectedSongPanel';
import VoteHistoryPanel from '../components/VoteHistoryPanel';
import { fetchPairFn, submitVoteFn } from '../fetchers/voteEndpoints';
import '../styles/spotify.css';
import '../styles/vote.css';

// Helper function to get the smallest image URL
const getSmallestImageUrl = (images) => {
  if (!images || images.length === 0) return null;
  return images[images.length - 1].url;
};

// Vote Item Display Component
function VoteItemDisplay({ item, isDisabled }) {
  if (!item) return null;

  const { title, pk_namespace, pk, metadata, profile_picture_url } = item;
  const entityType = pk_namespace?.split('.')[1] || 'item';
  const isSpotifyTrack = pk_namespace?.includes('spotify.track');
  const isSpotifyAlbum = pk_namespace?.includes('spotify.album');

  // Conditionally render Spotify Embed
  if (isSpotifyTrack || isSpotifyAlbum) {
    const embedType = isSpotifyTrack ? 'track' : 'album';
    return (
      <div className={`vote-item ${isDisabled ? 'disabled' : ''}`}>
        <iframe
          className="spotify-embed"
          style={{ borderRadius: '12px' }}
          src={`https://open.spotify.com/embed/${embedType}/${pk}`}
          width="280"
          height="360"
          frameBorder="0"
          allowFullScreen=""
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          loading="lazy"
          title={`${embedType}: ${title || 'Spotify Content'}`}
        ></iframe>
        <h4 className="vote-item-title" title={title}>{title || 'Unknown Title'}</h4>
        <p className="vote-item-type">[{entityType}]</p>
      </div>
    );
  }

  // Fallback for non-Spotify items
  const imageUrl = profile_picture_url || getSmallestImageUrl(metadata?.images);
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
  const [selectedSong, setSelectedSong] = useState(null);
  const [rightPanelTab, setRightPanelTab] = useState('selected'); // 'selected' or 'history'
  const [sliderValue, setSliderValue] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  
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
        queryClient.invalidateQueries(['vote-history', user.id]);
      }
      setSliderValue(0);
      // Switch to history tab to show the new vote
      setRightPanelTab('history');
    },
    onError: (error) => {
      console.error("Vote submission failed:", error);
    },
  });

  // Process ranking data to organize songs
  const { rankedSongs, unrankedSongs } = React.useMemo(() => {
    if (!songs || !ranking) {
      return { rankedSongs: [], unrankedSongs: songs || [] };
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

    // Process unranked songs
    const unrankedSongs = ranking.unsorted
      .map(identifier => {
        const key = `${identifier.pk_namespace}:${identifier.pk}`;
        return songsMap[key];
      })
      .filter(Boolean);

    return { rankedSongs, unrankedSongs };
  }, [songs, ranking]);

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
    <div className="spotify-page">
      <div className="spotify-header">
        <div>
          <h1 className="spotify-title">
            <svg className="spotify-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.84-.179-.84-.6 0-.359.24-.66.54-.78 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.242 1.021zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z"/>
            </svg>
            Vote & Rank Your Spotify Songs
          </h1>
          <p className="spotify-subtitle">Import, vote, and see real-time rankings</p>
        </div>
        <button
          onClick={handleImportSongs}
          disabled={isImporting}
          className="import-button"
        >
          {isImporting ? (
            <>
              <div className="spinner"></div>
              Importing...
            </>
          ) : (
            'Import Recent Songs'
          )}
        </button>
      </div>

      {importMessage && (
        <div className={`message-box ${importMessage.includes('Error') ? 'error' : 'success'}`}>
          {importMessage.includes('Error') ? (
            <svg className="message-icon" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg className="message-icon" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          )}
          {importMessage}
        </div>
      )}

      <div className="combined-layout">
        {/* Left Panel - Songs List */}
        <div className="songs-panel">
          {!rankingLoading && ranking && rankedSongs.length > 0 && (
            <div className="songs-container" style={{ marginBottom: '16px' }}>
              <div className="section-header">
                🏆 Ranked Tracks ({rankedSongs.length})
              </div>
              <div>
                {rankedSongs.map((song, index) => (
                  <div 
                    key={song.id} 
                    className={`song-item ${selectedSong?.id === song.id ? 'selected' : ''}`}
                    onClick={() => setSelectedSong(song)}
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
                  </div>
                ))}
              </div>
            </div>
          )}

          {!rankingLoading && ranking && unrankedSongs.length > 0 && (
            <div className="songs-container">
              <div className="section-header">
                ⚡ Unranked Tracks ({unrankedSongs.length})
              </div>
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
              <div className="section-header">
                🗳️ Vote Between Songs
              </div>
              
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
                <div className="vote-container">
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
