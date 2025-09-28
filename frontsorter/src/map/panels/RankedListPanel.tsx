import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AuthAPI } from '../../api/auth';
import { useAuth } from '../../contexts/AuthContext';
import { useMapContext } from '../MapContext';
import '../../styles/map-room.css';

export const RankedListPanel: React.FC = () => {
  const { user } = useAuth();
  const { setSelectedEntity, rankFilter } = useMapContext();

  const songsQuery = useQuery({
    queryKey: ['spotify-songs'],
    queryFn: AuthAPI.getSpotifySongs,
    enabled: !!user,
    refetchOnWindowFocus: false,
  });

  const rankingQuery = useQuery({
    queryKey: ['spotify-ranking', user?.handle],
    queryFn: () => AuthAPI.getSpotifyRanking('sorter.user', user!.handle ?? ''),
    enabled: !!user?.handle && songsQuery.isSuccess,
    refetchOnWindowFocus: false,
  });

  const rankedSongs = useMemo(() => {
    if (!songsQuery.data || !rankingQuery.data) return [];
    const songsMap = new Map<string, any>();
    for (const song of songsQuery.data) {
      songsMap.set(`${song.ns}:${song.pk}`, song);
    }
    return rankingQuery.data.sorted
      .map((entry: any) => {
        const key = `${entry.identifier.ns}:${entry.identifier.pk}`;
        const song = songsMap.get(key);
        if (!song) return null;
        return {
          ...song,
          score: entry.score,
        };
      })
      .filter(Boolean) as any[];
  }, [songsQuery.data, rankingQuery.data]);

  const filteredSongs = rankedSongs.filter((song: any) => {
    if (!rankFilter) return true;
    const text = rankFilter.toLowerCase();
    return (
      (song.title || '').toLowerCase().includes(text) ||
      (song.artist || song.metadata?.artists?.[0]?.name || '').toLowerCase().includes(text)
    );
  });

  if (songsQuery.isLoading || rankingQuery.isLoading) {
    return (
      <div className="room-panel room-panel--loading">
        <div className="spinner" />
        <p>Calibrating rankings…</p>
      </div>
    );
  }

  if (songsQuery.isError || rankingQuery.isError) {
    return (
      <div className="room-panel room-panel--error">
        <p>We hit a snag fetching rankings.</p>
      </div>
    );
  }

  return (
    <div className="room-panel room-panel--ranked">
      <div className="ranked-header">
        <h3>Top Seeds</h3>
        <span className="ranked-subhead">{filteredSongs.length} tracks</span>
      </div>
      <div className="ranked-list">
        {filteredSongs.length === 0 && (
          <div className="room-panel--empty">
            <p>No songs match your filter.</p>
          </div>
        )}
        {filteredSongs.map((song: any, index: number) => {
          const artist = song.artist || song.metadata?.artists?.[0]?.name || 'Unknown Artist';
          return (
            <button
              key={`${song.ns}:${song.pk}`}
              className="ranked-row"
              onClick={() => setSelectedEntity(song)}
            >
              <span className="ranked-row__position">{index + 1}</span>
              {song.album_art && (
                <img src={song.album_art} alt="cover" className="ranked-row__art" />
              )}
              <span className="ranked-row__title">{song.title || 'Untitled'}</span>
              <span className="ranked-row__artist">{artist}</span>
              <span className="ranked-row__score">{song.score.toFixed(3)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
