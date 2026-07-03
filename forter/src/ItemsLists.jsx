import { Item } from './Item';
import { showAllSorted, showAllUnsorted } from './App';
import { selected_item, drawer_open } from './App';

const ListBlock = ({ title, items, ordered = true, showAll, setShowAll, onSelectItem }) => {
  const displayCount = 25;
  const hasMore = items?.length > displayCount;
  const displayItems = !showAll && hasMore ? items.slice(0, displayCount) : items;
  const ListTag = ordered ? 'ol' : 'ul';
  const listClass = ordered ? 'list-none' : 'list-none';

  return (
    <section>
      <h3 className="mb-2 text-sm font-medium uppercase tracking-wide text-ink-muted">{title}</h3>
      <ListTag className={listClass}>
        {displayItems?.map((item, index) => (
          <Item
            key={item.id}
            item={item}
            rank={ordered ? index + 1 : null}
            onClick={() => {
              selected_item.value = item;
              drawer_open.value = true;
              onSelectItem?.(item);
            }}
          />
        ))}
      </ListTag>
      {hasMore && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-2 w-full rounded-lg py-2 text-sm text-ink-muted hover:bg-zinc-50 dark:hover:bg-zinc-900"
        >
          {showAll ? 'show less' : 'show more'}
        </button>
      )}
    </section>
  );
};

export const ItemsLists = ({ sorteditems = [], unsorteditems = [], skippedItems = [], onSelectItem }) => {
  const handleItemClick = (item) => {
    selected_item.value = item;
    drawer_open.value = true;
    onSelectItem?.(item);
  };

  return (
    <div className="page flex flex-col gap-6">
      {sorteditems.length > 0 && (
        <ListBlock
          title="sorted"
          items={sorteditems}
          ordered
          showAll={showAllSorted.value}
          setShowAll={(val) => (showAllSorted.value = val)}
          onSelectItem={handleItemClick}
        />
      )}
      {unsorteditems.length > 0 && (
        <ListBlock
          title="unsorted"
          items={unsorteditems}
          ordered={false}
          showAll={showAllUnsorted.value}
          setShowAll={(val) => (showAllUnsorted.value = val)}
          onSelectItem={handleItemClick}
        />
      )}
      {skippedItems.length > 0 && (
        <ListBlock
          title="skipped"
          items={skippedItems}
          ordered={false}
          onSelectItem={handleItemClick}
        />
      )}
    </div>
  );
};
