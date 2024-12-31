import { signal } from "@preact/signals-react";

export const current_session = signal(null);

export const fetchSession = async () => {
  try {
    const response = await fetch("/api/session", {
      credentials: "include",
    });
    if (response.ok) {
      const data = await response.json();
      current_session.value = data;
    } else {
      current_session.value = null;
    }
  } catch (error) {
    console.error("Failed to fetch session:", error);
    current_session.value = null;
  }
};