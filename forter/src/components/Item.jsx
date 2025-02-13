import { signal } from "@preact/signals-react";
import { selected_item, toggle } from "../App";
import { pinned_left, pinned_right } from "../ItemPanel";
import { showPin } from "../App";

const formatNumber = (number) => {
  // take only 3 digits
  var num = Math.round(number * 100) / 100;
  return num;
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

  const truncateText = (text, length) => {
    if (text.length > length) {
      return text.substring(0, length) + "...";
    }
    return text;
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
        <div className="flex justify-between">
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
              <div className="float-right text-gray-500">{item.num_comments > 0 ? <>{item.num_comments} comments</> : <></>} {item.vote_count} votes</div>}
            {showPin.value && <div className="text-gray-500">
              <input
                type="checkbox"
                checked={item.id === pinned_left.value}
                onChange={() => {
                  if (item.id === pinned_right.value) {
                    pinned_right.value = null;
                  }
                  pinned_left.value = item.id === pinned_left.value ? null : item.id;
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
                }}
              />
            </div>}
          </td>
        </div>
      </li>
    </>
  );
}; 