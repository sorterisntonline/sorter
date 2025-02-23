import { useEffect, useState, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { tag } from "./App";
import { editing_item } from "./ItemPanel";
import { Voting } from "./Voting";
import { MetaTags } from "./MetaTags";
import { IntegrationsPanel } from "./integrations/IntegrationsPanel";
import { ItemsLists } from "./ItemsLists";
import { ItemPanel } from "./ItemPanel";
import { toggle } from "./App";
import { useElo } from "./App";
import { showPin } from "./App";
import { MobileNewItemChooser } from "./components/MobileNewItemChooser";
import { WarningPopup } from "./components/WarningPopup";
import { errorState, clearError } from "./ErrorHandler";
import { TextSummary } from "./components/TextSummary";
import { selected_item } from "./App";
import { Drawer } from "./components/Drawer";
import { drawer_open } from "./App";

export const Tag = ({ isVoting, handleError, onSelectItem, onCloseItem }) => {
  const [location, setLocation] = useLocation();
  const isMobileDevice = () => window.innerWidth < 1024;
  const touchStartX = useRef(null);

  const { can_vote = false, can_view = false, can_add = false } = tag.value?.perms || {};

  if (!tag.value || !can_view) {
    return <div>you do not have permission to view this tag</div>;
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('newItem') === 'true') {
      editing_item.value = {};
      params.delete('newItem');
      window.history.replaceState({}, "", window.location.pathname + "?" + params.toString());
    }
  }, [location]);

  useEffect(() => {
    // Only run this when we're NOT in voting view
    if (!isVoting) {
      const handleNavigation = (e) => {
        // Prevent default navigation
        if (e?.preventDefault) {
          e.preventDefault();
        }
        console.log('Navigation detected in tag view, redirecting to home');
        setLocation('/');
      };

      const handleTouchStart = (e) => {
        touchStartX.current = e.touches[0].clientX;
      };

      const handleTouchEnd = (e) => {
        if (!touchStartX.current) return;

        const touchEndX = e.changedTouches[0].clientX;
        const swipeDistance = touchEndX - touchStartX.current;

        // Detect right swipe (common back gesture)
        if (swipeDistance > 100) {  // threshold of 100px
          handleNavigation();
        }

        touchStartX.current = null;
      };

      // Handle browser back button and MacBook gestures
      window.addEventListener('popstate', handleNavigation);
      
      // Handle touch gestures (mobile and trackpad)
      document.addEventListener('touchstart', handleTouchStart, { passive: false });
      document.addEventListener('touchend', handleTouchEnd, { passive: false });

      return () => {
        window.removeEventListener('popstate', handleNavigation);
        document.removeEventListener('touchstart', handleTouchStart);
        document.removeEventListener('touchend', handleTouchEnd);
      };
    }
  }, [isVoting, setLocation]);

  return (
    <>
      <div className="dark:text-white justify-start">
        {isVoting ? (
          <Voting 
            handleError={handleError} 
            onSelectItem={onSelectItem}
            onCloseItem={onCloseItem}
          />
        ) : (
          <>
            <IntegrationsPanel />
            <TextSummary can_vote={can_vote} can_add={can_add} />
            
            <div className="flex lg:flex-row flex-col lg:space-x-24">
              <div className="flex-1">
                <ItemsLists 
                  sorteditems={tag.value.sorted}
                  unsorteditems={tag.value.unsorted}
                  skippedItems={tag.value.skipped}
                  onSelectItem={onSelectItem}
                />
              </div>
              
              {/* Desktop sidebar */}
              <div className="lg:ml-auto lg:w-1/4">
                <div className="flex flex-col">
                  <div
                    className="justify-self-start cursor-pointer border-1 border-gray-300 whitespace-nowrap"
                    onClick={() => toggle.value = !toggle.value}
                    role="button"
                  >
                    {toggle.value ? "[more space <-]" : "[less space ->]"}
                  </div>
                  <div
                    className="justify-self-start cursor-pointer border-1 border-gray-300 whitespace-nowrap"
                    onClick={() => {
                      useElo.value = !useElo.value;
                      loadTag(undefined);
                    }}
                    role="button"
                  >
                    {useElo.value ? "[use pagerank]" : "[use elo]"}
                  </div>
                  <div
                    className="justify-self-start cursor-pointer border-1 border-gray-300 whitespace-nowrap"
                    onClick={() => {
                      setLocation('/' + tag.value.tag.id + '/' + tag.value.tag.slug + '/graph');
                    }}
                    role="button"
                  >
                    [show graph]
                  </div>
                  <div
                    className="justify-self-start cursor-pointer border-1 border-gray-300 whitespace-nowrap"
                    onClick={() => {
                      showPin.value = !showPin.value;
                    }}
                    role="button"
                  >
                    {showPin.value ? "[hide pin]" : "[show pin]"}
                  </div>
                </div>
                <div className="page-padding-top hidden lg:block">
                  <div className="sticky top-0 z-10">
                    {(editing_item.value || selected_item.value) && 
                      <ItemPanel onClose={onCloseItem} />
                    }
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
      
      {/* Shared Mobile Drawer */}
      {isMobileDevice() && (selected_item.value || editing_item.value) && (
        <Drawer 
          isOpen={drawer_open.value} 
          onClose={() => {
            drawer_open.value = false;
            selected_item.value = null;
            editing_item.value = null;
            onCloseItem?.();
          }}
        >
          <div className="h-full overflow-y-auto">
            <ItemPanel onClose={onCloseItem} />
          </div>
        </Drawer>
      )}

      {/* Show MobileNewItemChooser on mobile when not editing/viewing */}
      {isMobileDevice() && can_add && !isVoting && !selected_item.value && (
        <div className="fixed bottom-4 right-4 z-[99999]">
          <MobileNewItemChooser />
        </div>
      )}
    </>
  );
}; 