import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AuthAPI } from '../api/auth';
import { useDynamicTheme } from '../contexts/DynamicThemeContext';
import { useSpotifyPlayer } from '../contexts/SpotifyPlayerContext';
import ThreePanelLayout from '../components/ThreePanelLayout';
import {
  fetchListState,
  createListAction,
  batchListActions,
  ListActionPayload,
} from '../fetchers/listActionsEndpoints';
import '../styles/pool.css';
import '../styles/spotify.css';
import '../styles/dynamic-theme.css';

// Helper function to get the largest image URL
const getLargestImageUrl = (images) => {
  if (!images || images.length === 0) return null;
  return images[0].url;
};

interface Entity {
  ns: string;
  pk: string;
  title?: string;
  profile_picture_url?: string;
  metadata?: any;
}

export function PoolPage() {
  const queryClient = useQueryClient();
  const [selectedIncluded, setSelectedIncluded] = useState<Set<string>>(new Set());
  const [selectedExcluded, setSelectedExcluded] = useState<Set<string>>(new Set());
  const [selectedSong, setSelectedSong] = useState(null);
  const { getCSSVariables } = useDynamicTheme();
  const { playTrack, queueTrack, isReady } = useSpotifyPlayer();

  // Query for current user info
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: AuthAPI.getMe,
    refetchOnWindowFocus: false,
  });

  // Fetch list state (included/excluded entities) for the user's Spotify tracks
  const {
    data: listState,
    isLoading,
  } = useQuery({
    queryKey: ['listState', 'sorter.user', user?.handle],
    queryFn: () => fetchListState('sorter.user', user!.handle),
    enabled: !!user,
  });

  // Mutation for batch operations
  const batchMutation = useMutation({
    mutationFn: (actions: ListActionPayload[]) => batchListActions(actions),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['listState'],
      });
      setSelectedIncluded(new Set());
      setSelectedExcluded(new Set());
    },
  });

  // Individual entity mutation
  const entityMutation = useMutation({
    mutationFn: async ({ ns, pk, action }: { ns: string; pk: string; action: 'allow' | 'deny' | 'reset' }) => {
      if (!user) throw new Error('User not logged in');
      return createListAction({
        list_ns: 'sorter.user',
        list_pk: user.handle,
        entity_ns: ns,
        entity_pk: pk,
        action,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['listState'],
      });
    },
  });

  const handleToggleSelection = (entityKey: string, isIncluded: boolean) => {
    if (isIncluded) {
      const newSelection = new Set(selectedIncluded);
      if (newSelection.has(entityKey)) {
        newSelection.delete(entityKey);
      } else {
        newSelection.add(entityKey);
      }
      setSelectedIncluded(newSelection);
    } else {
      const newSelection = new Set(selectedExcluded);
      if (newSelection.has(entityKey)) {
        newSelection.delete(entityKey);
      } else {
        newSelection.add(entityKey);
      }
      setSelectedExcluded(newSelection);
    }
  };

  const handleSelectAll = (isIncluded: boolean) => {
    if (!listState) return;

    if (isIncluded) {
      const allKeys = new Set(listState.included.map(e => e.pk));
      const currentSelection = selectedIncluded;

      // If all items are already selected, deselect all. Otherwise, select all.
      if (currentSelection.size === allKeys.size &&
          Array.from(allKeys).every(key => currentSelection.has(key))) {
        setSelectedIncluded(new Set());
      } else {
        setSelectedIncluded(allKeys);
      }
    } else {
      const allKeys = new Set(listState.excluded.map(e => e.pk));
      const currentSelection = selectedExcluded;

      // If all items are already selected, deselect all. Otherwise, select all.
      if (currentSelection.size === allKeys.size &&
          Array.from(allKeys).every(key => currentSelection.has(key))) {
        setSelectedExcluded(new Set());
      } else {
        setSelectedExcluded(allKeys);
      }
    }
  };

  const handleIncludeSelected = () => {
    if (!user) return;
    const actions: ListActionPayload[] = Array.from(selectedExcluded).map(pk => ({
      list_ns: 'sorter.user',
      list_pk: user.handle,
      entity_ns: 'spotify.track',
      entity_pk: pk,
      action: 'allow' as const,
    }));
    batchMutation.mutate(actions);
  };

  const handleExcludeSelected = () => {
    if (!user) return;
    const actions: ListActionPayload[] = Array.from(selectedIncluded).map(pk => ({
      list_ns: 'sorter.user',
      list_pk: user.handle,
      entity_ns: 'spotify.track',
      entity_pk: pk,
      action: 'deny' as const,
    }));
    batchMutation.mutate(actions);
  };

  const handleResetSelected = () => {
    if (!user) return;
    const actions: ListActionPayload[] = [
      ...Array.from(selectedIncluded).map(pk => ({
        list_ns: 'sorter.user',
        list_pk: user.handle,
        entity_ns: 'spotify.track',
        entity_pk: pk,
        action: 'reset' as const,
      })),
      ...Array.from(selectedExcluded).map(pk => ({
        list_ns: 'sorter.user',
        list_pk: user.handle,
        entity_ns: 'spotify.track',
        entity_pk: pk,
        action: 'reset' as const,
      })),
    ];
    batchMutation.mutate(actions);
  };

  const handleMoveEntity = (entity: Entity, action: 'allow' | 'deny' | 'reset') => {
    entityMutation.mutate({
      ns: entity.ns,
      pk: entity.pk,
      action,
    });
  };

  const handlePlaySong = (entity: Entity) => {
    if (entity.ns?.includes('spotify.track')) {
      const uri = `spotify:track:${entity.pk}`;
      playTrack(uri);
    }
  };

  const handleQueueSong = (entity: Entity) => {
    if (entity.ns?.includes('spotify.track')) {
      const uri = `spotify:track:${entity.pk}`;
      queueTrack(uri);
    }
  };

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <p>Loading selection data...</p>
        </div>
      </div>
    );
  }

  const includedEntities = listState?.included || [];
  const excludedEntities = listState?.excluded || [];

  // Left Panel - INCLUDED
  const leftPanel = (
    <>
      <div className="songs-header">
        <span className="songs-title">INCLUDED</span>
        <span className="count">({includedEntities.length})</span>
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
          disabled={includedEntities.length === 0}
          className="select-all-btn"
        >
          {selectedIncluded.size === includedEntities.length && includedEntities.length > 0
            ? 'Deselect All'
            : 'Select All'}
        </button>
      </div>

      <div className="songs-container">
        {includedEntities.map((entity) => (
          <div
            key={entity.pk}
            className={`song-item pool-entity ${selectedIncluded.has(entity.pk) ? 'selected' : ''}`}
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
                  handleMoveEntity(entity, 'deny');
                }}
                title="Exclude this song"
              >
                ✗
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );

  // Center Panel - CONTROLS
  const centerPanel = (
    <div className="pool-control-buttons">
      <h3>CONTROLS</h3>

      <button
        onClick={handleIncludeSelected}
        disabled={selectedExcluded.size === 0 || batchMutation.isPending}
        className="control-btn move-to-pool"
        title="Include selected items"
      >
        ← Include ({selectedExcluded.size})
      </button>

      <button
        onClick={handleExcludeSelected}
        disabled={selectedIncluded.size === 0 || batchMutation.isPending}
        className="control-btn block-from-pool"
        title="Exclude selected items"
      >
        → Exclude ({selectedIncluded.size})
      </button>

      <button
        onClick={handleResetSelected}
        disabled={(selectedIncluded.size + selectedExcluded.size) === 0 || batchMutation.isPending}
        className="control-btn remove-all"
        title="Reset selected items (return to default behavior)"
      >
        Reset ({selectedIncluded.size + selectedExcluded.size})
      </button>

      {batchMutation.isPending && (
        <div className="loading-indicator">Processing...</div>
      )}

      {batchMutation.error && (
        <div className="error-message">
          Error: {(batchMutation.error as Error).message}
        </div>
      )}
    </div>
  );

  // Right Panel - EXCLUDED
  const rightPanel = (
    <>
      <div className="songs-header">
        <span className="songs-title">EXCLUDED</span>
        <span className="count">({excludedEntities.length})</span>
      </div>

      <div className="pool-controls">
        <button
          onClick={() => handleSelectAll(false)}
          disabled={excludedEntities.length === 0}
          className="select-all-btn"
        >
          {selectedExcluded.size === excludedEntities.length && excludedEntities.length > 0
            ? 'Deselect All'
            : 'Select All'}
        </button>
      </div>

      <div className="songs-container">
        {excludedEntities.map((entity) => (
          <div
            key={entity.pk}
            className={`song-item pool-entity ${selectedExcluded.has(entity.pk) ? 'selected' : ''}`}
            onClick={() => handleToggleSelection(entity.pk, false)}
          >
            <div className="pool-status">✗</div>
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
                  handleMoveEntity(entity, 'allow');
                }}
                title="Include this song"
              >
                ✓
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );

  return (
    <div className="pool-page">
      <ThreePanelLayout
        leftPanel={leftPanel}
        centerPanel={centerPanel}
        rightPanel={rightPanel}
        className="pool-layout"
      />
    </div>
  );
}
