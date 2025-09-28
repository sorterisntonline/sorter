export type Direction = 'N' | 'E' | 'S' | 'W';

export type Coord = { x: number; y: number };

export type CoordKey = `${number},${number}`;

export interface LockBase {
  id: string;
  title: string;
  description: string;
}

export interface VoteStreakLock extends LockBase {
  kind: 'votes_today';
  threshold: number;
}

export type Lock = VoteStreakLock;

export interface Door {
  dir: Direction;
  target: CoordKey;
  label: string;
  lock?: Lock;
}

export type PanelWidth = 'full' | 'wide' | 'narrow';

export interface PanelDefinition {
  id: string;
  title: string;
  kind: PanelKind;
  width?: PanelWidth;
}

export type PanelKind =
  | 'pair'
  | 'nowPlaying'
  | 'rankedList'
  | 'rankFilters'
  | 'poolManager'
  | 'itemDetail'
  | 'settings';

export interface RoomDefinition {
  id: string;
  name: string;
  coord: CoordKey;
  description?: string;
  panels: PanelDefinition[];
  doors: Door[];
}

export type RoomGraph = Record<CoordKey, RoomDefinition>;

export interface MoveResult {
  success: boolean;
  reason?: string;
  lock?: Lock;
}
