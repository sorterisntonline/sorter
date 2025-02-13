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
import WarningPopup from './components/WarningPopup';
import { MetaTags } from "./MetaTags";
import AnnouncementBar, { showAnnouncement } from './components/AnnouncementBar';
import { IntegrationsPanel } from './integrations/IntegrationsPanel';
import { MobileNewItemChooser } from './components/MobileNewItemChooser';
import { errorState, clearError } from './ErrorHandler';

export const useElo = signal(false);
export const tag = signal(false);

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

const formatNumber = (number) => {
  //var num = number * tag.value.sorted.length;

  // take only 3 digits
  var num = Math.round(number * 100) / 100;

  return num;
};
const computeSelectedItem = (tag, url) => {
  if (!tag) return false;
  return tag.sorted.concat(tag.unsorted).filter((item) => {
    return item["id"] == url;
  })[0] ?? false;
}
const url = new URLSearchParams(window.location.search).get("item");
export const selected_item = signal(false);

effect(() => {
  selected_item.value = computeSelectedItem(
    tag.value,
    new URLSearchParams(window.location.search).get("item"));
})

effect(() => {
  const url = new URLSearchParams(window.location.search);
  if (selected_item.value) {
    url.set("item", selected_item.value["id"]);
    window.history.replaceState({}, "", window.location.pathname + "?" + url.toString(), { preventScroll: true });
  }
})

const truncateText = (text, length) => {
  if (text.length > length) {
    return text.substring(0, length) + "...";
  }
  return text;
};

export const Item = ({ item }) => {
  const onClick = () => {
    const url = new URLSearchParams(window.location.search);
    if (selected_item.value === item) {
      selected_item.value = false;
      url.delete("item");
    } else {
      selected_item.value = item;
      url.set("item", selected_item.value["id"]);
    }
    window.history.replaceState({}, "", window.location.pathname + "?" + url.toString());
  };

  return (
    <>
      <li
        id={`item-${item.id}`}
        className={
          `cursor-pointer text-left border-b border-dashed ml-4 border-gray-200 dark:border-gray-800 dark:hover:border-gray-200 ` +
          (item === selected_item.value ? "bg-gray-300 dark:bg-gray-700" : "")
        }
        onClick={onClick}
      >
        <div class="flex justify-between">
          <div>
            {item.elo === undefined ? (
              <></>
            ) : (
              <td className="px-4">{formatNumber(item.elo)}</td>
            )}
            <td>{truncateText(item["title"], toggle.value ? 99999 : 15)}</td>

          </div>
          <td className="flex">

          {item.vote_count &&
              <div class="float-right text-gray-500">{item.num_comments > 0 ? <>{item.num_comments} comments</> : <></>} {item.vote_count} votes</div>}
            {showPin.value && <div class="text-gray-500">
              <input
                type="checkbox"
                checked={item.id === pinned_left.value}
                onChange={() => {
                  if (item.id === pinned_right.value) {
                    pinned_right.value = null;
                  }
                  pinned_left.value = item.id === pinned_left.value ? null : item.id;

                  const items = tag.value.unsorted.concat(tag.value.sorted);
                  const left = items.find(i => i.id === pinned_left.value);
                  tag.value = {...tag.value, pair: [left, tag.value.pair[1]]};
                }}
              />
              <input
                type="checkbox"
                checked={item.id === pinned_right.value}
                onChange={() => {
                  if (item.id === pinned_left.value) {
                    pinned_left.value = null;
                  }
                  pinned_right.value = item.id === pinned_right.value ? null : item.id;

                  const items = tag.value.unsorted.concat(tag.value.sorted);
                  const right = items.find(i => i.id === pinned_right.value);
                  tag.value = {...tag.value, pair: [tag.value.pair[0], right]};
                }}
              />
            </div>}
          </td>
        </div>
      </li>
    </>
  );
};

import { useLocation, useParams } from "wouter";
import { TagPreferences } from "./TagPreferences";
import { AttributePanel, selected_attribute } from "./AttributePanel";
import { namespace } from "./main";
const TextSummary = ({ can_vote, can_add }) => {
  const [_, setLocation] = useLocation();
  let namespace = useParams().namespace;

  const popupModal = () => {
    editing_item.value = {};
    selected_item.value = false;
  };

  const [isViewingTag, setIsViewingTag] = useState(false);

  const handleVoteNavigation = (namespace, setLocation) => {
    console.log("Vote button clicked");
    resetSelectedUsers();
    if (namespace) {
      setLocation('/namespace/' + namespace + '/voting');
    } else {
      setLocation('/' + tag.value.tag.id + '/' + tag.value.tag.slug + '/voting');
    }
    console.log("New location set");
  };

  return (
    <div className="flex flex-col text-xl justify-self-start p-2">
      <div className="flex flex-wrap items-center justify-center lg:justify-start">
        <div
          className="bg-purple-200 text-black dark:text-white dark:bg-purple-950 p-1 cursor-pointer"
          onClick={() => setIsViewingTag(true)}
        >
          #{tag.value.tag.ns}{tag.value.tag.ns ? '/' : ''}{tag.value.tag.slug}
        </div>
        <Modal isOpen={isViewingTag} onClose={() => setIsViewingTag(false)}>
          <TagPreferences onSubmit={() => setIsViewingTag(false)} />
        </Modal>
        <div className="px-2">by</div>
        <AttributePanel />
        
        {/* Desktop-only period */}
        <div className="hidden lg:block px-2">.</div>
        
        <div className="w-full lg:w-auto text-center lg:text-left lg:px-2">according to</div>
        <UserPanel users={tag.value.users_who_voted} />
        
        {/* Desktop-only content */}
        <div className="hidden lg:flex items-center">
          <div className="px-2">.</div>
          {(can_vote || can_add) && <div className="px-2">You can</div>}
          {can_vote && (
            <div className="border-4 border-yellow-400 bigbutton">
              <button
                onClick={() => handleVoteNavigation(namespace, setLocation)}
              >
                vote
              </button>
            </div>
          )}
          {can_add && can_vote && <div className="px-2">or</div>}
          {can_add && (
            <button className="border-4 border-gray-300 bigbutton" onClick={popupModal}>
              add an item
            </button>
          )}
          {(can_vote || can_add) && <div className="px-2">.</div>}
        </div>

        {/* Mobile-only vote button */}
        {can_vote && (
          <div className="w-full lg:hidden mt-4">
            <button
              onClick={() => handleVoteNavigation(namespace, setLocation)}
              className="w-full py-4 font-bold border-4 border-yellow-400 bg-transparent text-inherit"
            >
              vote
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export const toggle = signal(true);
export const showPin = signal(false);

export const showAllSorted = signal(true);
export const showAllUnsorted = signal(true);

// Extract the mobile header into its own component
const MobileHeader = ({ can_vote, can_add, isVoting }) => {
  const [_, setLocation] = useLocation();
  let namespace = useParams().namespace;

  const handleVoteNavigation = (namespace, setLocation) => {
    console.log("Vote button clicked");
    resetSelectedUsers();
    if (namespace) {
      setLocation('/namespace/' + namespace + '/voting');
    } else {
      setLocation('/' + tag.value.tag.id + '/' + tag.value.tag.slug + '/voting');
    }
    console.log("New location set");
  };

  return (
    <div className="flex flex-col text-xl justify-self-start p-2">
      <div className="flex flex-wrap items-center justify-center lg:justify-start">
        <div
          className="bg-purple-200 text-black dark:text-white dark:bg-purple-950 p-1 cursor-pointer"
          onClick={() => setIsViewingTag(true)}
        >
          #{tag.value.tag.ns}{tag.value.tag.ns ? '/' : ''}{tag.value.tag.slug}
        </div>
        <div className="px-2">by</div>
        <AttributePanel />
        
        <div className="w-full lg:w-auto text-center lg:text-left lg:px-2">according to</div>
        <UserPanel users={tag.value.users_who_voted} />
        
        {/* Only show vote button if we're not in voting view */}
        {!isVoting && can_vote && (
          <div className="w-full lg:hidden mt-4">
            <button
              onClick={() => handleVoteNavigation(namespace, setLocation)}
              className="w-full py-4 font-bold border-4 border-yellow-400 bg-transparent text-inherit"
            >
              vote
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export const Tag = ({ isVoting, handleError }) => {
  console.log("=== Tag Component Debug ===");
  console.log("Props:", { isVoting });
  console.log("Permissions:", tag.value?.perms);
  
  const { can_vote = false, can_view = false, can_add = false } = tag.value?.perms || {};
  console.log("Derived permissions:", { can_vote, can_view, can_add });

  const [showVote, setShowVote] = useState(false);
  const [showItemPanel, setShowItemPanel] = useState(false);
  const [showAllSorted, setShowAllSorted] = useState(false);
  const [showAllUnsorted, setShowAllUnsorted] = useState(false);

  const sorteditems = tag.value?.["sorted"] || [];
  const unsorteditems = tag.value?.["unsorted"] || [];
  const votes = tag.value?.["votes"] || [];

  const filteredVotes = votes.filter(v => v.attribute === selected_attribute.value?.value?.id);

  const [isFeed, setIsFeed] = useState(false);
  const [location, setLocation] = useLocation();

  const isMobileDevice = () => window.innerWidth < 1024; // 1024px is the 'lg' breakpoint in Tailwind

  if (!tag.value || !can_view) {
    return <div>you do not have permission to view this tag</div>;
  }

  const SortedList = ({ items, showAll, setShowAll }) => {
    const displayCount = 25;
    const hasMore = items?.length > displayCount;
    const displayItems = !showAll && hasMore ? items?.slice(0, displayCount) : items;

    return (
      <div>
        <div>
          <div>
            <div colSpan="2">sorted items</div>
          </div>
        </div>
        <ol className="list-decimal">
          {displayItems?.map((item) => (
            <Item key={item["id"]} item={item} />
          )) ?? [
            <div key="2">
              <div>no items </div>
            </div>,
          ]}
        </ol>
        {hasMore && (
          <button 
            onClick={() => setShowAll(!showAll)}
            className="w-full text-center text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            {showAll ? '[show less]' : '[show more]'}
          </button>
        )}
      </div>
    );
  };

  const UnsortedList = ({ items, showAll, setShowAll }) => {
    const displayCount = 25;
    const hasMore = items?.length > displayCount;
    const displayItems = !showAll && hasMore ? items?.slice(0, displayCount) : items;

    return (
      <div>
        <div>
          <div>
            <div colSpan="2">unsorted items</div>
          </div>
        </div>
        <ol className="list-disc ml-3">
          {displayItems?.map((item) => (
            <Item key={item["id"]} item={item} />
          )) ?? [<tr key="2"></tr>]}
        </ol>
        {hasMore && (
          <button 
            onClick={() => setShowAll(!showAll)}
            className="w-full text-center text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            {showAll ? '[show less]' : '[show more]'}
          </button>
        )}
      </div>
    );
  };

  const skippedTable = (
    <div>
      <div>
        <div>
          <div colSpan="2">skipped items</div>
        </div>
      </div>
      <ol className="list-disc ml-3">
        {tag.value.skipped?.map((item) => (
          <Item key={item["id"]} item={item} />
        )) ?? [<tr key="2"></tr>]}
      </ol>
    </div>
  );

  const votesList = (
    <div className={" p-3 " + (toggle.value ? "lg:w-2/3" : "lg:w-1/3")}>
      <div className="lg:flex lg:space-x-12">
        {/* Show ItemPanel above lists on mobile when editing */}
        {isMobileDevice() && editing_item.value && (
          <div className="mb-4">
            <ItemPanel />
          </div>
        )}
        
        {sorteditems?.length > 0 && (
          <div className={unsorteditems?.length > 0 ? "lg:w-1/2" : "lg:w-full"}>
            <SortedList 
              items={sorteditems} 
              showAll={showAllSorted.value} 
              setShowAll={(val) => showAllSorted.value = val} 
            />
          </div>
        )}
        {unsorteditems?.length > 0 && (
          <div className={sorteditems?.length > 0 ? "lg:w-1/2" : "lg:w-full"}>
            <UnsortedList 
              items={unsorteditems} 
              showAll={showAllUnsorted.value} 
              setShowAll={(val) => showAllUnsorted.value = val} 
            />
          </div>
        )}
      </div>
      {tag.value.skipped?.length > 0 ? skippedTable : null}
    </div>
  );

  const votingRender = (
    <div className="dark:text-white flex flex-col py-3">
      {isMobileDevice() ? (
        <>
          <MobileHeader can_vote={can_vote} can_add={can_add} isVoting={true} />
          <div className="w-full flex justify-center flex-col">
            <VotePanel handleError={handleError} />
            <br />
            <VotesPanel votes={filteredVotes} />
          </div>
          {/* Tab-style stop voting button for mobile */}
          <button
            className="fixed bottom-0 left-1/2 transform -translate-x-1/2 px-4 py-1.5 
                       border-2 border-red-500 border-b-0 rounded-t-lg 
                       bg-white dark:bg-gray-800 shadow-lg z-50 
                       text-sm font-normal lowercase"
            onClick={() => {
              const ns = namespace.value;
              if (ns) {
                setLocation('/namespace/' + ns);
              } else {
                setLocation('/' + tag.value.tag.id + '/' + tag.value.tag.slug);
              }
            }}
          >
            stop voting
          </button>
        </>
      ) : (
        <>
          <div className="items-center">
            <div className="text-xl flex flex-row">
              <div className="px-2">
                voting on
              </div>
              <AttributePanel />
              <div className="px-2">
                according to
              </div>
              <UserPanel 
                users={tag.value.users_who_voted} 
                selected_users={selected_users.value} 
              />
            </div>
          </div>

          <div className="flex lg:flex-row flex-col">
            <button
              className="border-2 border-red-500 lg:w-14 lg:h-56 w-full bigbutton"
              onClick={() => {
                const ns = namespace.value;
                if (ns) {
                  setLocation('/namespace/' + ns);
                } else {
                  setLocation('/' + tag.value.tag.id + '/' + tag.value.tag.slug);
                }
              }}
            >
              Stop Voting
            </button>
            <div className="w-full flex justify-center flex-col">
              <VotePanel handleError={handleError} />
              <br />
              <VotesPanel votes={filteredVotes} />
            </div>
          </div>
        </>
      )}

      {/* Lists section */}
      <div className="flex justify-center w-full pb-16"> {/* Added padding to avoid button overlap */}
        {votesList}
      </div>
    </div>
  );

  useEffect(() => {
    // Check for newItem param and open ItemPanel if present
    const params = new URLSearchParams(window.location.search);
    if (params.get('newItem') === 'true') {
      editing_item.value = {};
      // Clear the param
      params.delete('newItem');
      window.history.replaceState({}, "", window.location.pathname + "?" + params.toString());
    }
  }, [location]); // Add location to dependencies if using wouter's useLocation

  if (isVoting) {
    return votingRender;
  } else {
    return (
      <>
        <MetaTags 
          title={`sorter - #${tag.value.tag.slug}`}
          image="/logoanim.gif"
        />
        <div className="dark:text-white justify-start">
          <IntegrationsPanel />
          {isMobileDevice() ? (
            <MobileHeader can_vote={can_vote} can_add={can_add} isVoting={false} />
          ) : (
            <TextSummary can_vote={can_vote} can_add={can_add} />
          )}
          <div className="flex lg:flex-row flex-col lg:space-x-24">
            {votesList}
            {/* Only show ItemPanel in sidebar on desktop */}
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
                  <ItemPanel />
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Show MobileNewItemChooser on mobile when not voting */}
        {isMobileDevice() && can_add && !isVoting && (
          <div className="fixed bottom-4 right-4 z-[99999]">
            <MobileNewItemChooser />
          </div>
        )}
        
        <WarningPopup 
          isOpen={errorState.value.isOpen}
          onClose={clearError}
          duration={errorState.value.duration}
          showLogin={errorState.value.showLogin}
        >
          {errorState.value.message}
        </WarningPopup>
      </>
    );
  }
};

function App({ tagid, isVoting }) {
  console.log("=== App Debug ===");
  console.log("Props:", { tagid, isVoting });
  console.log("Tag value:", tag.value);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [location] = useLocation();

  const handleError = (error) => {
    console.log("handler called");
    if (error.status === 401) {  // unauthorized
      setErrorMessage(error.message);
      setIsModalOpen(true);
    }
  };

  useEffect(() => {
    console.log("Loading tag with ID:", tagid);
    // Only load tag if we don't already have it or if the ID changed
    if (!tag.value || tag.value.tag.id !== tagid) {
      loadTag(tagid);
    }
  }, [tagid]);

  return (
    <div className="min-h-screen flex flex-col">
      <AnnouncementBar />
      <div className="flex-1 page-padding-top">
        {tag.value && <Tag isVoting={isVoting} handleError={handleError}/>}
        <ErrorPanel />
        <WarningPopup isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
          <div className="p-4">
            <h2 className="text-lg font-bold">login required</h2>
            <p>{errorMessage}</p>
          </div>
        </WarningPopup>
      </div>
    </div>
  );
}

export default App;
