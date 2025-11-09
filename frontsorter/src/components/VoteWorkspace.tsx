import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Entity } from '../api/entity';
import { RankingAPI } from '../api/ranking';
import { fetchPairFn, submitVoteFn } from '../fetchers/voteEndpoints';
import { getEntityRenderer } from '../renderers/entityRenderers';
import { AuthAPI } from '../api/auth';

interface VoteWorkspaceProps {
  parentEntity: Entity | null;
  user: any;
}

export function VoteWorkspace({ parentEntity, user }: VoteWorkspaceProps) {
  const [sliderValue, setSliderValue] = useState(0);
  const queryClient = useQueryClient();

  const ns = parentEntity?.ns;
  const pk = parentEntity?.pk;

  // Always call hooks unconditionally - use enabled flag to control execution
  // Get ranking data
  const { data: ranking, isLoading: rankingLoading } = useQuery({
    queryKey: ['ranking', ns, pk],
    queryFn: () => RankingAPI.getRanking(ns!, pk!),
    enabled: !!(ns && pk),
    refetchOnWindowFocus: false,
  });

  // Get entities for metadata
  const { data: entities } = useQuery({
    queryKey: ['entities', ns],
    queryFn: async () => {
      const response = await fetch(`/api/entity?ns=${encodeURIComponent(ns!)}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch entities');
      return response.json();
    },
    enabled: !!ns,
    refetchOnWindowFocus: false,
  });

  // Get voting pair
  const { data: pairData, isLoading: pairLoading, refetch: refetchPair } = useQuery({
    queryKey: ['pair', 'children', ns, pk],
    queryFn: fetchPairFn,
    enabled: !!(ns && pk),
    refetchOnWindowFocus: false,
  });

  // Vote mutation
  const voteMutation = useMutation({
    mutationFn: submitVoteFn,
    onSuccess: () => {
      if (ns && pk) {
        queryClient.invalidateQueries({ queryKey: ['ranking', ns, pk] });
      }
      queryClient.invalidateQueries({ queryKey: ['vote-history', user?.id] });
      refetchPair();
      setSliderValue(0);
    },
  });

  // Early return AFTER all hooks are called
  if (!parentEntity) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
        Select an entity to start voting on its children
      </div>
    );
  }

  const handleVote = () => {
    if (!pairData || sliderValue === 0) return;

    const leftEntity = pairData.left_entity;
    const rightEntity = pairData.right_entity;
    const leftPreferred = sliderValue < 0;
    const magnitude = Math.abs(sliderValue);

    const voteData = leftPreferred
      ? {
          left_ns: leftEntity.ns,
          left_pk: leftEntity.pk,
          right_ns: rightEntity.ns,
          right_pk: rightEntity.pk,
          magnitude: magnitude,
          attribute_id: 1,
        }
      : {
          left_ns: rightEntity.ns,
          left_pk: rightEntity.pk,
          right_ns: leftEntity.ns,
          right_pk: leftEntity.pk,
          magnitude: magnitude,
          attribute_id: 1,
        };

    voteMutation.mutate(voteData);
  };

  // Process ranking data
  const processedRanking = React.useMemo(() => {
    if (!ranking || !entities) return { ranked: [], unranked: [] };

    const entityMap = new Map();
    entities.forEach((entity: Entity) => {
      entityMap.set(`${entity.ns}:${entity.pk}`, entity);
    });

    const ranked = ranking.sorted
      .map((rankedEntity: any) => {
        const key = `${rankedEntity.identifier.ns}:${rankedEntity.identifier.pk}`;
        const entity = entityMap.get(key);
        return entity ? { ...rankedEntity, entity } : null;
      })
      .filter(Boolean);

    const unranked = ranking.unsorted
      .map((identifier: any) => {
        const key = `${identifier.ns}:${identifier.pk}`;
        return entityMap.get(key);
      })
      .filter(Boolean);

    return { ranked, unranked };
  }, [ranking, entities]);

  const leftRenderer = pairData?.left_entity ? getEntityRenderer(pairData.left_entity) : null;
  const rightRenderer = pairData?.right_entity ? getEntityRenderer(pairData.right_entity) : null;

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflowY: 'auto',
        padding: '20px',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h2>Voting on children of: {parentEntity.title || `${parentEntity.ns}/${parentEntity.pk}`}</h2>
      </div>

      {/* Voting Interface */}
      {pairLoading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>Loading pair...</div>
      ) : pairData ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px',
            marginBottom: '40px',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: '40px',
              width: '100%',
              justifyContent: 'center',
            }}
          >
            {/* Left Entity */}
            <div style={{ flex: 1, maxWidth: '400px' }}>
              {leftRenderer?.renderVoteCard(pairData.left_entity)}
            </div>

            {/* VS Section */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '20px',
              }}
            >
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>VS</div>

              {/* Slider */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '300px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span>Left</span>
                  <span>Neutral</span>
                  <span>Right</span>
                </div>
                <input
                  type="range"
                  min={-5}
                  max={5}
                  value={sliderValue}
                  onChange={(e) => setSliderValue(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
                <div style={{ textAlign: 'center', fontSize: '14px' }}>
                  Strength: {Math.abs(sliderValue)} {sliderValue === 0 ? '(No vote)' : ''}
                </div>
              </div>

              <button
                onClick={handleVote}
                disabled={sliderValue === 0 || voteMutation.isPending}
                style={{
                  padding: '12px 24px',
                  fontSize: '16px',
                  cursor: sliderValue === 0 || voteMutation.isPending ? 'not-allowed' : 'pointer',
                  backgroundColor: sliderValue === 0 ? '#ccc' : '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                }}
              >
                {voteMutation.isPending ? 'Voting...' : 'Submit Vote'}
              </button>
            </div>

            {/* Right Entity */}
            <div style={{ flex: 1, maxWidth: '400px' }}>
              {rightRenderer?.renderVoteCard(pairData.right_entity)}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
          No pairs available for voting
        </div>
      )}

      {/* Rankings Section */}
      <div style={{ marginTop: '40px' }}>
        <h3>Current Rankings</h3>
        {rankingLoading ? (
          <div>Loading rankings...</div>
        ) : (
          <>
            {processedRanking.ranked.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <h4>Ranked ({processedRanking.ranked.length})</h4>
                <div>
                  {processedRanking.ranked.map((item: any, index: number) => {
                    const renderer = item.entity ? getEntityRenderer(item.entity) : null;
                    return (
                      <div
                        key={`${item.identifier.ns}:${item.identifier.pk}`}
                        style={{
                          padding: '8px',
                          borderBottom: '1px solid #eee',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                        }}
                      >
                        <span style={{ fontWeight: 'bold', minWidth: '30px' }}>#{index + 1}</span>
                        {renderer?.renderRow(
                          item.entity,
                          false,
                          () => {}
                        )}
                        <span style={{ marginLeft: 'auto', color: '#666' }}>
                          {item.score.toFixed(3)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {processedRanking.unranked.length > 0 && (
              <div>
                <h4>Unranked ({processedRanking.unranked.length})</h4>
                <div>
                  {processedRanking.unranked.map((entity: Entity) => {
                    const renderer = getEntityRenderer(entity);
                    return (
                      <div key={`${entity.ns}:${entity.pk}`}>
                        {renderer.renderRow(entity, false, () => {})}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

