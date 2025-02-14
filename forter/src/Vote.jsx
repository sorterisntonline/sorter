import { items_by_id, tag } from "./App";
import { makeRequest } from "./Network";
import { current_session } from "./session";
import { magnitude } from "./App";

export const Vote = ({ vote, showDelete, onItemClick }) => {
  const leftItem = items_by_id.value[vote["left_item_id"]] || { title: vote.left_title };
  const rightItem = items_by_id.value[vote["right_item_id"]] || { title: vote.right_title };

  const magn = vote["magnitude"];

  const boxWidth = 10; // Adjust the width of the box as needed
  const boxPosition = (magn / 100) * (100 - boxWidth * 3) + boxWidth; // (magnitude / maxMagnitude) * (100 - boxWidth);

  if (leftItem === undefined || rightItem === undefined) {
    return null;
  }

  const handleItemClick = (item) => () => {
    if (onItemClick) {
      onItemClick(item);
    }
  };

  return (
    <tr className="border-yellow-300">
      <td className="text-yellow-500">{"{"}</td>
      <td onClick={handleItemClick(leftItem)} className="text-left cursor-pointer w-1/3">
        {leftItem["title"]}
      </td>
      <td
        className="relative w-80 border"
        style={{ marginLeft: boxWidth, marginRight: boxWidth * 2 }}
      >
        <div
          className="absolute top-1 left-1 bg-yellow-200 h-4 w-1/3"
          style={{
            width: `${boxWidth}%`,
            left: `${boxPosition}%`,
          }}
        ></div>
      </td>
      <td onClick={handleItemClick(rightItem)} className="text-right cursor-pointer w-1/3">
        {rightItem["title"]}
        {(current_session.value && vote["owner"] === current_session.value.user_name && showDelete) ? (
          <button
            className="text-red-500"
            onClick={(e) => {
              e.stopPropagation(); // Prevent item click when deleting
              magnitude.value = 50;
              makeRequest("DELETE", "/api/vote", { vote_id: vote["id"] });
            }}
          >
            [delete]
          </button>
        ) : null}
      </td>
      <td className="text-yellow-500">{"}"}</td>
      <td className="text-blue-500">@{vote.owner}</td>
    </tr>
  );
};
