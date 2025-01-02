import { signal } from "@preact/signals-react";

export const current_session = signal(false);

export const fetchSession = async () => {
  try {
    console.log("Fetching session...");

    const response = await fetch("/api/login", {
      credentials: "include",
    });

    console.log("Response status:", response.status);
    console.log("Response headers:", response.headers);

    if (response.ok) {
      const contentType = response.headers.get("content-type");
      console.log("Content-Type:", contentType);

      if (contentType && contentType.includes("application/json")) {
        const data = await response.json();
        console.log("Session data:", data);
        current_session.value = data;
      } else {
        console.error("Expected JSON response, got:", contentType);
        current_session.value = false;
      }
    } else {
      const errorText = await response.text();
      console.error("Failed to fetch session:", response.statusText);
      console.error("Response body:", errorText);
      current_session.value = false;
    }
  } catch (error) {
    console.error("Failed to fetch session:", error);
    current_session.value = false;
  }
};