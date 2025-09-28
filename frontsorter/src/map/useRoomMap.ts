import { useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { spotifyRoomGraph } from './rooms';
import { CoordKey, Direction, Door, MoveResult } from './types';
import { useNavigationStore } from './navigationStore';
import { useVoteProgress } from './useVoteProgress';

const directionVectors: Record<Direction, [number, number]> = {
  N: [0, 1],
  E: [1, 0],
  S: [0, -1],
  W: [-1, 0],
};

const getCoordString = (x: number, y: number): CoordKey => `${x},${y}` as CoordKey;

const deriveTarget = (origin: CoordKey, dir: Direction): CoordKey => {
  const [originX, originY] = origin.split(',').map((val) => Number(val));
  const [dx, dy] = directionVectors[dir];
  return getCoordString(originX + dx, originY + dy);
};

const hasDoor = (door: Door | undefined, progress: ReturnType<typeof useVoteProgress>['progress']): MoveResult => {
  if (!door) {
    return { success: false, reason: 'No door in that direction.' };
  }

  if (door.lock) {
    if (door.lock.kind === 'votes_today') {
      if (progress.votesToday < door.lock.threshold) {
        return {
          success: false,
          reason: `Requires ${door.lock.threshold} votes today.`,
          lock: door.lock,
        };
      }
    }
  }

  return { success: true };
};

export const useRoomMap = () => {
  const navigate = useNavigate();
  const params = useParams();
  const coordParam = params.coord as CoordKey | undefined;
  const { progress, isLoading: progressLoading } = useVoteProgress();

  const graph = spotifyRoomGraph;
  const store = useNavigationStore();

  const currentCoord: CoordKey = useMemo(() => {
    if (coordParam && graph[coordParam]) {
      return coordParam;
    }
    return store.current;
  }, [coordParam, graph, store.current]);

  const currentRoom = graph[currentCoord];

  const setCurrent = useCallback(
    (coord: CoordKey, dir: Direction | null) => {
      store.setCurrent(coord, dir);
      navigate(`/map/spotify/${coord}`);
    },
    [navigate, store],
  );

  const move = useCallback(
    (dir: Direction): MoveResult => {
      const door = currentRoom?.doors.find((d) => d.dir === dir);
      const check = hasDoor(door, progress);
      if (!check.success) {
        return check;
      }

      const target = door?.target ?? deriveTarget(currentCoord, dir);
      const targetRoom = graph[target];
      if (!targetRoom) {
        return { success: false, reason: 'Room not built yet.', lock: door?.lock };
      }

      setCurrent(target, dir);
      return { success: true };
    },
    [currentCoord, currentRoom?.doors, graph, progress, setCurrent],
  );

  const teleport = useCallback(
    (dir: Direction): MoveResult => {
      let probe = currentCoord;
      let next: CoordKey | undefined;
      while (true) {
        const candidate = deriveTarget(probe, dir);
        if (!graph[candidate] || !store.discovered[candidate]) {
          break;
        }
        probe = candidate;
        next = candidate;
      }

      if (!next || next === currentCoord) {
        return { success: false, reason: 'No farther discovered room yet.' };
      }

      setCurrent(next, dir);
      return { success: true };
    },
    [currentCoord, graph, setCurrent, store.discovered],
  );

  return {
    graph,
    currentCoord,
    currentRoom,
    progress,
    progressLoading,
    move,
    teleport,
    lastDirection: store.lastDirection,
    discovered: store.discovered,
  };
};
