const API_BASE_URL = '/api';

export const searchAPI = {
  search: async (query) => {
    try {
      const response = await fetch(`${API_BASE_URL}/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Search API error:', error);
      throw error;
    }
  }
};