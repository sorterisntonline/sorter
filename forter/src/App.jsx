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
import WarningPopup from './WarningPopup';
import { MetaTags } from "./MetaTags";

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
  }
  window.history.replaceState({}, "", window.location.pathname + "?" + url.toString());
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
import { IntegrationsPanel } from "./integrations/IntegrationsPanel";
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

  return (
    <div className="flex flex-col text-xl justify-self-start p-2">
      <div className="flex flex-wrap items-center">
        {/* <div className="px-2">sorting of tag</div> */}
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
        <div className="px-2"> according to </div>
        {/* <div className="text-blue-400"> {selected_users.value.map((user) => '@' + user.value).join(", ")} </div> */}
        <UserPanel users={tag.value.users_who_voted} selected_users={selected_users} />
        <div className=""> . </div>
        {(can_vote || can_add) && <div className="px-2"> You can </div>}
        {can_vote && (
          <div className="border-4 border-yellow-400 bigbutton">
            <button
              className=""
              onClick={() => {
                resetSelectedUsers();
                loadTag(undefined);
                if (namespace) {
                  setLocation('/namespace/' + namespace + '/voting');
                } else {
                  setLocation('/' + tag.value.tag.id + '/' + tag.value.tag.slug + '/voting');
                }
              }}
            >
              vote
            </button>
          </div>
        )}
        {can_add && can_vote && <div className="px-2"> or </div>}
        {can_add && (
          <button className={"border-4 border-gray-300 bigbutton"} onClick={popupModal}>
            add an item
          </button>
        )}
        {(can_vote || can_add) && <div className="px-2">.</div>}

      </div>
    </div>
  );
};

export const toggle = signal(true);
export const showPin = signal(false);

export const Tag = ({ showVote, isVoting, handleError }) => {
  const sorteditems = tag.value["sorted"];
  const unsorteditems = tag.value["unsorted"];
  const votes = tag.value["votes"];

  const filteredVotes = votes.filter(v => v.attribute === selected_attribute.value.value.id);

  const [isFeed, setIsFeed] = useState(false);

  const { can_vote, can_view, can_add } = tag.value.perms;

  const [location, setLocation] = useLocation();

  if (!can_view) {
    return <div> you do not have permission to view this tag </div>;
  }

  const sortedtable = (
    <div>
      <div>
        <div>
          <div colSpan="2">sorted items</div>
        </div>
      </div>
      <ol className="list-decimal">
        {sorteditems?.map((item) => (
          <Item key={item["id"]} item={item} />
        )) ?? [
            <div key="2">
              <div>no items </div>
            </div>,
          ]}
      </ol>
    </div>
  );

  const unsortedtable = (
    <div>
      <div>
        <div>
          <div colSpan="2">unsorted items</div>
        </div>
      </div>
      <ol className="list-disc ml-3">
        {unsorteditems?.map((item) => (
          <Item key={item["id"]} item={item} />
        )) ?? [<tr key="2"></tr>]}
      </ol>
    </div>
  );

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
    <div className={" flex flex-col p-3 " + (toggle.value ? "lg:w-2/3" : "lg:w-1/3")}>
      {unsorteditems?.length > 0 ? unsortedtable : <></>}
      {sortedtable}
      {tag.value.skipped.length > 0 ? skippedTable : <></>}
    </div>
  );

  const votingRender = (
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
          <UserPanel users={tag.value.users_who_voted} selected_users={selected_users} />
        </div>
      </div>
      <div className="flex lg:flex-row flex-col">
        <button
          className="border-2 border-red-500 lg:w-14 lg:h-56 w-full bigbutton"
          onClick={() => {
            if (namespace.value) {
              setLocation('/namespace/' + namespace.value);
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
      <div className="flex justify-center w-full">{votesList}</div>
    </div>
  );

  if (isVoting) {
    return votingRender;
  } else {
    return (
      <>
        <MetaTags 
          title={`sorter - #${tag.value.tag.slug}`}
          image="/logoanim_alt1.gif"
        />
        <div className="dark:text-white justify-start">
          <IntegrationsPanel />
          <TextSummary
            can_vote={can_vote}
            can_add={can_add}
          />
          {showVote && <VotePanel handleError={handleError}/>}
          <div className="flex lg:flex-row flex-col">
            {votesList}
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
            <div className={"p-3 " + (toggle.value ? "lg:w-1/3" : "lg:w-2/3")}>
              <ItemPanel />
            </div>
          </div >
        </div >
      </>
    );
  }
};


function App({ tagid, isVoting }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleError = (error) => {
    console.log("handler called");
    if (error.status === 401) {  // unauthorized
      setErrorMessage(error.message);
      setIsModalOpen(true);
    }
  };

  useEffect(() => {
    loadTag(tagid);
  }, []);
  return (
    <>
      {tag.value && <Tag isVoting={isVoting} handleError={handleError}/>}
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
