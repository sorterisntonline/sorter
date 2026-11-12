import { useEffect, useState } from 'react';
import { signal, computed, effect } from '@preact/signals-react';
import { loadTag } from './Network';
import { ErrorPanel } from './ErrorPanel';
import { errorState, clearError } from './ErrorHandler';
import { resetSelectedUsers } from './UserPanel';
import { Tag } from './Tag';
import { Button } from './components/ui/Button';
import { isMobileViewport } from './utils/layout';

export const tag = signal(false);
export const selected_item = signal(false);
export const drawer_open = signal(false);
export const current_attribute = signal(null);
export const magnitude = signal(50);
export const toggle = signal(true);
export const showAllSorted = signal(true);
export const showAllUnsorted = signal(true);

export const items_by_id = computed(() => {
  if (!tag.value) return {};
  const map = {};
  for (const item of tag.value.unsorted) map[item.id] = item;
  for (const item of tag.value.sorted) map[item.id] = item;
  return map;
});

const computeSelectedItem = (tagData, itemId) => {
  if (!tagData || !itemId) return false;
  return tagData.sorted.concat(tagData.unsorted).find((item) => item.id == itemId) ?? false;
};

effect(() => {
  selected_item.value = computeSelectedItem(
    tag.value,
    new URLSearchParams(window.location.search).get('item')
  );
});

effect(() => {
  const url = new URLSearchParams(window.location.search);
  if (selected_item.value) {
    url.set('item', selected_item.value.id);
    window.history.replaceState({}, '', `${window.location.pathname}?${url.toString()}`, { preventScroll: true });
    if (isMobileViewport()) drawer_open.value = true;
  } else {
    drawer_open.value = false;
  }
});

function App({ tagid, isVoting }) {
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [currentTagId, setCurrentTagId] = useState(null);

  const handleSelectItem = (item) => {
    selected_item.value = item;
    if (isMobileViewport()) drawer_open.value = true;
  };

  const handleCloseItem = () => {
    drawer_open.value = false;
    setTimeout(() => {
      selected_item.value = false;
    }, 100);
  };

  const handleError = (error) => {
    setLoadError(error);
  };

  useEffect(() => {
    if (!tagid) return undefined;
    setIsLoading(true);
    setLoadError(null);
    tag.value = false;

    loadTag(tagid, handleError)
      .then((data) => {
        if (!data?.tag || !data.sorted || !data.unsorted) {
          setLoadError(new Error('invalid data from server'));
        }
      })
      .catch((err) => setLoadError(err))
      .finally(() => setIsLoading(false));
  }, [tagid]);

  useEffect(() => {
    resetSelectedUsers();
  }, [tag.value]);

  useEffect(() => {
    if (tag.value?.tag?.id !== currentTagId) {
      setCurrentTagId(tag.value?.tag?.id);
    }
  }, [tag.value, currentTagId]);

  useEffect(() => {
    if (currentTagId && tag.value && !current_attribute.value && tag.value.attributes?.length > 0) {
      current_attribute.value = tag.value.attributes[0];
    }
  }, [currentTagId, tag.value]);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (loadError || !tag.value) {
    return (
      <div className="page flex min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-lg">failed to load tag</p>
        <p className="text-sm text-ink-muted">{loadError?.message || 'unknown error'}</p>
        <Button variant="primary" onClick={() => window.location.reload()}>
          reload
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-surface text-ink">
      {errorState.value && <ErrorPanel error={errorState.value} onClose={clearError} />}
      <Tag
        isVoting={isVoting}
        handleError={handleError}
        onSelectItem={handleSelectItem}
        onCloseItem={handleCloseItem}
      />
    </div>
  );
}

export default App;
