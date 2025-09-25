import { ReactNode } from 'react';

// Auth Context Types
export interface User {
  id: string;
  username: string;
  email?: string;
  created_at?: string;
  avatar_url?: string;
  handle?: string;
  display_name?: string;
}

export interface TempData {
  email?: string;
  provider?: string;
  [key: string]: any;
}

export interface SessionData {
  authenticated: boolean;
  session_type: 'full' | 'temp' | null;
  user: User | null;
  temp_data: TempData | null;
}

export interface AuthContextType {
  // Data
  isLoading: boolean;
  error: any;
  isAuthenticated: boolean;
  user: User | null;
  sessionType: 'full' | 'temp' | null;
  tempData: TempData | null;
  
  // Flags
  isFullSession: boolean;
  isTempSession: boolean;
  needsUsernameSelection: boolean;
  
  // Actions
  logout: () => void;
  completeSignup: (data: { username: string }) => void;
  refetchSession: () => void;
  
  // Mutation states
  isLoggingOut: boolean;
  isCompletingSignup: boolean;
  signupError: any;
}

// Spotify Player Context Types
export interface SpotifyPlayerContextType {
  // Player state
  isReady: boolean;
  isPlaying: boolean;
  currentTrack: any | null;
  position: number;
  duration: number;
  volume: number;
  accessToken: string | null;
  
  // Player actions
  playTrack: (uri: string) => Promise<void>;
  queueTrack: (uri: string) => Promise<void>;
  togglePlay: () => Promise<void>;
  skipNext: () => Promise<void>;
  skipPrevious: () => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  seekToPosition: (position: number) => Promise<void>;
}

// Dynamic Theme Context Types
export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  accentDark: string;
  accentLight: string;
  text: string;
  textSecondary: string;
  border: string;
  gradient: string;
  radialGradient: string;
}

export interface DynamicThemeContextType {
  theme: ThemeColors;
  updateThemeFromImage: (imageUrl: string) => Promise<void>;
  getScoreColors: (score: number) => { color: string; backgroundColor: string };
  getCSSVariables: () => Record<string, string>;
}

// Pinned Song Store Types
export interface Song {
  id: string;
  title: string;
  artist: string;
  album?: string;
  image_url?: string;
  spotify_url?: string;
  spotify_uri?: string;
  preview_url?: string;
  duration_ms?: number;
  external_urls?: {
    spotify: string;
  };
  score?: number;
}

export interface PinnedSongStore {
  pinnedSong: Song | null;
  setPinnedSong: (song: Song) => void;
  clearPinnedSong: () => void;
  isSongPinned: (songId: string) => boolean;
  togglePinnedSong: (song: Song) => void;
  
  // Songs data for lookups
  songsMap: Record<string, Song>;
  setSongs: (songs: Song[]) => void;
  getSongById: (songId: string) => Song | null;
  clearSongs: () => void;
}

// Provider Props
export interface AuthProviderProps {
  children: ReactNode;
}

export interface SpotifyPlayerProviderProps {
  children: ReactNode;
}

export interface DynamicThemeProviderProps {
  children: ReactNode;
}
