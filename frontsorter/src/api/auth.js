const API_BASE = '/api';

export class AuthAPI {
  static async getSessionStatus() {
    const response = await fetch(`${API_BASE}/auth/status`, {
      credentials: 'include', // Include cookies
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return response.json();
  }

  static async completeSignup(handle) {
    const response = await fetch(`${API_BASE}/auth/complete-signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ handle }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    
    return response.json();
  }

  static async logout() {
    const response = await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return response.json();
  }

  static async getMe() {
    const response = await fetch(`${API_BASE}/auth/me`, {
      credentials: 'include',
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return response.json();
  }

  static async checkHandleAvailability(handle) {
    const params = new URLSearchParams({ handle });
    const response = await fetch(`${API_BASE}/auth/check-handle?${params}`, {
      credentials: 'include',
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return response.json();
  }

  static getSpotifyLoginUrl() {
    return `${API_BASE}/auth/spotify`;
  }

  static async importRecentSongs() {
    const response = await fetch(`${API_BASE}/auth/import-recent-songs`, {
      method: 'POST',
      credentials: 'include',
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    
    return response.json();
  }
}
