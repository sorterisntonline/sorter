import React from 'react';
import { PanelKind } from './types';
import { PairPanel } from './panels/PairPanel';
import { NowPlayingPanel } from './panels/NowPlayingPanel';
import { RankedListPanel } from './panels/RankedListPanel';
import { RankFiltersPanel } from './panels/RankFiltersPanel';
import { PoolManagerPanel } from './panels/PoolManagerPanel';
import { ItemDetailPanel } from './panels/ItemDetailPanel';
import { SettingsPanel } from './panels/SettingsPanel';

export const panelRegistry: Record<PanelKind, React.FC> = {
  pair: PairPanel,
  nowPlaying: NowPlayingPanel,
  rankedList: RankedListPanel,
  rankFilters: RankFiltersPanel,
  poolManager: PoolManagerPanel,
  itemDetail: ItemDetailPanel,
  settings: SettingsPanel,
};
