import { tag, useElo } from "./App";
import { errors } from "./ErrorPanel";
import { pinned_left, pinned_right } from "./ItemPanel";
import { namespace } from "./main";
import { selected_users } from "./UserPanel";

const buildQueryParams = ({ tagid }) => {
  const tag_id = tagid || (tag.value && tag.value.tag["id"]);
  const users = selected_users.value.map((user) => user.value).join(".");
  const attribute = tag.value && tag.value.selected_attribute;

  const elo = useElo.value;

  const url = new URLSearchParams("");
  if (tag_id && tag_id !== -1) url.append("id", tag_id);
  if (users !== "all") url.append("users", users);
  if (pinned_left.value) url.append("pinned_left", pinned_left.value);
  if (pinned_right.value) url.append("pinned_right", pinned_right.value);
  if (elo) url.append("elo", true);
  if (attribute) url.append("attribute", attribute.title);
  if (namespace.value) url.append("namespace", namespace.value);

  const urlForHistory = new URLSearchParams(window.location.search);
  if (users !== "all") {
    urlForHistory.set("users", users);
  } else {
    urlForHistory.delete("users");
  }

  const currentUrl = new URL(window.location.href);
  const addition =
    urlForHistory.toString() === "" ? "" : "?" + urlForHistory.toString();
  const newUrl = currentUrl.origin + currentUrl.pathname + addition;
  window.history.replaceState({}, "", newUrl);

  return url;
};

export const loadTag = async (id) => {
  // add tagid to query params
  console.log("loadTag", {id});

  if (tag.value) {
    id = id || tag.value.tag["id"];
  }

  if (!id && !namespace.value) return; // called sometimes from profile page when no tag is loaded

  const url = buildQueryParams({ tagid: id });

  try {
    const res = await fetch("/api/tag/page?" + url.toString(), {
      credentials: "include",
    });
    tag.value = await res.json();
  } catch (e) {
    console.log("errror!!");
  }
};

export const makeRequest = async (method, url, body = null) => {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // Include cookies if needed
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  // Check if the response is not ok (status outside 200-299)
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error = new Error(errorData.message || 'An error occurred');
    error.status = response.status;
    throw error;
  }

  // Assuming the response is JSON
  return response.json();
};
