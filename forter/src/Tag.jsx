import { useEffect, useState, useRef } from 'react';
import { useLocation } from 'wouter';
import { tag } from './App';
import { editing_item } from './ItemPanel';
import { Voting } from './Voting';
import { IntegrationsPanel } from './integrations/IntegrationsPanel';
import { ItemsLists } from './ItemsLists';
import { ItemPanel } from './ItemPanel';
import { toggle } from './App';
import { MobileNewItemChooser } from './components/MobileNewItemChooser';
import { TextSummary } from './components/TextSummary';
import { selected_item } from './App';
import { Drawer } from './components/Drawer';
import { drawer_open } from './App';
import { Button } from './components/ui/Button';
import { isMobileViewport } from './utils/layout';

export const Tag = ({ isVoting, handleError, onSelectItem, onCloseItem }) => {
  const [location, setLocation] = useLocation();
  const touchStartX = useRef(null);
  const [isDataReady, setIsDataReady] = useState(false);

  useEffect(() => {
    if (!tag.value?.tag || !tag.value.sorted || !tag.value.unsorted) {
      setIsDataReady(false);
      return;
    }
    setIsDataReady(true);
  }, [tag.value]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('newItem') === 'true') {
      editing_item.value = {};
      params.delete('newItem');
      window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
    }
  }, [location]);

  useEffect(() => {
    if (isVoting) return undefined;

    const handleNavigation = () => setLocation('/');
    const handleTouchStart = (e) => {
      touchStartX.current = e.touches[0].clientX;
    };
    const handleTouchEnd = (e) => {
      if (!touchStartX.current) return;
      const swipeDistance = e.changedTouches[0].clientX - touchStartX.current;
      if (swipeDistance > 100) handleNavigation();
      touchStartX.current = null;
    };

    window.addEventListener('popstate', handleNavigation);
    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: false });

    return () => {
      window.removeEventListener('popstate', handleNavigation);
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isVoting, setLocation]);

  if (!isDataReady) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  const { can_vote = false, can_view = false, can_add = false } = tag.value.perms || {};

  if (!can_view) {
    return <div className="page py-8 text-center text-ink-muted">no permission to view this tag</div>;
  }

  return (
    <>
      {isVoting ? (
        <Voting handleError={handleError} onSelectItem={onSelectItem} onCloseItem={onCloseItem} />
      ) : (
        <>
          <IntegrationsPanel />
          <TextSummary can_vote={can_vote} can_add={can_add} />

          <div className="flex flex-col gap-4 lg:flex-row">
            <div className={`min-w-0 flex-1 ${toggle.value ? 'lg:w-3/4' : 'lg:w-full'}`}>
              <ItemsLists
                sorteditems={tag.value.sorted}
                unsorteditems={tag.value.unsorted}
                skippedItems={tag.value.skipped}
                onSelectItem={onSelectItem}
              />
            </div>

            {toggle.value ? (
              <aside className="hidden w-full shrink-0 lg:block lg:w-72">
                <div className="sticky top-20 space-y-3 p-4">
                  <Button variant="ghost" size="sm" onClick={() => (toggle.value = !toggle.value)}>
                    collapse sidebar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLocation(`/${tag.value.tag.id}/${tag.value.tag.slug}/graph`)}
                  >
                    show graph
                  </Button>
                  {(editing_item.value || selected_item.value) && (
                    <div className="surface-card p-3">
                      <ItemPanel onClose={onCloseItem} />
                    </div>
                  )}
                </div>
              </aside>
            ) : (
              !isMobileViewport() && (
                <Button variant="ghost" size="sm" className="m-4 w-fit" onClick={() => (toggle.value = !toggle.value)}>
                  expand sidebar
                </Button>
              )
            )}
          </div>
        </>
      )}

      {isMobileViewport() && (selected_item.value || editing_item.value) && (
        <Drawer
          isOpen={drawer_open.value}
          onClose={() => {
            drawer_open.value = false;
            selected_item.value = null;
            editing_item.value = null;
            onCloseItem?.();
          }}
        >
          <ItemPanel onClose={onCloseItem} />
        </Drawer>
      )}

      {isMobileViewport() && can_add && !isVoting && !selected_item.value && (
        <div className="fixed bottom-4 right-4 z-fab">
          <MobileNewItemChooser />
        </div>
      )}
    </>
  );
};
