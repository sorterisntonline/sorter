import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FaVoteYea, FaHistory, FaList, FaArrowLeft, FaArrowRight, FaTrash } from 'react-icons/fa';
import { AuthAPI } from '../api/auth';
import { fetchPairFn, submitVoteFn } from '../fetchers/voteEndpoints';
import VoteHistoryPanel from '../components/VoteHistoryPanel';
import '../styles/vote.css';
import '../styles/vote-modern.css';

interface RankedEntity {
  identifier: {
    ns: string;
    pk: string;
  };
  score: number;
}

interface VotePageEntity {
  ns: string;
  pk: string;
  title: string;
  metadata: any;
  profile_picture_url?: string;
}

function VotePage() {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  // Get parameters from URL
  const ns = searchParams.get('ns');
  const pk = searchParams.get('pk');

  // UI state
  const [activeTab, setActiveTab] = useState<'vote' | 'ranking' | 'history'>('vote');
  const [sliderValue, setSliderValue] = useState(0);

  // Get current user
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: AuthAPI.getMe,
    refetchOnWindowFocus: false,
  });

  // Query for ranking data based on context (ns/pk)
  const { data: ranking, isLoading: rankingLoading } = useQuery({
    queryKey: ['ranking', ns, pk],
    queryFn: () => {
      if (!ns || !pk) return null;
      return AuthAPI.getSpotifyRanking(ns, pk);
    },
    enabled: !!(ns && pk),
    refetchOnWindowFocus: false,
  });

  // Query for entities in this namespace to get metadata
  const { data: entities } = useQuery({
    queryKey: ['entities', ns],
    queryFn: async () => {
      if (!ns) return [];
      const response = await fetch(`/api/entity?ns=${encodeURIComponent(ns)}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch entities');
      return response.json();
    },
    enabled: !!ns,
    refetchOnWindowFocus: false,
  });

  // Query for getting pairs to vote on
  const { data: pairData, isLoading: pairLoading, refetch: refetchPair } = useQuery({
    queryKey: ['pair', 'children', ns, pk],
    queryFn: fetchPairFn,
    enabled: !!(ns && pk),
    refetchOnWindowFocus: false,
  });

  // Vote submission mutation
  const voteMutation = useMutation({
    mutationFn: submitVoteFn,
    onSuccess: () => {
      // Refresh data after vote
      queryClient.invalidateQueries({ queryKey: ['ranking', ns, pk] });
      queryClient.invalidateQueries({ queryKey: ['vote-history', user?.id] });
      refetchPair();
      setSliderValue(0);
    },
  });

  const handleVote = () => {
    if (!pairData || sliderValue === 0) return;

    const leftEntity = pairData.left_entity;
    const rightEntity = pairData.right_entity;

    // Determine which entity is preferred based on slider value
    const leftPreferred = sliderValue < 0;
    const magnitude = Math.abs(sliderValue);

    const voteData = leftPreferred ? {
      left_ns: leftEntity.ns,
      left_pk: leftEntity.pk,
      right_ns: rightEntity.ns,
      right_pk: rightEntity.pk,
      magnitude: magnitude,
      attribute_id: 1
    } : {
      left_ns: rightEntity.ns,
      left_pk: rightEntity.pk,
      right_ns: leftEntity.ns,
      right_pk: leftEntity.pk,
      magnitude: magnitude,
      attribute_id: 1
    };

    voteMutation.mutate(voteData);
  };

  // Process ranking data to get sorted entities with metadata
  const processedRanking = React.useMemo(() => {
    if (!ranking || !entities) return { ranked: [], unranked: [] };

    // Create a map of entities for quick lookup
    const entityMap = new Map();
    entities.forEach((entity: VotePageEntity) => {
      entityMap.set(`${entity.ns}:${entity.pk}`, entity);
    });

    // Process ranked entities
    const ranked = ranking.sorted.map((rankedEntity: RankedEntity) => {
      const key = `${rankedEntity.identifier.ns}:${rankedEntity.identifier.pk}`;
      const entity = entityMap.get(key);
      return {
        ...rankedEntity,
        entity: entity
      };
    }).filter((item: any) => item.entity); // Only include entities we have metadata for

    // Process unranked entities
    const unranked = ranking.unsorted.map((identifier: any) => {
      const key = `${identifier.ns}:${identifier.pk}`;
      return entityMap.get(key);
    }).filter((entity: any) => entity); // Only include valid entities

    return { ranked, unranked };
  }, [ranking, entities]);

  if (!ns || !pk) {
    return (
      <div className="vote-page">
        <div className="vote-header">
          <h1>Vote</h1>
          <p>Please provide 'ns' and 'pk' parameters in the URL to start voting.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="vote-page">
      <div className="vote-header">
        <h1><FaVoteYea /> Vote</h1>
        <p>Context: <code>{ns}</code> / <code>{pk}</code></p>

        {/* Tab Navigation */}
        <div className="vote-tabs">
          <button
            className={`vote-tab ${activeTab === 'vote' ? 'active' : ''}`}
            onClick={() => setActiveTab('vote')}
          >
            <FaVoteYea /> Vote
          </button>
          <button
            className={`vote-tab ${activeTab === 'ranking' ? 'active' : ''}`}
            onClick={() => setActiveTab('ranking')}
          >
            <FaList /> Rankings
          </button>
          <button
            className={`vote-tab ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <FaHistory /> History
          </button>
        </div>
      </div>

      <div className="vote-content">
        {/* Voting Tab */}
        {activeTab === 'vote' && (
          <div className="vote-panel">
            <h2>Compare & Vote</h2>
            {pairLoading ? (
              <div className="loading">Loading pair...</div>
            ) : pairData ? (
              <div className="vote-comparison">
                <div className="entity-pair">
                  <div className="entity-card left">
                    <h3>{pairData.left_entity.title}</h3>
                    {pairData.left_entity.profile_picture_url && (
                      <img
                        src={pairData.left_entity.profile_picture_url}
                        alt={pairData.left_entity.title}
                        className="entity-image"
                      />
                    )}
                    <p className="entity-id">
                      {pairData.left_entity.ns} / {pairData.left_entity.pk}
                    </p>
                  </div>

                  <div className="vs-section">
                    <div className="vs-label">VS</div>

                    {/* Voting Slider */}
                    <div className="vote-slider-container">
                      <div className="slider-labels">
                        <span className={sliderValue < 0 ? 'active' : ''}>
                          <FaArrowLeft /> Left
                        </span>
                        <span className="neutral">Neutral</span>
                        <span className={sliderValue > 0 ? 'active' : ''}>
                          Right <FaArrowRight />
                        </span>
                      </div>
                      <input
                        type="range"
                        min={-5}
                        max={5}
                        value={sliderValue}
                        onChange={(e) => setSliderValue(Number(e.target.value))}
                        className="vote-slider"
                      />
                      <div className="slider-value">
                        Strength: {Math.abs(sliderValue)} {sliderValue === 0 ? '(No vote)' : ''}
                      </div>
                    </div>

                    <button
                      className="vote-submit-btn"
                      onClick={handleVote}
                      disabled={sliderValue === 0 || voteMutation.isPending}
                    >
                      {voteMutation.isPending ? 'Voting...' : 'Submit Vote'}
                    </button>
                  </div>

                  <div className="entity-card right">
                    <h3>{pairData.right_entity.title}</h3>
                    {pairData.right_entity.profile_picture_url && (
                      <img
                        src={pairData.right_entity.profile_picture_url}
                        alt={pairData.right_entity.title}
                        className="entity-image"
                      />
                    )}
                    <p className="entity-id">
                      {pairData.right_entity.ns} / {pairData.right_entity.pk}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="no-pairs">
                <p>No pairs available for voting in this context.</p>
              </div>
            )}
          </div>
        )}

        {/* Rankings Tab */}
        {activeTab === 'ranking' && (
          <div className="ranking-panel">
            <h2>Current Rankings</h2>
            {rankingLoading ? (
              <div className="loading">Loading rankings...</div>
            ) : (
              <div className="ranking-content">
                {processedRanking.ranked.length > 0 && (
                  <div className="ranked-section">
                    <h3>Ranked Items ({processedRanking.ranked.length})</h3>
                    <div className="ranked-list">
                      {processedRanking.ranked.map((item, index) => (
                        <div key={`${item.identifier.ns}:${item.identifier.pk}`} className="ranked-item">
                          <div className="rank-number">#{index + 1}</div>
                          <div className="entity-info">
                            {item.entity?.profile_picture_url && (
                              <img
                                src={item.entity.profile_picture_url}
                                alt={item.entity.title}
                                className="entity-thumbnail"
                              />
                            )}
                            <div className="entity-details">
                              <h4>{item.entity?.title || item.identifier.pk}</h4>
                              <p className="entity-context">{item.identifier.ns} / {item.identifier.pk}</p>
                            </div>
                          </div>
                          <div className="score">
                            {item.score.toFixed(3)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {processedRanking.unranked.length > 0 && (
                  <div className="unranked-section">
                    <h3>Unranked Items ({processedRanking.unranked.length})</h3>
                    <div className="unranked-list">
                      {processedRanking.unranked.map((entity) => (
                        <div key={`${entity.ns}:${entity.pk}`} className="unranked-item">
                          <div className="entity-info">
                            {entity.profile_picture_url && (
                              <img
                                src={entity.profile_picture_url}
                                alt={entity.title}
                                className="entity-thumbnail"
                              />
                            )}
                            <div className="entity-details">
                              <h4>{entity.title}</h4>
                              <p className="entity-context">{entity.ns} / {entity.pk}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {processedRanking.ranked.length === 0 && processedRanking.unranked.length === 0 && (
                  <div className="no-ranking">
                    <p>No ranking data available. Start voting to generate rankings!</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="history-panel">
            <h2>Vote History</h2>
            {user ? (
              <VoteHistoryPanel user={user} selectedSong={null} />
            ) : (
              <div className="loading">Loading user data...</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default VotePage;