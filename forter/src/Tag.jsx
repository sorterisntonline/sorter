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
  const [renderError, setRenderError] = useState(null);
  const [isDataReady, setIsDataReady] = useState(false);

  // Debug output - always run this hook regardless of tag.value state
  useEffect(() => {
    console.log("Tag component mounting with tag.value:", tag.value);
    
    // Validate tag data structure to catch potential issues
    if (!tag.value || typeof tag.value !== 'object') {
      console.error("Tag.jsx: tag.value is not ready yet");
      setIsDataReady(false);
      return;
    }
    
    if (!tag.value.tag) {
      console.error("Tag.jsx: tag.value.tag is missing");
      setIsDataReady(false);
      return;
    }
    
    if (!tag.value.sorted || !tag.value.unsorted) {
      console.error("Tag.jsx: sorted or unsorted items missing", tag.value);
      setIsDataReady(false);
      return;
    }
    
    console.log("Tag.jsx: Data validation passed");
    setIsDataReady(true);
  }, [tag.value]);

  // All hooks must appear before any conditional returns
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

  // After all hooks are defined, we can have conditional returns
  // IMPORTANT: Safety check - if data isn't ready yet, show a loading state
  if (!isDataReady) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-pulse text-gray-500">Loading tag data...</div>
      </div>
    );
  }

  // Now we know tag.value is properly initialized
  const { can_vote = false, can_view = false, can_add = false } = tag.value.perms || {};

  // Wrap the rendering in a try-catch to prevent white screens on render errors
  try {
    if (!can_view) {
      return <div className="p-4 text-center">You do not have permission to view this tag</div>;
    }

    console.log("Tag.jsx: Rendering with tag data", tag.value);

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
              
              <div className="flex lg:flex-row flex-col">
                <div className={`${toggle.value ? 'lg:w-3/4' : 'lg:w-full'} transition-all duration-300`}>
                  <ItemsLists 
                    sorteditems={tag.value.sorted}
                    unsorteditems={tag.value.unsorted}
                    skippedItems={tag.value.skipped}
                    onSelectItem={onSelectItem}
                  />
                </div>
                
                {/* Desktop sidebar */}
                {toggle.value ? (
                  <div className="lg:ml-24 lg:w-1/4">
                    <div className="flex flex-col">
                      {!isMobileDevice() && (
                        <div
                          className="justify-self-start cursor-pointer border-1 border-gray-300 whitespace-nowrap"
                          onClick={() => toggle.value = !toggle.value}
                          role="button"
                        >
                          {"[more space <-]"}
                        </div>
                      )}
                      <div
                        className="justify-self-start cursor-pointer border-1 border-gray-300 whitespace-nowrap"
                        onClick={() => {
                          setLocation('/' + tag.value.tag.id + '/' + tag.value.tag.slug + '/graph');
                        }}
                        role="button"
                      >
                        [show graph]
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
                ) : !isMobileDevice() && (
                  <div
                    className="cursor-pointer border-1 border-gray-300 whitespace-nowrap"
                    onClick={() => toggle.value = !toggle.value}
                    role="button"
                  >
                    {"[->]"}
                  </div>
                )
              }
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
  } catch (error) {
    console.error("Render error in Tag component:", error);
    return (
      <div className="flex flex-col items-center justify-center h-screen p-4">
        <div className="text-red-500 text-xl mb-4">Error rendering content</div>
        <div className="mb-4">{error.message}</div>
        <button 
          className="px-4 py-2 bg-purple-500 text-white rounded"
          onClick={() => window.location.reload()}
        >
          Reload page
        </button>
      </div>
    );
  }
}; 