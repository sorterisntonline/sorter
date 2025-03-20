import { tag } from "./App";
import { errors } from "./ErrorPanel";
import { namespace } from "./main";
import { selected_users } from "./UserPanel";
import { handleApiError } from './ErrorHandler';
import { current_attribute } from "./App";

const buildQueryParams = ({ tagid }) => {
  const tag_id = tagid || (tag.value && tag.value.tag["id"]);
  const users = Array.isArray(selected_users.value) 
    ? selected_users.value.map((user) => user.value).join(".")
    : "all";
  const attribute = current_attribute.value;

  const url = new URLSearchParams("");
  if (tag_id && tag_id !== -1) url.append("id", tag_id);
  if (users !== "all") url.append("users", users);
  if (attribute) url.append("attribute", attribute.title);
  if (namespace.value) url.append("namespace", namespace.value);

  const urlForHistory = new URLSearchParams(window.location.search);
  if (users !== "all") {
    urlForHistory.set("users", users);
  } else {
    urlForHistory.delete("users");
  }

  const currentUrl = new URL(window.location.href);
  const addition = urlForHistory.toString() === "" ? "" : "?" + urlForHistory.toString();
  const newUrl = currentUrl.origin + currentUrl.pathname + addition;
  
  // Add preventScroll option
  window.history.replaceState({}, "", newUrl, { preventScroll: true });

  return url;
};

export const loadTag = async (id, errorCallback) => {
  console.log("loadTag", {id});

  if (tag.value) {
    id = id || tag.value.tag["id"];
  }

  if (!id && !namespace.value) return Promise.resolve();

  const url = buildQueryParams({ tagid: id });
  console.log("Requesting with URL params:", url.toString());

  try {
    window.scrollTo(0, 0);  // Force scroll to top before loading
    console.log("Fetching from:", "/api/tag/page?" + url.toString());
    
    const res = await fetch("/api/tag/page?" + url.toString(), {
      credentials: "include",
    });
    
    console.log("Response status:", res.status, res.statusText);
    console.log("Response headers:", [...res.headers.entries()]);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.error("Error response:", errorText);
      throw { status: res.status, message: errorText };
    }
    
    console.log("Parsing JSON response...");
    const data = await res.json();
    console.log("JSON parsed successfully");
    
    // Validate basic data structure
    if (!data || typeof data !== 'object') {
      console.error("Received invalid data:", data);
      throw new Error("Invalid data received from server");
    }
    
    if (!data.tag) {
      console.error("Missing tag property:", data);
      throw new Error("Data missing required tag property");
    }
    
    console.log("Setting tag.value with valid data");
    tag.value = data;
    console.log("tag.value set successfully:", tag.value);
    
    return data;
  } catch (e) {
    console.error("Error in loadTag:", e);
    handleApiError(e);
    errors.value = [...errors.value, { message: `Failed to load tag: ${e.message || e}` }];
    
    // Call errorCallback if provided
    if (typeof errorCallback === 'function') {
      errorCallback(e);
    }
    
    // Re-throw to allow promise chaining
    throw e;
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

// Example API call
const fetchData = async () => {
  try {
    const response = await fetch('/api/data');
    if (!response.ok) {
      throw { status: response.status, message: await response.text() };
    }
    return await response.json();
  } catch (error) {
    handleApiError(error);
    throw error;
  }
};
