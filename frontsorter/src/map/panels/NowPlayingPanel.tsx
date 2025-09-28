import React from 'react';
import { useSpotifyPlayer } from '../../contexts/SpotifyPlayerContext';
import '../../styles/map-room.css';

export const NowPlayingPanel: React.FC = () => {
  const player = useSpotifyPlayer();
  const track = player.currentTrack;

  if (!track) {
    return (
      <div className="room-panel room-panel--now-playing room-panel--empty">
        <p>No track playing. Pick a winner to cue it up.</p>
      </div>
    );
  }

  const albumArt = track.album?.images?.[0]?.url;
  const artistNames = Array.isArray(track.artists)
    ? track.artists.map((artist: any) => artist.name).join(', ')
    : track.artists || 'Unknown Artist';

  const progressPercent = track.duration_ms
    ? Math.min(100, Math.round((player.position / track.duration_ms) * 100))
    : 0;

  return (
    <div className="room-panel room-panel--now-playing">
      {albumArt && <img src={albumArt} alt={track.name} className="now-playing__image" />}
      <div className="now-playing__body">
        <span className="now-playing__label">Now Playing</span>
        <h3 className="now-playing__title">{track.name}</h3>
        <p className="now-playing__artist">{artistNames}</p>
        <div className="now-playing__progress">
          <div className="now-playing__progress-bar" style={{ width: `${progressPercent}%` }} />
        </div>
        <div className="now-playing__controls">
          <button
            className="room-button room-button--ghost"
            onClick={() => player.togglePlay()}
          >
            {player.isPlaying ? 'Pause' : 'Play'}
          </button>
          <button className="room-button room-button--ghost" onClick={() => player.skipPrevious()}>
            Prev
          </button>
          <button className="room-button room-button--ghost" onClick={() => player.skipNext()}>
            Next
          </button>
        </div>
      </div>
    </div>
  );
};
