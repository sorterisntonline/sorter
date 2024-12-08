import { errors } from "./ErrorPanel";

export const makeRequest = async (method, url, data) => {

  try {
    const r = await fetch(url, {
      method: method,

      cors: "no-cors",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!r.ok) {
      throw await r.json();
    }
  } catch (e) {
    errors.value = [e, ...errors.value];
  }
};
