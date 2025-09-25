// Global type definitions

/// <reference types="react" />
/// <reference types="react-dom" />

// Spotify Web Playback SDK types
declare global {
  interface Window {
    Spotify: {
      Player: new (options: {
        name: string;
        getOAuthToken: (callback: (token: string) => void) => void;
        volume: number;
      }) => SpotifyPlayer;
    };
    spotifySDKReady?: boolean;
  }
}

interface SpotifyPlayer {
  addListener(event: string, callback: (...args: any[]) => void): boolean;
  removeListener(event: string, callback?: (...args: any[]) => void): boolean;
  connect(): Promise<boolean>;
  disconnect(): void;
  getCurrentState(): Promise<SpotifyPlaybackState | null>;
  getVolume(): Promise<number>;
  nextTrack(): Promise<void>;
  pause(): Promise<void>;
  previousTrack(): Promise<void>;
  resume(): Promise<void>;
  seek(position_ms: number): Promise<void>;
  setName(name: string): Promise<void>;
  setVolume(volume: number): Promise<void>;
  togglePlay(): Promise<void>;
}

interface SpotifyPlaybackState {
  context: any;
  disallows: any;
  duration: number;
  paused: boolean;
  position: number;
  repeat_mode: number;
  shuffle: boolean;
  track_window: {
    current_track: SpotifyTrack;
    next_tracks: SpotifyTrack[];
    previous_tracks: SpotifyTrack[];
  };
}

interface SpotifyTrack {
  album: {
    images: { url: string }[];
    name: string;
  };
  artists: { name: string }[];
  duration_ms: number;
  id: string;
  name: string;
  uri: string;
}

// Chart.js interaction mode fix
declare module 'chart.js' {
  interface InteractionModeMap {
    index: InteractionModeFunction;
    dataset: InteractionModeFunction;
    point: InteractionModeFunction;
    nearest: InteractionModeFunction;
    x: InteractionModeFunction;
    y: InteractionModeFunction;
  }
}

export {};
