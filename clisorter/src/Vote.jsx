import { makeRequest } from "./Network";
import { current_session } from "./LoginForm";
import { useStore } from "./Cli";

export const Vote = ({ vote, showDelete, mutate}) => {
  console.log(vote);
  const items_by_id = useStore(state => state.items_by_id);
  
  const leftItem = items_by_id[vote["left_item_id"]];
  const rightItem = items_by_id[vote["right_item_id"]];

  console.log('items_by_id', items_by_id);
  console.log(leftItem, rightItem);

  const magn = vote["magnitude"];
  const boxWidth = 10;
  const boxPosition = (magn / 100) * (100 - boxWidth * 3) + boxWidth;

  if (leftItem === undefined || rightItem === undefined) {
    return null;
  }

  return (
    <tr className="border-yellow-300">
      <td className="text-left cursor-pointer w-1/3">
        {leftItem["title"]}
      </td>
      <td
        className="relative w-80 border"
        style={{ marginLeft: boxWidth, marginRight: boxWidth * 2 }}
      >
        <div
          className="absolute top-1 left-1 bg-purple-600 h-4 w-1/3"
          style={{
            width: `${boxWidth}%`,
            left: `${boxPosition}%`,
          }}
        ></div>
      </td>
      <td className="text-right cursor-pointer w-1/3">
        {rightItem["title"]}
        {(vote["owner"] === current_session.value.user_name) && showDelete ? (
          <button
            className="text-red-500"
            onClick={() => {
              makeRequest("DELETE", "/api/vote", { vote_id: vote["id"] });
              mutate();
            }}
          >
            [delete]
          </button>
        ) : null}
      </td>
      <td className="text-blue-500">@{vote.owner}</td>
    </tr>
  );
};
