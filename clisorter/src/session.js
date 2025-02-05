import { signal } from "@preact/signals-react";

export const current_session = signal(false);

export async function fetchSession() {
  try {
    const response = await fetch("/api/login", {
      credentials: "include",
    });
    if (response.ok) {
      const data = await response.json();
      current_session.value = data;
    } else {
      current_session.value = false;
    }
  } catch (error) {
    console.error("Failed to fetch session:", error);
    current_session.value = false;
  }
} 