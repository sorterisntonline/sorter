import { RoomGraph } from './types';

export const spotifyRoomGraph: RoomGraph = {
  '0,0': {
    id: 'pairing-chamber',
    name: 'Pairing Chamber',
    coord: '0,0',
    description: 'Battle songs head-to-head and queue the winner.',
    panels: [
      { id: 'pair', title: 'Pair Arena', kind: 'pair', width: 'wide' },
      { id: 'nowPlaying', title: 'Now Playing', kind: 'nowPlaying', width: 'narrow' },
    ],
    doors: [
      { dir: 'N', target: '0,1', label: 'Ranked List' },
      { dir: 'W', target: '-1,0', label: 'Pool Builder' },
      { dir: 'E', target: '1,0', label: 'Item Detail' },
      { dir: 'S', target: '0,-1', label: 'Devices & Settings' },
    ],
  },
  '0,1': {
    id: 'ranked-list',
    name: 'Ranked List',
    coord: '0,1',
    description: 'Survey the current standings and tweak focus.',
    panels: [
      { id: 'ranking', title: 'Top Seeds', kind: 'rankedList', width: 'wide' },
      { id: 'filters', title: 'Filters', kind: 'rankFilters', width: 'narrow' },
    ],
    doors: [
      {
        dir: 'S',
        target: '0,0',
        label: 'Pairing Chamber',
      },
      {
        dir: 'E',
        target: '1,1',
        label: 'Future Lab',
        lock: {
          id: 'analytics-lab',
          title: 'Analytics Lab',
          description: 'Vote on 25 pairs today to unlock the Analytics Lab.',
          kind: 'votes_today',
          threshold: 25,
        },
      },
    ],
  },
  '-1,0': {
    id: 'pool-builder',
    name: 'Pool Builder',
    coord: '-1,0',
    description: 'Curate your contenders before the match.',
    panels: [
      { id: 'pool', title: 'Pool Manager', kind: 'poolManager', width: 'full' },
    ],
    doors: [
      { dir: 'E', target: '0,0', label: 'Pairing Chamber' },
      { dir: 'N', target: '-1,1', label: 'Future Room', lock: {
        id: 'tag-lab',
        title: 'Tag Lab',
        description: 'Coming soon.',
        kind: 'votes_today',
        threshold: 999,
      } },
    ],
  },
  '1,0': {
    id: 'item-detail',
    name: 'Detail Observatory',
    coord: '1,0',
    description: 'Zoom into metadata, related entities, and playlist actions.',
    panels: [
      { id: 'detail', title: 'Entity Detail', kind: 'itemDetail', width: 'full' },
    ],
    doors: [
      { dir: 'W', target: '0,0', label: 'Pairing Chamber' },
      {
        dir: 'N',
        target: '1,1',
        label: 'Analytics Lab',
        lock: {
          id: 'analytics-lab',
          title: 'Analytics Lab',
          description: 'Vote on 25 pairs today to unlock the Analytics Lab.',
          kind: 'votes_today',
          threshold: 25,
        },
      },
    ],
  },
  '0,-1': {
    id: 'settings',
    name: 'Device Hangar',
    coord: '0,-1',
    description: 'Manage accounts, devices and interaction defaults.',
    panels: [
      { id: 'settings', title: 'Settings & Devices', kind: 'settings', width: 'full' },
    ],
    doors: [
      { dir: 'N', target: '0,0', label: 'Back to Pairing' },
    ],
  },
};
