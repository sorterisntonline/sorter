import { selected_item } from './App';

const formatNumber = (number) => Math.round(number * 100) / 100;

export const Item = ({ item, rank, onClick }) => {
  const handleClick = () => {
    const url = new URLSearchParams(window.location.search);
    if (selected_item.value === item) {
      selected_item.value = false;
      url.delete('item');
    } else {
      selected_item.value = item;
      url.set('item', item.id);
    }
    window.history.replaceState({}, '', `${window.location.pathname}?${url.toString()}`);
    onClick?.();
  };

  const isActive = item === selected_item.value;

  return (
    <li
      id={`item-${item.id}`}
      className={`item-row ${isActive ? 'item-row--active' : ''}`}
      onClick={handleClick}
    >
      <div className="flex min-w-0 items-center gap-3">
        {rank != null && (
          <span className="w-6 shrink-0 text-sm text-ink-muted">{rank}</span>
        )}
        {item.elo !== undefined && (
          <span className="w-12 shrink-0 text-sm font-medium tabular-nums text-accent">
            {formatNumber(item.elo)}
          </span>
        )}
        <span className="truncate">{item.title}</span>
      </div>
      {item.vote_count != null && (
        <span className="shrink-0 text-xs text-ink-muted">
          {item.num_comments > 0 ? `${item.num_comments} comments · ` : ''}
          {item.vote_count} votes
        </span>
      )}
    </li>
  );
};
