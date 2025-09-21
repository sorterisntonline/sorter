import type {
  CompleteSignupRequest,
  CompleteSignupResponse,
  HandleAvailabilityResponse,
  ImportRecentSongsResponse,
  LogoutResponse,
  RankingHistoryResponse,
  RankingResponse,
  SessionStatusResponse,
  SpotifySong,
  User,
} from '../types/generated/index.js'

const API_BASE = '/api' as const

async function ensureOk(response: Response): Promise<void> {
  if (!response.ok) {
    let message = `HTTP ${response.status}`
    try {
      const payload = (await response.json()) as { error?: string }
      if (payload?.error) {
        message = payload.error
      }
    } catch {
      // ignore JSON parse errors, fall back to generic message
    }
    throw new Error(message)
  }
}

export class AuthAPI {
  static async getSessionStatus(): Promise<SessionStatusResponse> {
    const response = await fetch(`${API_BASE}/auth/status`, {
      credentials: 'include',
    })
    await ensureOk(response)
    return response.json() as Promise<SessionStatusResponse>
  }

  static async completeSignup(handle: CompleteSignupRequest['handle']): Promise<CompleteSignupResponse> {
    const response = await fetch(`${API_BASE}/auth/complete-signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ handle }),
    })

    await ensureOk(response)
    return response.json() as Promise<CompleteSignupResponse>
  }

  static async logout(): Promise<LogoutResponse> {
    const response = await fetch(`${API_BASE}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    })

    await ensureOk(response)
    return response.json() as Promise<LogoutResponse>
  }

  static async getMe(): Promise<User> {
    const response = await fetch(`${API_BASE}/auth/me`, {
      credentials: 'include',
    })

    await ensureOk(response)
    return response.json() as Promise<User>
  }

  static async checkHandleAvailability(handle: string): Promise<HandleAvailabilityResponse> {
    const params = new URLSearchParams({ handle })
    const response = await fetch(`${API_BASE}/auth/check-handle?${params.toString()}`, {
      credentials: 'include',
    })

    await ensureOk(response)
    return response.json() as Promise<HandleAvailabilityResponse>
  }

  static getSpotifyLoginUrl(): string {
    return `${API_BASE}/auth/spotify`
  }

  static async importRecentSongs(): Promise<ImportRecentSongsResponse> {
    const response = await fetch(`${API_BASE}/auth/import-recent-songs`, {
      method: 'POST',
      credentials: 'include',
    })

    await ensureOk(response)
    return response.json() as Promise<ImportRecentSongsResponse>
  }

  static async getSpotifySongs(): Promise<SpotifySong[]> {
    const response = await fetch(`${API_BASE}/auth/spotify-songs`, {
      credentials: 'include',
    })

    await ensureOk(response)
    return response.json() as Promise<SpotifySong[]>
  }

  static async getSpotifyRanking(userNs: string, userPk: string): Promise<RankingResponse> {
    const params = new URLSearchParams({ ns: userNs, pk: userPk })
    const response = await fetch(`${API_BASE}/rank/rank?${params.toString()}`, {
      credentials: 'include',
    })

    await ensureOk(response)
    return response.json() as Promise<RankingResponse>
  }

  static async getRankingHistory(userNs: string, userPk: string): Promise<RankingHistoryResponse> {
    const params = new URLSearchParams({ ns: userNs, pk: userPk })
    const response = await fetch(`${API_BASE}/rank/history?${params.toString()}`, {
      credentials: 'include',
    })

    await ensureOk(response)
    return response.json() as Promise<RankingHistoryResponse>
  }
}
