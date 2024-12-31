import { items_by_id, selected_item } from "./App";
import { makeRequest } from "./Network";
import { current_session } from "./session";
import { magnitude } from "./App";

import { tag } from "./App";

export const Vote = ({ vote, showDelete }) => {
  const leftItem = items_by_id.value[vote["left_item_id"]] || { title: vote.left_title };
  const rightItem = items_by_id.value[vote["right_item_id"]] || { title: vote.right_title };

  const magn = vote["magnitude"];

  const boxWidth = 10; // Adjust the width of the box as needed
  const boxPosition = (magn / 100) * (100 - boxWidth * 3) + boxWidth; // (magnitude / maxMagnitude) * (100 - boxWidth);

  if (leftItem === undefined || rightItem === undefined) {
    return null;
  }

  const clicked = (item) => () => {
    selected_item.value = item;
  };

  return (
    <tr className="border-yellow-300">
      <td className="text-yellow-500">{"{"}</td>
      <td onClick={clicked(leftItem)} className="text-left cursor-pointer w-1/3">
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
      <td onClick={clicked(rightItem)} className="text-right cursor-pointer w-1/3">
        {rightItem["title"]}
        {(vote["owner"] === current_session.value.user_name) && showDelete ? (
          <button
            className="text-red-500"
            onClick={() => {
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
