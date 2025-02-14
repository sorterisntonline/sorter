import { useLocation, useParams } from "wouter";
import { VotesPanel } from "./VotesPanel";
import { UserPanel } from "./UserPanel";
import { VotePanel } from "./VotePanel";
import { AttributePanel, selected_attribute } from "./AttributePanel";
import { namespace } from "./main";
import { showAllSorted, showAllUnsorted } from "./App";
import { ItemsLists } from './ItemsLists';
import { tag, toggle } from "./App";
import { Tag } from "./components/Tag";
import { useEffect, useState, useRef } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/solid";
import { ItemPanel } from "./ItemPanel";

const MobileHeader = ({ can_vote, can_add, isVoting }) => {
  const [_, setLocation] = useLocation();
  let namespace = useParams().namespace;

  return (
    <div className="flex flex-col text-xl justify-self-start p-2">
      <div className="flex flex-wrap items-center justify-center lg:justify-start">
        <div
          className="bg-purple-200 text-black dark:text-white dark:bg-purple-950 p-1 cursor-pointer"
        >
          #{tag.value.tag.ns}{tag.value.tag.ns ? '/' : ''}{tag.value.tag.slug}
        </div>
        <div className="px-2">by</div>
        <AttributePanel />
        
        <div className="w-full lg:w-auto text-center lg:text-left lg:px-2">according to</div>
        <UserPanel users={tag.value.users_who_voted} />
      </div>
    </div>
  );
};

export const Voting = ({ handleError }) => {
  const [location, setLocation] = useLocation();
  const isMobileDevice = () => window.innerWidth < 1024;
  const [showVotesPanel, setShowVotesPanel] = useState(false);
  const votesPanelRef = useRef(null);

  const filteredVotes = tag.value?.votes?.filter(v => v.attribute === selected_attribute.value?.value?.id) || [];
  const sorteditems = tag.value?.["sorted"] || [];
  const unsorteditems = tag.value?.["unsorted"] || [];

  const scrollToVotesPanel = () => {
    setShowVotesPanel(true);
  };

  const scrollToVoting = () => {
    setShowVotesPanel(false);
  };

  if (isMobileDevice()) {
    return (
      <div className="h-screen">
        {/* Vote Motion Pane */}
        <div className={`h-screen ${showVotesPanel ? 'hidden' : 'block'}`}>
          <VotePanel handleError={handleError} isMobile={true} />
          
          {/* Navigation Controls */}
          <div className="fixed bottom-4 left-0 right-0 flex justify-center items-center gap-2">
            <button
              className="px-4 py-2 border-2 border-red-500 rounded-lg 
                       bg-white dark:bg-gray-800 shadow-lg
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
            <button
              className="p-1.5 rounded-lg bg-white dark:bg-gray-800 shadow-lg"
              onClick={scrollToVotesPanel}
            >
              <ChevronDownIcon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
          </div>
        </div>

        {/* Votes Panel View */}
        <div 
          ref={votesPanelRef}
          className={`min-h-screen ${showVotesPanel ? 'block' : 'hidden'}`}
        >
          <button
            className="fixed top-4 left-4 z-50 p-1.5 rounded-lg bg-white dark:bg-gray-800 shadow-lg"
            onClick={scrollToVoting}
          >
            <ChevronUpIcon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>

          <div className="pt-16">
            <MobileHeader />
            <div className="pt-4 pb-16">
              <VotesPanel votes={filteredVotes} />
              <div className="flex justify-center w-full">
                <ItemsLists 
                  sorteditems={sorteditems}
                  unsorteditems={unsorteditems}
                  skippedItems={tag.value.skipped}
                />
              </div>
            </div>
          </div>
        </div>
        <ItemPanel />
      </div>
    );
  }

  return (
    <div className="dark:text-white flex flex-col py-3">
      <div className="items-center">
        <div className="text-xl flex flex-row">
          <div className="px-2">
            voting on
          </div>
          <AttributePanel />
          <div className="px-2">
            according to
          </div>
          <UserPanel users={tag.value.users_who_voted} />
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
          stop voting
        </button>
        <div className="w-full flex justify-center flex-col">
          <VotePanel handleError={handleError} />
          <br />
          <VotesPanel votes={filteredVotes} />
        </div>
      </div>

      <div className="flex justify-center w-full pb-16">
        <ItemsLists 
          sorteditems={sorteditems}
          unsorteditems={unsorteditems}
          skippedItems={tag.value.skipped}
        />
      </div>
    </div>
  );
}; 