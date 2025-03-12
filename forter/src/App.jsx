import { useEffect, useState } from "react";
import "./App.css";

import { signal, computed, effect } from "@preact/signals-react";
import { VotesPanel } from "./VotesPanel";
import { UserPanel, resetSelectedUsers, selected_users } from "./UserPanel";

import { ErrorPanel } from "./ErrorPanel";
import { VotePanel } from "./VotePanel";
import { ItemPanel, editing_item } from "./ItemPanel";
import { loadTag } from "./Network";
import { Modal } from "./Modal";
import { WarningPopup } from './components/WarningPopup';
import AnnouncementBar, { showAnnouncement } from './components/AnnouncementBar';
import { IntegrationsPanel } from './integrations/IntegrationsPanel';
import { MobileNewItemChooser } from './components/MobileNewItemChooser';
import { errorState, clearError } from './ErrorHandler';
import { useLocation, useParams } from "wouter";
import { TagPreferences } from "./TagPreferences";
import { AttributePanel, selected_attribute } from "./AttributePanel";
import { namespace } from "./main";
import { Voting } from './Voting';
import { ItemsLists } from './ItemsLists';
import { Tag } from './Tag';
import { Item } from './Item';
import { TextSummary } from './components/TextSummary';

export const tag = signal(false);
export const selected_item = signal(false);
export const drawer_open = signal(false);
export const current_attribute = signal(null);

export const items_by_id = computed(() => {
  if (!tag.value) return {};

  const items_by_id = {};

  for (const item of tag.value.unsorted) {
    items_by_id[item["id"]] = item;
  }

  for (const item of tag.value.sorted) {
    items_by_id[item["id"]] = item;
  }

  return items_by_id;
});

export const magnitude = signal(50);

const computeSelectedItem = (tag, url) => {
  if (!tag) return false;
  return tag.sorted.concat(tag.unsorted).filter((item) => {
    return item["id"] == url;
  })[0] ?? false;
}
const url = new URLSearchParams(window.location.search).get("item");

effect(() => {
  selected_item.value = computeSelectedItem(
    tag.value,
    new URLSearchParams(window.location.search).get("item")
  );
});

effect(() => {
  const url = new URLSearchParams(window.location.search);
  if (selected_item.value) {
    url.set("item", selected_item.value["id"]);
    window.history.replaceState({}, "", window.location.pathname + "?" + url.toString(), { preventScroll: true });
    if (window.innerWidth < 1024) {
      drawer_open.value = true;
    }
  } else {
    drawer_open.value = false;
  }
});

const truncateText = (text, length) => {
  if (text.length > length) {
    return text.substring(0, length) + "...";
  }
  return text;
};

export const toggle = signal(true);

export const showAllSorted = signal(true);
export const showAllUnsorted = signal(true);

function App({ tagid, isVoting }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [location] = useLocation();
  const isMobileDevice = () => window.innerWidth < 1024;

  const handleSelectItem = (item) => {
    selected_item.value = item;
    if (isMobileDevice()) {
      drawer_open.value = true;
    }
  };

  const handleCloseItem = () => {
    drawer_open.value = false;
    // Small delay to let drawer animation complete
    setTimeout(() => {
      selected_item.value = false;
    }, 100);
  };

  const handleError = (error) => {
    console.log("handler called", error);
    setLoadError(error);
    if (error.status === 401) {  // unauthorized
      setErrorMessage(error.message);
      setIsModalOpen(true);
    }
  };

  useEffect(() => {
    console.log("Loading tag with ID:", tagid);
    if (tagid) {
      setIsLoading(true);
      setLoadError(null);
      
      // Reset tag value to prevent stale data during loading
      tag.value = false;
      
      loadTag(tagid, handleError)
        .then(data => {
          console.log("Load successful, tag data:", data);
          // Validate data structure
          if (!data || !data.tag || !data.sorted || !data.unsorted) {
            console.error("Data missing required properties:", data);
            setLoadError(new Error("Invalid data structure received from server"));
          }
        })
        .catch(err => {
          console.error("Load failed:", err);
          setLoadError(err);
        })
        .finally(() => {
          setIsLoading(false);
          console.log("Final tag.value state:", tag.value);
        });
    }
  }, [tagid]);

  // Reset selected users when tag changes
  useEffect(() => {
    resetSelectedUsers();
  }, [tag.value]);

  // Track the current tag ID
  const [currentTagId, setCurrentTagId] = useState(null);
  
  // Update current tag ID when tag changes
  useEffect(() => {
    if (tag.value?.tag?.id !== currentTagId) {
      setCurrentTagId(tag.value?.tag?.id);
    }
  }, [tag.value]);

  // Set default attribute when tag ID changes
  useEffect(() => {
    if (currentTagId && tag.value) {
      // Only set default attribute if none is currently selected
      if (!current_attribute.value && tag.value.attributes?.length > 0) {
        current_attribute.value = tag.value.attributes[0];
      }
    }
  }, [currentTagId]);

  // Show loading spinner while data is being fetched
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-white dark:bg-black">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  // Show error state
  if (loadError || !tag.value) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-white dark:bg-black text-black dark:text-white p-6">
        <div className="text-red-500 text-2xl mb-4">Error loading content</div>
        <div className="mb-4">{loadError?.message || "Failed to load data"}</div>
        <button 
          className="px-4 py-2 bg-purple-500 text-white rounded"
          onClick={() => window.location.reload()}
        >
          Reload page
        </button>
      </div>
    );
  }

  console.log("Ready to render with tag:", tag.value);

  // Basic structure with fallback
  return (
    <div className="flex flex-col h-full bg-white dark:bg-black text-black dark:text-white">
      {/* Error panel */}
      {errorState.value && (
        <ErrorPanel
          error={errorState.value}
          onClose={clearError}
        />
      )}
      
      {/* Test banner to ensure rendering works */}
      <div className="p-4 bg-purple-500 text-white text-center font-bold">
        Tag ID: {tag.value?.tag?.id} - {tag.value?.tag?.slug}
      </div>
      
      {/* Try rendering the voting view or main content */}
      <div className="flex-grow overflow-auto">
        {isVoting ? (
          <Voting tagid={tagid} handleError={handleError} />
        ) : (
          <Tag
            isVoting={isVoting}
            handleError={handleError}
            onSelectItem={handleSelectItem}
            onCloseItem={handleCloseItem}
          />
        )}
      </div>
    </div>
  );
}

export default App;
