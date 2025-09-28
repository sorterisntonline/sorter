import { create } from 'zustand';
import { CoordKey, Direction } from './types';

interface NavigationState {
  current: CoordKey;
  previous: CoordKey | null;
  lastDirection: Direction | null;
  discovered: Record<CoordKey, true>;
  setCurrent: (coord: CoordKey, dir: Direction | null) => void;
  reset: () => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  current: '0,0',
  previous: null,
  lastDirection: null,
  discovered: { '0,0': true },
  setCurrent: (coord, dir) =>
    set((state) => ({
      current: coord,
      previous: state.current,
      lastDirection: dir,
      discovered: { ...state.discovered, [coord]: true },
    })),
  reset: () =>
    set({
      current: '0,0',
      previous: null,
      lastDirection: null,
      discovered: { '0,0': true },
    }),
}));
