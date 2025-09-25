import { create } from 'zustand';
import { PinnedSongStore, Song } from '../types/contexts';

const usePinnedSongStore = create<PinnedSongStore>((set, get) => ({
  pinnedSong: null,
  songsMap: {},
  
  // Set the pinned song
  setPinnedSong: (song: Song) => set({ pinnedSong: song }),
  
  // Clear the pinned song
  clearPinnedSong: () => set({ pinnedSong: null }),
  
  // Toggle pinning of a song
  togglePinnedSong: (song: Song) => {
    const current = get().pinnedSong;
    if (current && current.id === song.id) {
      set({ pinnedSong: null });
    } else {
      set({ pinnedSong: song });
    }
  },
  
  // Check if a song is pinned
  isSongPinned: (songId: string) => {
    const pinnedSong = get().pinnedSong;
    return pinnedSong && pinnedSong.id === songId;
  },
  
  // Songs data management
  setSongs: (songs: Song[]) => {
    const songsMap: Record<string, Song> = {};
    songs.forEach(song => {
      songsMap[song.id] = song;
    });
    set({ songsMap });
  },
  
  getSongById: (songId: string) => {
    const songsMap = get().songsMap;
    return songsMap[songId] || null;
  },
  
  clearSongs: () => set({ songsMap: {} }),
}));

export default usePinnedSongStore;
