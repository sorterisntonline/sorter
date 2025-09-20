import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

const SpotifyPlayerContext = createContext();

export const useSpotifyPlayer = () => {
  const context = useContext(SpotifyPlayerContext);
  if (!context) {
    throw new Error('useSpotifyPlayer must be used within a SpotifyPlayerProvider');
  }
  return context;
};

export const SpotifyPlayerProvider = ({ children, user }) => {
  const [player, setPlayer] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.5);
  const [queue, setQueue] = useState([]);

  // Initialize Spotify Player when user is available and has tokens
  useEffect(() => {
    if (!user?.spotifyAccessToken || !window.Spotify) {
      return;
    }

    const initializePlayer = () => {
      const spotifyPlayer = new window.Spotify.Player({
        name: 'Sorter Music Player',
        getOAuthToken: cb => { cb(user.spotifyAccessToken); },
        volume: volume,
      });

      // Error handling
      spotifyPlayer.addListener('initialization_error', ({ message }) => {
        console.error('Spotify Player initialization error:', message);
      });

      spotifyPlayer.addListener('authentication_error', ({ message }) => {
        console.error('Spotify Player authentication error:', message);
      });

      spotifyPlayer.addListener('account_error', ({ message }) => {
        console.error('Spotify Player account error:', message);
      });

      spotifyPlayer.addListener('playback_error', ({ message }) => {
        console.error('Spotify Player playback error:', message);
      });

      // Ready
      spotifyPlayer.addListener('ready', ({ device_id }) => {
        console.log('Spotify Player ready with device ID:', device_id);
        setDeviceId(device_id);
        setIsReady(true);
      });

      // Not ready
      spotifyPlayer.addListener('not_ready', ({ device_id }) => {
        console.log('Spotify Player device has gone offline:', device_id);
        setIsReady(false);
      });

      // Player state changes
      spotifyPlayer.addListener('player_state_changed', (state) => {
        if (!state) {
          setCurrentTrack(null);
          setIsPlaying(false);
          setPosition(0);
          setDuration(0);
          return;
        }

        setCurrentTrack(state.track_window.current_track);
        setIsPlaying(!state.paused);
        setPosition(state.position);
        setDuration(state.duration);
      });

      // Connect to the player
      spotifyPlayer.connect();
      setPlayer(spotifyPlayer);
    };

    // Wait for Spotify SDK to be ready
    if (window.Spotify) {
      initializePlayer();
    } else {
      window.onSpotifyWebPlaybackSDKReady = initializePlayer;
    }

    return () => {
      if (player) {
        player.disconnect();
      }
    };
  }, [user?.spotifyAccessToken, volume]);

  // Play a track
  const playTrack = useCallback(async (trackUri) => {
    if (!user?.spotifyAccessToken || !deviceId) {
      console.warn('Cannot play track: no token or device');
      return;
    }

    try {
      const response = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.spotifyAccessToken}`
        },
        body: JSON.stringify({
          uris: [trackUri]
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to play track: ${response.status}`);
      }
    } catch (error) {
      console.error('Error playing track:', error);
    }
  }, [user?.spotifyAccessToken, deviceId]);

  // Queue a track
  const queueTrack = useCallback(async (trackUri) => {
    if (!user?.spotifyAccessToken) {
      console.warn('Cannot queue track: no token');
      return;
    }

    try {
      const response = await fetch(`https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(trackUri)}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user.spotifyAccessToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to queue track: ${response.status}`);
      }

      // Update local queue state
      setQueue(prev => [...prev, trackUri]);
    } catch (error) {
      console.error('Error queueing track:', error);
    }
  }, [user?.spotifyAccessToken]);

  // Toggle play/pause
  const togglePlay = useCallback(async () => {
    if (!player) return;

    try {
      await player.togglePlay();
    } catch (error) {
      console.error('Error toggling play:', error);
    }
  }, [player]);

  // Skip to next track
  const skipNext = useCallback(async () => {
    if (!player) return;

    try {
      await player.nextTrack();
    } catch (error) {
      console.error('Error skipping to next track:', error);
    }
  }, [player]);

  // Skip to previous track
  const skipPrevious = useCallback(async () => {
    if (!player) return;

    try {
      await player.previousTrack();
    } catch (error) {
      console.error('Error skipping to previous track:', error);
    }
  }, [player]);

  // Set volume
  const setPlayerVolume = useCallback(async (newVolume) => {
    if (!player) return;

    try {
      await player.setVolume(newVolume);
      setVolume(newVolume);
    } catch (error) {
      console.error('Error setting volume:', error);
    }
  }, [player]);

  // Seek to position
  const seekToPosition = useCallback(async (positionMs) => {
    if (!player) return;

    try {
      await player.seek(positionMs);
    } catch (error) {
      console.error('Error seeking:', error);
    }
  }, [player]);

  const value = {
    player,
    deviceId,
    isReady,
    isPlaying,
    currentTrack,
    position,
    duration,
    volume,
    queue,
    // Methods
    playTrack,
    queueTrack,
    togglePlay,
    skipNext,
    skipPrevious,
    setVolume: setPlayerVolume,
    seekToPosition,
  };

  return (
    <SpotifyPlayerContext.Provider value={value}>
      {children}
    </SpotifyPlayerContext.Provider>
  );
};
