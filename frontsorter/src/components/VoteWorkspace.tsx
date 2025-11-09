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
  const { data: ranking, isLoading: rankingLoading, error: rankingError } = useQuery({
    queryKey: ['ranking', ns, pk],
    queryFn: async () => {
      const result = await RankingAPI.getRanking(ns!, pk!);
      return result;
    },
    enabled: !!(ns && pk),
    refetchOnWindowFocus: false,
  });

  // Get entities for metadata - fetch children entities, not entities in parent namespace
  // Note: This is kept for potential future use, but ranking is now handled in FinderColumn
  const { data: entities } = useQuery({
    queryKey: ['entity-children', ns, pk],
    queryFn: async () => {
      if (!ns || !pk) return [];
      const response = await fetch(
        `/api/entity/${encodeURIComponent(ns)}/${encodeURIComponent(pk)}?children=true`,
        {
          credentials: 'include',
        }
      );
      if (!response.ok) throw new Error('Failed to fetch children entities');
      const data = await response.json();
      return data.children || [];
    },
    enabled: false, // Disabled - ranking now handled in FinderColumn
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
      <div style={{ padding: '40px', textAlign: 'center', color: '#999', backgroundColor: '#000', height: '100vh' }}>
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
        backgroundColor: '#000',
        color: '#fff',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        {/* Removed redundant header - breadcrumb shows context */}
      </div>

      {/* Voting Interface */}
      {pairLoading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>Loading pair...</div>
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
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#fff' }}>VS</div>

              {/* Slider */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '300px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#fff' }}>
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
                <div style={{ textAlign: 'center', fontSize: '14px', color: '#fff' }}>
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
        <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
          No pairs available for voting
        </div>
      )}
    </div>
  );
}

