import { useEffect, useState } from "react";
import "./App.css";

import { signal, computed, effect } from "@preact/signals-react";
import { VotesPanel } from "./VotesPanel";
import { UserPanel, resetSelectedUsers, selected_users } from "./UserPanel";

import { ErrorPanel } from "./ErrorPanel";
import { VotePanel } from "./VotePanel";
import { ItemPanel, editing_item, pinned_left, pinned_right } from "./ItemPanel";
import { loadTag } from "./Network";
import { Modal } from "./Modal";
import { WarningPopup } from './components/WarningPopup';
import { MetaTags } from "./MetaTags";
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

export const useElo = signal(false);
export const tag = signal(false);
export const selected_item = signal(false);
export const drawer_open = signal(false);

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
export const showPin = signal(false);

export const showAllSorted = signal(true);
export const showAllUnsorted = signal(true);

function App({ tagid, isVoting }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
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
    console.log("handler called");
    if (error.status === 401) {  // unauthorized
      setErrorMessage(error.message);
      setIsModalOpen(true);
    }
  };

  useEffect(() => {
    console.log("Loading tag with ID:", tagid);
    if (!tag.value || tag.value.tag.id !== tagid) {
      loadTag(tagid);
    }
  }, [tagid]);

  return (
    <>
      <div className={`min-h-screen flex flex-col ${isVoting ? 'h-screen' : ''}`}>
        <AnnouncementBar isVoting={isVoting} />
        <div className={`flex-1 ${!isVoting ? 'page-padding-top' : ''}`}>
          {tag.value && (
            <Tag 
              isVoting={isVoting} 
              handleError={handleError}
              onSelectItem={handleSelectItem}
              onCloseItem={handleCloseItem}
            />
          )}
        </div>
      </div>
      <ErrorPanel />
      <WarningPopup isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
        <div className="p-4">
          <h2 className="text-lg font-bold">login required</h2>
          <p>{errorMessage}</p>
        </div>
      </WarningPopup>
    </>
  );
}

export default App;
