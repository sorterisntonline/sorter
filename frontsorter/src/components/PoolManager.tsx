import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  fetchPoolEntities,
  addToPool,
  blockFromPool,
  removeFromPool,
  batchPoolOperations,
  EntityWithPoolStatus,
  PoolOperation,
} from '../fetchers/poolEndpoints';

interface PoolManagerProps {
  namespace: string; // e.g., "spotify"
}

export function PoolManager({ namespace }: PoolManagerProps) {
  const queryClient = useQueryClient();
  const [selectedInPool, setSelectedInPool] = useState<Set<string>>(new Set());
  const [selectedNotInPool, setSelectedNotInPool] = useState<Set<string>>(new Set());

  // Fetch entities for each pool status
  const {
    data: inPoolEntities = [],
    isLoading: loadingInPool,
  } = useQuery({
    queryKey: ['poolEntities', { ns: namespace, status: 'in_pool' as const }],
    queryFn: fetchPoolEntities,
  });

  const {
    data: blockedEntities = [],
    isLoading: loadingBlocked,
  } = useQuery({
    queryKey: ['poolEntities', { ns: namespace, status: 'blocked' as const }],
    queryFn: fetchPoolEntities,
  });

  const {
    data: unclassifiedEntities = [],
    isLoading: loadingUnclassified,
  } = useQuery({
    queryKey: ['poolEntities', { ns: namespace, status: 'unclassified' as const }],
    queryFn: fetchPoolEntities,
  });

  // Combine blocked and unclassified for the "NOT IN POOL" panel
  const notInPoolEntities = [...blockedEntities, ...unclassifiedEntities];

  // Mutation for batch operations
  const batchMutation = useMutation({
    mutationFn: (operations: PoolOperation[]) => batchPoolOperations(operations),
    onSuccess: () => {
      // Invalidate all pool queries to refetch data
      queryClient.invalidateQueries({
        queryKey: ['poolEntities'],
      });
      // Clear selections
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
      setSelectedInPool(allKeys);
    } else {
      const allKeys = new Set(notInPoolEntities.map(e => e.pk));
      setSelectedNotInPool(allKeys);
    }
  };

  const handleMoveToPool = () => {
    const operations: PoolOperation[] = Array.from(selectedNotInPool).map(pk => ({
      entity_ns: namespace,
      entity_pk: pk,
      action: 'add' as const,
    }));
    batchMutation.mutate(operations);
  };

  const handleBlockSelected = () => {
    const operations: PoolOperation[] = Array.from(selectedInPool).map(pk => ({
      entity_ns: namespace,
      entity_pk: pk,
      action: 'block' as const,
    }));
    batchMutation.mutate(operations);
  };

  const handleRemoveSelected = () => {
    const operations: PoolOperation[] = [
      ...Array.from(selectedInPool).map(pk => ({
        entity_ns: namespace,
        entity_pk: pk,
        action: 'remove' as const,
      })),
      ...Array.from(selectedNotInPool).map(pk => ({
        entity_ns: namespace,
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

  const isLoading = loadingInPool || loadingBlocked || loadingUnclassified;

  if (isLoading) {
    return <div className="flex justify-center p-8">Loading pool data...</div>;
  }

  return (
    <div className="pool-manager">
      <div className="pool-panels">
        {/* IN POOL Panel */}
        <div className="pool-panel pool-panel-in">
          <div className="panel-header">
            <h3>IN POOL</h3>
            <span className="count">({inPoolEntities.length} items)</span>
          </div>
          
          <div className="panel-controls">
            <button
              onClick={() => handleSelectAll(true)}
              disabled={inPoolEntities.length === 0}
              className="select-all-btn"
            >
              Select All
            </button>
          </div>

          <div className="entity-list">
            {inPoolEntities.map((entity) => (
              <div
                key={entity.pk}
                className={`entity-item ${selectedInPool.has(entity.pk) ? 'selected' : ''}`}
                onClick={() => handleToggleSelection(entity.pk, true)}
              >
                <div className="entity-status">✓</div>
                <div className="entity-info">
                  <div className="entity-title">{entity.title || entity.pk}</div>
                  {entity.metadata && (
                    <div className="entity-meta">
                      {entity.metadata.artist && `${entity.metadata.artist} • `}
                      {entity.metadata.album}
                    </div>
                  )}
                </div>
                <button
                  className="entity-action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMoveEntity(entity, 'block');
                  }}
                  title="Block this entity"
                >
                  ✗
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* CONTROLS Panel */}
        <div className="pool-panel pool-panel-controls">
          <div className="panel-header">
            <h3>CONTROLS</h3>
          </div>

          <div className="control-buttons">
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
          </div>

          {batchMutation.isPending && (
            <div className="loading-indicator">Processing...</div>
          )}

          {batchMutation.error && (
            <div className="error-message">
              Error: {batchMutation.error.message}
            </div>
          )}
        </div>

        {/* NOT IN POOL Panel */}
        <div className="pool-panel pool-panel-out">
          <div className="panel-header">
            <h3>NOT IN POOL</h3>
            <span className="count">({notInPoolEntities.length} items)</span>
          </div>

          <div className="panel-controls">
            <button
              onClick={() => handleSelectAll(false)}
              disabled={notInPoolEntities.length === 0}
              className="select-all-btn"
            >
              Select All
            </button>
          </div>

          <div className="entity-list">
            {notInPoolEntities.map((entity) => (
              <div
                key={entity.pk}
                className={`entity-item ${selectedNotInPool.has(entity.pk) ? 'selected' : ''}`}
                onClick={() => handleToggleSelection(entity.pk, false)}
              >
                <div className="entity-status">
                  {entity.pool_status === 'blocked' ? '✗' : ''}
                </div>
                <div className="entity-info">
                  <div className="entity-title">{entity.title || entity.pk}</div>
                  {entity.metadata && (
                    <div className="entity-meta">
                      {entity.metadata.artist && `${entity.metadata.artist} • `}
                      {entity.metadata.album}
                    </div>
                  )}
                </div>
                <button
                  className="entity-action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMoveEntity(entity, 'add');
                  }}
                  title="Add this entity to pool"
                >
                  ✓
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
