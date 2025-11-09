const API_BASE = '/api';

export class RankingAPI {
  /**
   * Get ranking for children of a given entity (generic, works for any namespace)
   */
  static async getRanking(ns: string, pk: string) {
    const params = new URLSearchParams({
      ns,
      pk,
    });
    const response = await fetch(`${API_BASE}/rank/rank?${params}`, {
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get ranking history snapshots for children of a given entity
   */
  static async getRankingHistory(ns: string, pk: string) {
    const params = new URLSearchParams({
      ns,
      pk,
    });
    const response = await fetch(`${API_BASE}/rank/history?${params}`, {
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }
}

