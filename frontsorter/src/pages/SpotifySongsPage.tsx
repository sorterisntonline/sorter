import React, { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AuthAPI } from '../api/auth'
import type {
  RankingResponse,
  SessionStatusResponse,
  SpotifySong,
} from '../types/generated/index.js'
import '../styles/spotify.css'

type SongsWithRanking = {
  ranked: Array<SpotifySong & { score: number }>
  unranked: SpotifySong[]
}

function deriveSongsWithRanking(songs: SpotifySong[] | undefined, ranking: RankingResponse | undefined): SongsWithRanking {
  if (!songs || !ranking) {
    return { ranked: [], unranked: songs ?? [] }
  }

  const byIdentifier = new Map<string, SpotifySong>()
  for (const song of songs) {
    byIdentifier.set(`spotify.track:${song.id}`, song)
  }

  const ranked = ranking.sorted
    .map(entity => {
      const key = `${entity.identifier.ns}:${entity.identifier.pk}`
      const song = byIdentifier.get(key)
      if (!song) {
        return undefined
      }
      return { ...song, score: entity.score }
    })
    .filter((song): song is SpotifySong & { score: number } => Boolean(song))

  const rankedIds = new Set(ranked.map(song => song.id))
  const unranked = ranking.unsorted
    .map(entity => {
      const key = `${entity.ns}:${entity.pk}`
      return byIdentifier.get(key)
    })
    .filter((song): song is SpotifySong => Boolean(song))
    .filter(song => !rankedIds.has(song.id))

  return {
    ranked: ranked.sort((a, b) => b.score - a.score),
    unranked,
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return 'Unknown error'
}

const SpotifySongsPage: React.FC = () => {
  const queryClient = useQueryClient()

  const sessionQuery = useQuery<SessionStatusResponse>({
    queryKey: ['auth', 'session'],
    queryFn: AuthAPI.getSessionStatus,
    staleTime: 5 * 60 * 1000,
  })

  const songsQuery = useQuery<SpotifySong[]>({
    queryKey: ['spotify', 'songs'],
    queryFn: AuthAPI.getSpotifySongs,
    enabled: Boolean(sessionQuery.data?.authenticated),
  })

  const rankingQuery = useQuery<RankingResponse>({
    queryKey: ['spotify', 'ranking', sessionQuery.data?.user?.handle],
    queryFn: () => AuthAPI.getSpotifyRanking('sorter.user', sessionQuery.data!.user!.handle),
    enabled: Boolean(sessionQuery.data?.user?.handle),
  })

  const importSongs = useMutation({
    mutationFn: AuthAPI.importRecentSongs,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['spotify', 'songs'] })
      queryClient.invalidateQueries({ queryKey: ['spotify', 'ranking'] })
    },
  })

  const songsWithRanking = useMemo(
    () => deriveSongsWithRanking(songsQuery.data, rankingQuery.data),
    [songsQuery.data, rankingQuery.data],
  )

  const isLoading =
    sessionQuery.isLoading || songsQuery.isLoading || rankingQuery.isLoading || importSongs.isPending

  if (sessionQuery.isLoading) {
    return (
      <div className="spotify-page">
        <p>Checking your session…</p>
      </div>
    )
  }

  if (!sessionQuery.data?.authenticated) {
    return (
      <div className="spotify-page">
        <h1>Spotify Sorting</h1>
        <p>You need to sign in to view your Spotify songs.</p>
        <a className="button" href="/login">
          Go to login
        </a>
      </div>
    )
  }

  if (songsQuery.isError) {
    return (
      <div className="spotify-page">
        <p>Failed to load songs: {formatError(songsQuery.error)}</p>
      </div>
    )
  }

  return (
    <div className="spotify-page">
      <header className="spotify-header">
        <div>
          <h1>Spotify Sorting</h1>
          <p>Review the tracks you've imported from Spotify and their current ranking.</p>
        </div>
        <button
          className="button"
          onClick={() => importSongs.mutate()}
          disabled={isLoading}
        >
          {importSongs.isPending ? 'Importing…' : 'Import Recent Songs'}
        </button>
      </header>

      {importSongs.isError && (
        <div className="alert alert-error">{formatError(importSongs.error)}</div>
      )}
      {importSongs.isSuccess && (
        <div className="alert alert-success">{importSongs.data.message}</div>
      )}

      <section className="spotify-section">
        <h2>Ranked Songs</h2>
        {rankingQuery.isLoading && <p>Loading ranking…</p>}
        {!rankingQuery.isLoading && songsWithRanking.ranked.length === 0 && (
          <p>No ranking data yet. Vote on some pairs to get started.</p>
        )}
        {songsWithRanking.ranked.length > 0 && (
          <table className="spotify-table">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Title</th>
                <th scope="col">Artist</th>
                <th scope="col">Album</th>
                <th scope="col">Score</th>
              </tr>
            </thead>
            <tbody>
              {songsWithRanking.ranked.map((song, index) => (
                <tr key={song.id}>
                  <td>{index + 1}</td>
                  <td>{song.title}</td>
                  <td>{song.artist}</td>
                  <td>{song.album ?? '—'}</td>
                  <td>{song.score.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="spotify-section">
        <h2>Unranked Songs</h2>
        {songsQuery.isLoading && <p>Loading songs…</p>}
        {!songsQuery.isLoading && songsWithRanking.unranked.length === 0 && (
          <p>All imported songs have been ranked.</p>
        )}
        {songsWithRanking.unranked.length > 0 && (
          <table className="spotify-table">
            <thead>
              <tr>
                <th scope="col">Title</th>
                <th scope="col">Artist</th>
                <th scope="col">Album</th>
              </tr>
            </thead>
            <tbody>
              {songsWithRanking.unranked.map(song => (
                <tr key={song.id}>
                  <td>{song.title}</td>
                  <td>{song.artist}</td>
                  <td>{song.album ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

export default SpotifySongsPage
