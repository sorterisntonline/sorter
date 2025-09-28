import React, { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addToPool,
  blockFromPool,
  removeFromPool,
  fetchPoolEntities,
  EntityWithPoolStatus,
} from '../../fetchers/poolEndpoints';
import { useAuth } from '../../contexts/AuthContext';
import { useMapContext } from '../MapContext';
import '../../styles/map-room.css';

const statusOrder: Record<string, number> = {
  in_pool: 0,
  unclassified: 1,
  blocked: 2,
};

export const PoolManagerPanel: React.FC = () => {
  const { user } = useAuth();
  const { setSelectedEntity } = useMapContext();
  const queryClient = useQueryClient();

  const poolQuery = useQuery({
    queryKey: ['pool-list', { ns: 'spotify.track' }],
    queryFn: fetchPoolEntities,
    enabled: !!user,
    refetchOnWindowFocus: false,
  });

  const mutateAndRefresh = (mutator: (ns: string, pk: string) => Promise<any>) =>
    async (entity: EntityWithPoolStatus) => {
      await mutator(entity.ns, entity.pk);
      queryClient.invalidateQueries({ queryKey: ['pool-list'] });
    };

  const addMutation = useMutation({
    mutationFn: (entity: EntityWithPoolStatus) => mutateAndRefresh(addToPool)(entity),
  });
  const blockMutation = useMutation({
    mutationFn: (entity: EntityWithPoolStatus) => mutateAndRefresh(blockFromPool)(entity),
  });
  const removeMutation = useMutation({
    mutationFn: (entity: EntityWithPoolStatus) => mutateAndRefresh(removeFromPool)(entity),
  });

  const grouped = useMemo(() => {
    if (!poolQuery.data) return [];
    const list = [...poolQuery.data];
    list.sort((a, b) => {
      const statusDiff = statusOrder[a.pool_status] - statusOrder[b.pool_status];
      if (statusDiff !== 0) return statusDiff;
      return (a.title || '').localeCompare(b.title || '');
    });
    return list;
  }, [poolQuery.data]);

  if (poolQuery.isLoading) {
    return (
      <div className="room-panel room-panel--loading">
        <div className="spinner" />
        <p>Pumping songs into the pool…</p>
      </div>
    );
  }

  if (poolQuery.isError) {
    return (
      <div className="room-panel room-panel--error">
        <p>Pool data is offline right now.</p>
      </div>
    );
  }

  return (
    <div className="room-panel room-panel--pool">
      <h3>Pool Builder</h3>
      <div className="pool-list">
        {grouped.map((entity) => (
          <div key={`${entity.ns}:${entity.pk}`} className={`pool-row pool-row--${entity.pool_status}`}>
            <button
              className="pool-row__main"
              onClick={() => setSelectedEntity(entity)}
            >
              <span className="pool-row__status">{entity.pool_status.replace('_', ' ')}</span>
              <span className="pool-row__title">{entity.title || 'Untitled'}</span>
            </button>
            <div className="pool-row__actions">
              <button
                className="room-button room-button--ghost"
                onClick={() => addMutation.mutate(entity)}
                disabled={addMutation.isPending}
              >
                Add
              </button>
              <button
                className="room-button room-button--ghost"
                onClick={() => removeMutation.mutate(entity)}
                disabled={removeMutation.isPending}
              >
                Remove
              </button>
              <button
                className="room-button room-button--ghost"
                onClick={() => blockMutation.mutate(entity)}
                disabled={blockMutation.isPending}
              >
                Block
              </button>
            </div>
          </div>
        ))}
        {grouped.length === 0 && (
          <div className="room-panel--empty">
            <p>Your pool is quiet. Import songs from Spotify to begin.</p>
          </div>
        )}
      </div>
    </div>
  );
};
