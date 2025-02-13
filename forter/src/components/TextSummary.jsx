import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { editing_item } from "../ItemPanel";
import { tag, selected_item } from "../App";
import { resetSelectedUsers } from "../UserPanel";
import { UserPanel } from "../UserPanel";
import { AttributePanel } from "../AttributePanel";
import { Modal } from "../Modal";
import { TagPreferences } from "../TagPreferences";

export const TextSummary = ({ can_vote, can_add }) => {
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