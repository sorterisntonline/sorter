import { makeRequest } from "./Network";
import { ItemFull } from "./ItemPanel";
import { current_session } from "./LoginForm";
import { useEffect } from "react";
import { useStore } from "./Cli";

const calculateMargin = (magnitude) => {
  if (magnitude < 50) {
    return { leftMargin: 50 - magnitude, rightMargin: 0 };
  } else {
    return { leftMargin: 0, rightMargin: magnitude - 50 };
  }
};

export const VotePanel = ({ mutate }) => {
  const { results: tag, magnitude, setMagnitude, pinned_left, pinned_right, setPinnedLeft, setPinnedRight } = useStore();
  
  useEffect(() => {
    if (!tag) return;
    console.log('detected existing vote');
    const existingVote = tag.votes.find(vote => vote.right_item_id === left?.id && vote.left_item_id === right?.id) ||
      tag.votes.find(vote => vote.right_item_id === right?.id && vote.left_item_id === left?.id);

    if (existingVote && existingVote.owner === current_session.value.user_name) {
      if (existingVote.left_item_id === left?.id) {
        setMagnitude(existingVote.magnitude);
      } else {
        setMagnitude(100 - existingVote.magnitude);
      }
    }
  }, [tag?.votes]);

  if (!tag) {
    return null;
  }

  console.log('tag', tag);
  if (tag.pair == undefined) {
    return (
      <div key="3" className="text-xl">
        no pair
      </div>
    );
  }

  if (tag.pair[0] == null || tag.pair[1] == null) {
    return "no pair";
  }

  const left = tag.pair[0];
  const right = tag.pair[1];

  console.log('magnitude', magnitude);
  console.log('left', left);
  console.log('right', right);

  const { leftMargin, rightMargin } = calculateMargin(magnitude);
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
          onClick={() => setPinnedLeft(left.id)}
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
          onClick={() => setPinnedRight(right.id)}
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
        value={magnitude}
        onChange={(e) => {
          setMagnitude(parseInt(e.target.value));
        }}
      />
      <button
        className="bigbutton border-8 w-full h-12 border-purple-500"
        onClick={async () => {
          await makeRequest("POST", "/api/vote", {
            "left_item_id": left["id"],
            "right_item_id": right["id"],
            "magnitude": magnitude,
            "attribute": tag.selected_attribute,
            "tag_id": tag.tags[0]["id"],
          });
          mutate();
          setMagnitude(50);
        }}
      >
        vote
      </button>
    </div>
  );
};
