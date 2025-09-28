import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchPairFn, submitVoteFn } from '../../fetchers/voteEndpoints';
import { useAuth } from '../../contexts/AuthContext';
import { useMapContext } from '../MapContext';
import '../../styles/map-room.css';

const magnitudeForDirection = {
  left: -50,
  right: 50,
};

const getArtist = (entity: any) => entity?.metadata?.artists?.[0]?.name || entity?.metadata?.artist || 'Unknown Artist';
const getAlbumArt = (entity: any) => entity?.metadata?.album?.images?.[0]?.url || entity?.metadata?.images?.[0]?.url || entity?.profile_picture_url || null;

export const PairPanel: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { setSelectedEntity } = useMapContext();

  const pairQuery = useQuery({
    queryKey: ['pair', 'children', 'sorter.user', user?.handle],
    queryFn: fetchPairFn,
    enabled: !!user?.handle,
    refetchOnWindowFocus: false,
  });

  const voteMutation = useMutation({
    mutationFn: submitVoteFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pair', 'children', 'sorter.user', user?.handle] });
      queryClient.invalidateQueries({ queryKey: ['vote-history', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['spotify-ranking', user?.handle] });
    },
  });

  const handleVote = async (direction: 'left' | 'right') => {
    if (!pairQuery.data?.left_entity || !pairQuery.data?.right_entity) return;
    const { left_entity, right_entity } = pairQuery.data;
    const magnitude = magnitudeForDirection[direction];

    const payload = direction === 'left'
      ? {
          left_ns: left_entity.ns,
          left_pk: left_entity.pk,
          right_ns: right_entity.ns,
          right_pk: right_entity.pk,
          attribute_id: 1,
          magnitude,
        }
      : {
          left_ns: left_entity.ns,
          left_pk: left_entity.pk,
          right_ns: right_entity.ns,
          right_pk: right_entity.pk,
          attribute_id: 1,
          magnitude,
        };

    await voteMutation.mutateAsync(payload as any);
  };

  const handleSkip = () => {
    pairQuery.refetch();
  };

  if (pairQuery.isLoading) {
    return (
      <div className="room-panel room-panel--loading">
        <div className="spinner" />
        <p>Summoning contenders…</p>
      </div>
    );
  }

  if (pairQuery.isError) {
    return (
      <div className="room-panel room-panel--error">
        <p>Could not fetch a pair.</p>
        <button className="room-button" onClick={() => pairQuery.refetch()}>Retry</button>
      </div>
    );
  }

  const left = pairQuery.data?.left_entity;
  const right = pairQuery.data?.right_entity;

  if (!left || !right) {
    return (
      <div className="room-panel room-panel--empty">
        <p>No contenders available. Try importing more tracks.</p>
      </div>
    );
  }

  const renderCard = (entity: any, position: 'left' | 'right') => {
    const imageUrl = getAlbumArt(entity);
    const artist = getArtist(entity);
    return (
      <button
        type="button"
        className={`pair-card pair-card--${position}`}
        onClick={() => setSelectedEntity(entity)}
      >
        {imageUrl ? (
          <img src={imageUrl} alt={entity.title || 'Album Art'} className="pair-card__image" />
        ) : (
          <div className="pair-card__placeholder">?</div>
        )}
        <div className="pair-card__meta">
          <span className="pair-card__label">{position === 'left' ? 'Left Contender' : 'Right Contender'}</span>
          <h3 className="pair-card__title">{entity.title || 'Untitled'}</h3>
          <p className="pair-card__artist">{artist}</p>
        </div>
      </button>
    );
  };

  return (
    <div className="room-panel room-panel--pair">
      <div className="pair-cards">
        {renderCard(left, 'left')}
        <div className="pair-arena">
          <span>Choose Your Champion</span>
          <div className="pair-arena__actions">
            <button
              className="room-button room-button--accent"
              onClick={() => handleVote('left')}
              disabled={voteMutation.isPending}
            >
              Favor Left
            </button>
            <button
              className="room-button room-button--accent"
              onClick={() => handleVote('right')}
              disabled={voteMutation.isPending}
            >
              Favor Right
            </button>
            <button
              className="room-button room-button--ghost"
              onClick={handleSkip}
              disabled={pairQuery.isFetching}
            >
              New Pair
            </button>
          </div>
        </div>
        {renderCard(right, 'right')}
      </div>
    </div>
  );
};
