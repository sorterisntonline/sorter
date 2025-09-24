import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AuthAPI } from '../api/auth';
import { useDynamicTheme } from '../contexts/DynamicThemeContext';
import { useSpotifyPlayer } from '../contexts/SpotifyPlayerContext';
import {
  fetchPoolEntities,
  addToPool,
  blockFromPool,
  removeFromPool,
  batchPoolOperations,
  EntityWithPoolStatus,
  PoolOperation,
} from '../fetchers/poolEndpoints';
import '../styles/pool.css';
import '../styles/spotify.css';
import '../styles/dynamic-theme.css';

// Helper function to get the largest image URL
const getLargestImageUrl = (images) => {
  if (!images || images.length === 0) return null;
  return images[0].url;
};

export function PoolPage() {
  const queryClient = useQueryClient();
  const [selectedInPool, setSelectedInPool] = useState<Set<string>>(new Set());
  const [selectedNotInPool, setSelectedNotInPool] = useState<Set<string>>(new Set());
  const [selectedSong, setSelectedSong] = useState(null);
  const { getCSSVariables } = useDynamicTheme();
  const { playTrack, queueTrack, isReady } = useSpotifyPlayer();

  // Query for current user info
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: AuthAPI.getMe,
    refetchOnWindowFocus: false,
  });

  // Query for user's recent songs (to get all available entities)
  const { data: songs, isLoading: songsLoading } = useQuery({
    queryKey: ['spotify-songs'],
    queryFn: AuthAPI.getSpotifySongs,
    refetchOnWindowFocus: false,
  });

  // Fetch entities for each pool status (all user's tracks)
  const {
    data: inPoolEntities = [],
    isLoading: loadingInPool,
  } = useQuery({
    queryKey: ['poolEntities', { ns: 'spotify.track', status: 'in_pool' as const }],
    queryFn: fetchPoolEntities,
    enabled: !!user,
  });

  const {
    data: blockedEntities = [],
    isLoading: loadingBlocked,
  } = useQuery({
    queryKey: ['poolEntities', { ns: 'spotify.track', status: 'blocked' as const }],
    queryFn: fetchPoolEntities,
    enabled: !!user,
  });

  const {
    data: unclassifiedEntities = [],
    isLoading: loadingUnclassified,
  } = useQuery({
    queryKey: ['poolEntities', { ns: 'spotify.track', status: 'unclassified' as const }],
    queryFn: fetchPoolEntities,
    enabled: !!user,
  });

  // Combine blocked and unclassified for the "NOT IN POOL" panel
  const notInPoolEntities = [...blockedEntities, ...unclassifiedEntities];

  // Mutation for batch operations
  const batchMutation = useMutation({
    mutationFn: (operations: PoolOperation[]) => batchPoolOperations(operations),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['poolEntities'],
      });
      setSelectedInPool(new Set());
      setSelectedNotInPool(new Set());
    },
  });

  // Individual entity mutation
  const entityMutation = useMutation({
    mutationFn: async ({ ns, pk, action }: { ns: string; pk: string; action: 'add' | 'block' | 'remove' }) => {
      switch (action) {
        case 'add':
          return addToPool(ns, pk);
        case 'block':
          return blockFromPool(ns, pk);
        case 'remove':
          return removeFromPool(ns, pk);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['poolEntities'],
      });
    },
  });

  const handleToggleSelection = (entityKey: string, isInPool: boolean) => {
    if (isInPool) {
      const newSelection = new Set(selectedInPool);
      if (newSelection.has(entityKey)) {
        newSelection.delete(entityKey);
      } else {
        newSelection.add(entityKey);
      }
      setSelectedInPool(newSelection);
    } else {
      const newSelection = new Set(selectedNotInPool);
      if (newSelection.has(entityKey)) {
        newSelection.delete(entityKey);
      } else {
        newSelection.add(entityKey);
      }
      setSelectedNotInPool(newSelection);
    }
  };

  const handleSelectAll = (isInPool: boolean) => {
    if (isInPool) {
      const allKeys = new Set(inPoolEntities.map(e => e.pk));
      const currentSelection = selectedInPool;
      
      // If all items are already selected, deselect all. Otherwise, select all.
      if (currentSelection.size === allKeys.size && 
          Array.from(allKeys).every(key => currentSelection.has(key))) {
        setSelectedInPool(new Set());
      } else {
        setSelectedInPool(allKeys);
      }
    } else {
      const allKeys = new Set(notInPoolEntities.map(e => e.pk));
      const currentSelection = selectedNotInPool;
      
      // If all items are already selected, deselect all. Otherwise, select all.
      if (currentSelection.size === allKeys.size && 
          Array.from(allKeys).every(key => currentSelection.has(key))) {
        setSelectedNotInPool(new Set());
      } else {
        setSelectedNotInPool(allKeys);
      }
    }
  };

  const handleMoveToPool = () => {
    const operations: PoolOperation[] = Array.from(selectedNotInPool).map(pk => ({
      entity_ns: 'spotify.track',
      entity_pk: pk,
      action: 'add' as const,
    }));
    batchMutation.mutate(operations);
  };

  const handleBlockSelected = () => {
    const operations: PoolOperation[] = Array.from(selectedInPool).map(pk => ({
      entity_ns: 'spotify.track',
      entity_pk: pk,
      action: 'block' as const,
    }));
    batchMutation.mutate(operations);
  };

  const handleRemoveSelected = () => {
    const operations: PoolOperation[] = [
      ...Array.from(selectedInPool).map(pk => ({
        entity_ns: 'spotify.track',
        entity_pk: pk,
        action: 'remove' as const,
      })),
      ...Array.from(selectedNotInPool).map(pk => ({
        entity_ns: 'spotify.track',
        entity_pk: pk,
        action: 'remove' as const,
      })),
    ];
    batchMutation.mutate(operations);
  };

  const handleMoveEntity = (entity: EntityWithPoolStatus, action: 'add' | 'block' | 'remove') => {
    entityMutation.mutate({
      ns: entity.ns,
      pk: entity.pk,
      action,
    });
  };

  const handlePlaySong = (entity: EntityWithPoolStatus) => {
    if (entity.ns?.includes('spotify.track')) {
      const uri = `spotify:track:${entity.pk}`;
      playTrack(uri);
    }
  };

  const handleQueueSong = (entity: EntityWithPoolStatus) => {
    if (entity.ns?.includes('spotify.track')) {
      const uri = `spotify:track:${entity.pk}`;
      queueTrack(uri);
    }
  };

  const isLoading = songsLoading || loadingInPool || loadingBlocked || loadingUnclassified;

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <p>Loading pool data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pool-page">
      <div className="pool-layout">
        {/* Left Panel - IN POOL */}
        <div className="pool-panel-left">
          <div className="songs-header">
            <span className="songs-title">IN POOL</span>
            <span className="count">({inPoolEntities.length})</span>
            <Link 
              to="/spotify" 
              className="nav-link songs-link"
              title="Go back to songs and ranking"
            >
              ← Songs
            </Link>
          </div>
          
          <div className="pool-controls">
            <button
              onClick={() => handleSelectAll(true)}
              disabled={inPoolEntities.length === 0}
              className="select-all-btn"
            >
              {selectedInPool.size === inPoolEntities.length && inPoolEntities.length > 0
                ? 'Deselect All'
                : 'Select All'}
            </button>
          </div>

          <div className="songs-container">
            {inPoolEntities.map((entity) => (
              <div
                key={entity.pk}
                className={`song-item pool-entity ${selectedInPool.has(entity.pk) ? 'selected' : ''}`}
                onClick={() => handleToggleSelection(entity.pk, true)}
              >
                <div className="pool-status">✓</div>
                {entity.metadata?.album?.images?.[0]?.url && (
                  <img 
                    src={entity.metadata.album.images[0].url} 
                    alt="Album art"
                    className="album-art"
                  />
                )}
                <div className="song-info">
                  <div className="song-title">{entity.title || entity.pk}</div>
                  {entity.metadata && (
                    <>
                      <div className="song-artist">{entity.metadata.artist || entity.metadata.artists?.[0]?.name}</div>
                      <div className="song-album">{entity.metadata.album?.name}</div>
                    </>
                  )}
                </div>
                <div className="pool-actions">
                  {isReady && (
                    <>
                      <button
                        className="play-btn"
                        onClick={(e) => { e.stopPropagation(); handlePlaySong(entity); }}
                        title="Play"
                      >
                        ▶
                      </button>
                      <button
                        className="queue-btn"
                        onClick={(e) => { e.stopPropagation(); handleQueueSong(entity); }}
                        title="Add to queue"
                      >
                        +
                      </button>
                    </>
                  )}
                  <button
                    className="action-btn block-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMoveEntity(entity, 'block');
                    }}
                    title="Block this song"
                  >
                    ✗
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Center Panel - CONTROLS */}
        <div className="pool-controls-panel">
          <div className="pool-control-buttons">
            <h3>CONTROLS</h3>
            
            <button
              onClick={handleMoveToPool}
              disabled={selectedNotInPool.size === 0 || batchMutation.isPending}
              className="control-btn move-to-pool"
              title="Move selected items to pool"
            >
              ← Add ({selectedNotInPool.size})
            </button>

            <button
              onClick={handleBlockSelected}
              disabled={selectedInPool.size === 0 || batchMutation.isPending}
              className="control-btn block-from-pool"
              title="Block selected items from pool"
            >
              → Block ({selectedInPool.size})
            </button>

            <button
              onClick={handleRemoveSelected}
              disabled={(selectedInPool.size + selectedNotInPool.size) === 0 || batchMutation.isPending}
              className="control-btn remove-all"
              title="Remove selected items (return to unclassified)"
            >
              Remove ({selectedInPool.size + selectedNotInPool.size})
            </button>

            {batchMutation.isPending && (
              <div className="loading-indicator">Processing...</div>
            )}

            {batchMutation.error && (
              <div className="error-message">
                Error: {batchMutation.error.message}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - NOT IN POOL */}
        <div className="pool-panel-right">
          <div className="songs-header">
            <span className="songs-title">NOT IN POOL</span>
            <span className="count">({notInPoolEntities.length})</span>
          </div>

          <div className="pool-controls">
            <button
              onClick={() => handleSelectAll(false)}
              disabled={notInPoolEntities.length === 0}
              className="select-all-btn"
            >
              {selectedNotInPool.size === notInPoolEntities.length && notInPoolEntities.length > 0
                ? 'Deselect All'
                : 'Select All'}
            </button>
          </div>

          <div className="songs-container">
            {notInPoolEntities.map((entity) => (
              <div
                key={entity.pk}
                className={`song-item pool-entity ${selectedNotInPool.has(entity.pk) ? 'selected' : ''}`}
                onClick={() => handleToggleSelection(entity.pk, false)}
              >
                <div className="pool-status">
                  {entity.pool_status === 'blocked' ? '✗' : ''}
                </div>
                {entity.metadata?.album?.images?.[0]?.url && (
                  <img 
                    src={entity.metadata.album.images[0].url} 
                    alt="Album art"
                    className="album-art"
                  />
                )}
                <div className="song-info">
                  <div className="song-title">{entity.title || entity.pk}</div>
                  {entity.metadata && (
                    <>
                      <div className="song-artist">{entity.metadata.artist || entity.metadata.artists?.[0]?.name}</div>
                      <div className="song-album">{entity.metadata.album?.name}</div>
                    </>
                  )}
                </div>
                <div className="pool-actions">
                  {isReady && (
                    <>
                      <button
                        className="play-btn"
                        onClick={(e) => { e.stopPropagation(); handlePlaySong(entity); }}
                        title="Play"
                      >
                        ▶
                      </button>
                      <button
                        className="queue-btn"
                        onClick={(e) => { e.stopPropagation(); handleQueueSong(entity); }}
                        title="Add to queue"
                      >
                        +
                      </button>
                    </>
                  )}
                  <button
                    className="action-btn add-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMoveEntity(entity, 'add');
                    }}
                    title="Add this song to pool"
                  >
                    ✓
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
