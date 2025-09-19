import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AuthAPI } from '../api/auth';
import '../styles/spotify.css';

function SpotifySongsPage() {
  const [isImporting, setIsImporting] = useState(false);
  const [importMessage, setImportMessage] = useState('');
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
            My Spotify Songs
          </h1>
          <p className="spotify-subtitle">Import and sort your recently played tracks</p>
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

      {/* Voting section */}
      {user && songs && songs.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <button
            onClick={() => navigate(`/vote?pk_namespace=sorter.user&pk=${encodeURIComponent(user.handle)}`)}
            className="import-button"
            style={{ marginRight: '8px' }}
          >
            Start Voting
          </button>
        </div>
      )}

      {/* Ranked songs section */}
      {!rankingLoading && ranking && rankedSongs.length > 0 && (
        <div className="songs-container" style={{ marginBottom: '16px' }}>
          <div className="section-header">
            🏆 Ranked Tracks ({rankedSongs.length})
          </div>
          <div>
            {rankedSongs.map((song, index) => (
              <div key={song.id} className="song-item">
                <div className="rank-badge">#{index + 1}</div>
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
                <div className="score-badge">
                  {Math.round(song.score * 1000) / 1000}
                </div>
                <div className="song-actions">
                  <button 
                    className="action-button"
                    onClick={() => navigate(`/vote?pk_namespace=sorter.user&pk=${encodeURIComponent(user.handle)}&left_pin_ns=spotify.track&left_pin_pk=${encodeURIComponent(song.id)}`)}
                    title="Compare this track"
                  >
                    <svg className="action-icon" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5 10a1 1 0 011-1h3V6a1 1 0 011-1h1a1 1 0 011 1v3h3a1 1 0 011 1v1a1 1 0 01-1 1h-3v3a1 1 0 01-1 1h-1a1 1 0 01-1-1v-3H6a1 1 0 01-1-1v-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unranked songs section */}
      {!rankingLoading && ranking && unrankedSongs.length > 0 && (
        <div className="songs-container">
          <div className="section-header">
            ⚡ Unranked Tracks ({unrankedSongs.length})
          </div>
          <div>
            {unrankedSongs.map((song) => (
              <div key={song.id} className="song-item">
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
                <div className="song-actions">
                  <button 
                    className="action-button"
                    onClick={() => navigate(`/vote?pk_namespace=sorter.user&pk=${encodeURIComponent(user.handle)}&left_pin_ns=spotify.track&left_pin_pk=${encodeURIComponent(song.id)}`)}
                    title="Compare this track"
                  >
                    <svg className="action-icon" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5 10a1 1 0 011-1h3V6a1 1 0 011-1h1a1 1 0 011 1v3h3a1 1 0 011 1v1a1 1 0 01-1 1h-3v3a1 1 0 01-1 1h-1a1 1 0 01-1-1v-3H6a1 1 0 01-1 1v-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
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
        </div>
      )}
    </div>
  );
}

export default SpotifySongsPage;
