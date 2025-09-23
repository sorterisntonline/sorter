import { create } from 'zustand';

const usePinnedSongStore = create((set, get) => ({
  pinnedSong: null,
  
  // Set the pinned song
  setPinnedSong: (song) => set({ pinnedSong: song }),
  
  // Clear the pinned song
  clearPinnedSong: () => set({ pinnedSong: null }),
  
  // Toggle pinning of a song
  togglePinnedSong: (song) => {
    const current = get().pinnedSong;
    if (current && current.id === song.id) {
      set({ pinnedSong: null });
    } else {
      set({ pinnedSong: song });
    }
  },
  
  // Check if a song is pinned
  isSongPinned: (song) => {
    const pinnedSong = get().pinnedSong;
    return pinnedSong && pinnedSong.id === song.id;
  },
}));

export default usePinnedSongStore;
