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

  const filteredVotes = tag.value?.votes?.filter(v => v.attribute === selected_attribute.value?.value?.id) || [];
  const sorteditems = tag.value?.["sorted"] || [];
  const unsorteditems = tag.value?.["unsorted"] || [];

  return (
    <div className="dark:text-white flex flex-col py-3">
      {isMobileDevice() ? (
        <>
          <div className="w-full flex justify-center flex-col">
            <VotePanel handleError={handleError} isMobile={true} />
            <br /><br />
            <VotesPanel votes={filteredVotes} />
          </div>
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
        </>
      )}

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