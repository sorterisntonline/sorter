import React from 'react';
import { useMapContext } from '../MapContext';
import { useVoteProgress } from '../useVoteProgress';
import '../../styles/map-room.css';

export const RankFiltersPanel: React.FC = () => {
  const { rankFilter, setRankFilter } = useMapContext();
  const { progress } = useVoteProgress();

  return (
    <div className="room-panel room-panel--filters">
      <h3>Focus</h3>
      <input
        type="search"
        value={rankFilter}
        onChange={(event) => setRankFilter(event.target.value)}
        placeholder="Search roster"
        className="ranked-filter"
      />
      <div className="filters-progress">
        <div className="filters-progress__item">
          <span className="filters-progress__label">Votes Today</span>
          <div className="filters-progress__value">{progress.votesToday}</div>
        </div>
        <div className="filters-progress__item">
          <span className="filters-progress__label">Total Votes</span>
          <div className="filters-progress__value">{progress.totalVotes}</div>
        </div>
      </div>
      <p className="filters-tip">
        Unlock analytics at <strong>25 votes today</strong>. Keep sorting!
      </p>
    </div>
  );
};
