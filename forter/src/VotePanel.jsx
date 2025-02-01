import { makeRequest, loadTag } from "./Network";
import { tag, magnitude } from "./App";
import { ItemFull } from "./ItemPanel";
import { current_session } from "./session";
import { useEffect, useState } from "react";
import WarningPopup from "./WarningPopup";

const calculateMargin = (magnitude) => {
  if (magnitude < 50) {
    return { leftMargin: 50 - magnitude, rightMargin: 0 };
  } else {
    return { leftMargin: 0, rightMargin: magnitude - 50 };
  }
};

export const VotePanel = ({ handleError }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (tag.value.pair === undefined)
    return (
      <div key="3" className="text-xl">
        no pair
      </div>
    );

  if (tag.value.pair[0] == null || tag.value.pair[1] == null) {
    return <div>no pair</div>;
  }

  const left = tag.value.pair[0];
  const right = tag.value.pair[1];

  useEffect(() => {
    console.log('detected existing vote');
    const existingVote = tag.value.votes.find(vote => vote.right_item_id === left.id && vote.left_item_id === right.id) ||
      tag.value.votes.find(vote => vote.right_item_id === right.id && vote.left_item_id === left.id);

    if (existingVote && current_session.value !== null && existingVote.owner === current_session.value.user_name) {
      if (existingVote.left_item_id === left.id) {
        magnitude.value = existingVote.magnitude;
      } else {
        magnitude.value = 100 - existingVote.magnitude;
      }
    }
  }, [tag.value.votes]);

  console.log('magnitude.value', magnitude.value);
  console.log('left', left);
  console.log('right', right);

  const { leftMargin, rightMargin } = calculateMargin(magnitude.value);
  return (
    <div className="w-full justify-center">
      <div className="text-xl flex flex-row items-end">
        <div
          className="flex-1"
          style={{
            left: 0,
            width: "50%",
            marginBottom: leftMargin,
          }}
        >
          <ItemFull item={left} />
        </div>
        <div
          className="flex-2"
          style={{
            right: 0,
            width: "50%",
            marginBottom: rightMargin,
            justifyContent: "right",
          }}
        >
          <ItemFull item={right} right={true} />
        </div>
      </div>
      <input
        className="w-full h-10 bg-gray-300 dark:bg-gray-600 appearance-none cursor-pointer"
        type="range"
        style={{}}
        min="0"
        max="100"
        step="1"
        value={magnitude.value}
        onChange={(e) => {
          magnitude.value = parseInt(e.target.value);
        }}
      />
      <button
        className="bigbutton border-8 w-full h-12 border-yellow-500"
        onClick={async () => {
          try {
            await makeRequest("POST", "/api/vote", {
              "left_item_id": left["id"],
              "right_item_id": right["id"],
              "magnitude": magnitude.value,
              "attribute": tag.value.selected_attribute,
              "tag_id": tag.value.tag["id"],
            });

            magnitude.value = 50;
            await loadTag(tag.value.tag["id"]); // reload tag to update vote
          } catch (error) {
            console.log("Error caught in VotePanel:", error);
            handleError(error);
          }
        }}
      >
        vote
      </button>
      {/* WarningPopup is now managed by App.jsx */}
    </div>
  );
};
