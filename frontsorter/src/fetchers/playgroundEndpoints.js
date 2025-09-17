const BASE_URL = "/api/playground";

function handleError(response) {
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response;
}

export async function fetchPlaygroundItems(list = "default") {
  const params = list ? `?list=${encodeURIComponent(list)}` : "";
  const response = await fetch(`${BASE_URL}/items${params}`);
  const json = await handleError(response).json();
  return json;
}

export async function appendPlaygroundItem({ value, list = "default" }) {
  const response = await fetch(`${BASE_URL}/items`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ value, list }),
  });
  const json = await handleError(response).json();
  return json;
}

export async function clearPlayground(list = "default") {
  const response = await fetch(`${BASE_URL}/clear`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ list }),
  });
  const json = await handleError(response).json();
  return json;
}
