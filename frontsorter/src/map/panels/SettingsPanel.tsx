import React from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSpotifyPlayer } from '../../contexts/SpotifyPlayerContext';
import '../../styles/map-room.css';

export const SettingsPanel: React.FC = () => {
  const auth = useAuth();
  const player = useSpotifyPlayer();

  return (
    <div className="room-panel room-panel--settings">
      <h3>Control Deck</h3>
      <section className="settings-section">
        <h4>Account</h4>
        <p>{auth.user?.display_name || auth.user?.handle}</p>
        <p className="settings-sub">{auth.user?.email}</p>
        <button className="room-button" onClick={() => auth.logout()} disabled={auth.isLoggingOut}>
          {auth.isLoggingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </section>
      <section className="settings-section">
        <h4>Spotify Player</h4>
        <ul className="settings-list">
          <li>Status: {player.isReady ? 'Ready' : 'Waiting for device'}</li>
          <li>Playback: {player.isPlaying ? 'Playing' : 'Paused'}</li>
          <li>Volume: {Math.round(player.volume * 100)}</li>
        </ul>
        <div className="settings-actions">
          <button className="room-button room-button--ghost" onClick={() => player.togglePlay()}>
            {player.isPlaying ? 'Pause' : 'Resume'}
          </button>
          <button className="room-button room-button--ghost" onClick={() => player.skipNext()}>
            Skip
          </button>
        </div>
      </section>
      <section className="settings-section">
        <h4>Accessibility</h4>
        <p>Reduced motion and color profiles coming soon.</p>
      </section>
    </div>
  );
};
