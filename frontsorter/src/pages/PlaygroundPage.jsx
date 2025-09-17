import { useCallback, useEffect, useMemo, useState } from "react";
import {
  appendPlaygroundItem,
  clearPlayground,
  fetchPlaygroundItems,
} from "../fetchers/playgroundEndpoints";

const DEFAULT_LIST = "default";

function PlaygroundPage() {
  const [items, setItems] = useState([]);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const list = DEFAULT_LIST;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchPlaygroundItems(list);
      setItems(response.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch list");
    } finally {
      setLoading(false);
    }
  }, [list]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!value.trim()) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await appendPlaygroundItem({ value: value.trim(), list });
      setItems(response.items ?? []);
      setValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to append value");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await clearPlayground(list);
      setItems(response.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear list");
    } finally {
      setLoading(false);
    }
  };

  const hasItems = useMemo(() => items.length > 0, [items]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Rama Playground</h1>
        <p className="text-sm text-gray-600">
          Interact with the Rama-backed list using the Rust API layer. Values here
          round-trip through Rama&apos;s REST JSON API before landing in the UI.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">New value</span>
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="mt-1 block w-full rounded border border-gray-300 p-2"
            placeholder="Add something memorable"
            disabled={loading}
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="bg-brand-500 text-white px-4 py-2 rounded disabled:opacity-50"
            disabled={loading}
          >
            Append
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="bg-gray-200 text-gray-800 px-4 py-2 rounded disabled:opacity-50"
            disabled={loading || !hasItems}
          >
            Clear
          </button>
        </div>
      </form>

      {error && <div className="text-sm text-red-600">{error}</div>}

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Current items</h2>
        {loading && <div className="text-sm text-gray-500">Loading…</div>}
        {!loading && !hasItems && (
          <div className="text-sm text-gray-500">No items yet. Add one above!</div>
        )}
        {!loading && hasItems && (
          <ul className="list-disc list-inside space-y-1 text-gray-800">
            {items.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default PlaygroundPage;
