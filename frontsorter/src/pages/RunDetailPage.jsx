import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import { AnimatePresence, motion } from 'framer-motion';

function RunDetailPage() {
  const { runId } = useParams();
  const navigate = useNavigate();
  const { isConnected, lastMessage, sendCommand } = useWebSocketContext();
  const [run, setRun] = useState(null);
  const [itemset, setItemset] = useState(null);
  const [rankedItems, setRankedItems] = useState([]);
  const [expandedVotes, setExpandedVotes] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [votingInProgress, setVotingInProgress] = useState(false);
  const [activeTab, setActiveTab] = useState('ranking');

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;

    switch (lastMessage.event) {
      case 'run_data':
        if (lastMessage.run.id === runId) {
          setRun(lastMessage.run);
          setVotingInProgress(lastMessage.run.status === 'voting_in_progress');
          // Process rankings
          if (lastMessage.run.rankings && lastMessage.itemset) {
            const itemsMap = new Map(lastMessage.itemset.items.map(item => [item.id, item]));
            const ranked = lastMessage.run.rankings
              .sort((a, b) => a.rank - b.rank)
              .map(ranking => ({
                ...itemsMap.get(ranking.item_id),
                score: ranking.score,
                votes: lastMessage.run.votes.filter(vote => 
                  vote.item_a_id === ranking.item_id || vote.item_b_id === ranking.item_id
                ).map(vote => {
                  const isItemA = vote.item_a_id === ranking.item_id;
                  const againstId = isItemA ? vote.item_b_id : vote.item_a_id;
                  const againstItem = itemsMap.get(againstId);
                  return {
                    against_item_id: againstId,
                    against_item_text: againstItem?.text || 'Unknown item',
                    score: isItemA ? -vote.score : vote.score, // Flip score if item was B
                    reasoning: vote.reasoning
                  };
                })
              }));
            setRankedItems(ranked);
            setItemset(lastMessage.itemset);
          }
          setIsLoading(false);
        }
        break;

      case 'run_voting_started':
        if (lastMessage.run_id === runId) {
          setVotingInProgress(true);
        }
        break;

      case 'vote_added':
        if (lastMessage.run_id === runId) {
          setRun(prevRun => ({
            ...prevRun,
            votes: [...(prevRun?.votes || []), lastMessage.vote]
          }));
        }
        break;

      case 'intermediate_rankings':
        if (lastMessage.run_id === runId && itemset) {
          const itemsMap = new Map(itemset.items.map(item => [item.id, item]));
          
          // Process ranked items
          const ranked = lastMessage.ranked
            .sort((a, b) => a.rank - b.rank)
            .map(ranking => {
              const item = itemsMap.get(ranking.item_id);
              return {
                ...item,
                score: ranking.score,
                votes: [] // We'll populate this in the render based on current run.votes
              };
            });
          
          // Process unranked items (items with no votes)
          const unranked = lastMessage.unranked
            .map(ranking => {
              const item = itemsMap.get(ranking.item_id);
              return {
                ...item,
                score: ranking.score,
                votes: []
              };
            });
          
          // Combine ranked and unranked, with ranked items first
          setRankedItems([...ranked, ...unranked]);
        }
        break;

      case 'voting_completed':
        if (lastMessage.run_id === runId) {
          setVotingInProgress(false);
          // Refresh run data to get final rankings
          sendCommand({ cmd: 'get_run', run_id: runId });
        }
        break;

      case 'error':
        console.error('WebSocket error:', lastMessage.message);
        setIsLoading(false);
        break;
    }
  }, [lastMessage, runId, sendCommand, itemset]);

  // Load run on mount
  useEffect(() => {
    if (isConnected && runId) {
      sendCommand({ cmd: 'get_run', run_id: runId });
    }
  }, [isConnected, runId, sendCommand]);

  const handleBackToItemset = () => {
    if (itemset) {
      navigate(`/itemsets/${itemset.id}`);
    } else {
      navigate('/itemsets');
    }
  };

  const handleStartVoting = () => {
    if (runId) {
      sendCommand({ cmd: 'start_run_voting', run_id: runId });
      setVotingInProgress(true);
    }
  };

  const handleStopVoting = () => {
    if (runId) {
      sendCommand({ cmd: 'stop_run_voting', run_id: runId });
      setVotingInProgress(false);
    }
  };

  const handleDeleteRun = () => {
    if (!runId || !isConnected) return;
    
    const confirmDelete = window.confirm(
      'Are you sure you want to delete this preference revelation? This action cannot be undone.'
    );
    
    if (confirmDelete) {
      sendCommand({ cmd: 'delete_run', run_id: runId });
      // Navigate back to itemset after deletion
      if (itemset) {
        navigate(`/itemsets/${itemset.id}`);
      } else {
        navigate('/itemsets');
      }
    }
  };

  if (isLoading) {
    return (
      <div className="sorter-page">
        <div className="loading-container">
          <div className="loading-spinner" />
          <p className="loading-text">Loading run results...</p>
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="sorter-page">
        <div className="empty-state">
          <p>Run not found</p>
          <button onClick={() => navigate('/itemsets')} className="back-link">
            ← Back to Itemsets
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sorter-page">
      <div className="content">
        <section>
          <div className="page-header">
            <div className="connection-status">
              <div className={`status-indicator ${isConnected ? 'status-connected' : 'status-disconnected'}`} />
              <span className="status-text">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <button
              onClick={handleBackToItemset}
              className="back-link"
            >
              ← Back to {itemset?.title || 'Itemset'}
            </button>
          </div>

          <h1>Preference Revelation</h1>
          <p className="sorter-label">
            {itemset?.title || 'Unknown Collection'} • @{run.model || 'unknown'} • {new Date(run.created_at).toLocaleString()}
          </p>

          <h2>The Mind Explored:</h2>
          <div className="job-control-panel">
            <div className="job-status">
              Soul: <strong>@{run.model || 'Not selected'}</strong>
            </div>
            <div className="job-status">
              Status: <span className={`status-badge status-${run.status.replace('_', '-')}`}>
                {run.status.replace('_', ' ').toUpperCase()}
              </span>
            </div>
            <div className="job-status">
              Preferences Revealed: <strong>{run.votes?.length || 0}</strong>
            </div>
          </div>

          <h2>The Lens Applied:</h2>
          <pre className="job-prompt" style={{ 
            whiteSpace: 'pre-wrap', 
            backgroundColor: '#f8f8f8', 
            padding: '1em',
            border: '1px solid #ddd',
            fontStyle: 'italic'
          }}>
            {run.prompt}
          </pre>

          <h2>Actions:</h2>
          <div className="voting-controls">
            {run.status === 'created' && (
              <button
                onClick={handleStartVoting}
                disabled={!isConnected || votingInProgress}
                className="voting-button start-voting"
              >
                Begin Revelation
              </button>
            )}
            
            {votingInProgress && (
              <>
                <button
                  onClick={handleStopVoting}
                  disabled={!isConnected}
                  className="voting-button stop-voting"
                >
                  Pause Revelation
                </button>
                <div className="voting-status">
                  ✨ The machine contemplates...
                  <div style={{ marginTop: '0.5em', fontSize: '0.875em', color: '#666' }}>
                    Adaptively exploring preferences...
                  </div>
                </div>
              </>
            )}
            
            <div style={{ marginTop: '2em' }}>
              <button
                onClick={handleDeleteRun}
                disabled={!isConnected}
                className="delete-button"
                style={{
                  padding: '0.75em 1.5em',
                  backgroundColor: '#CC0000',
                  color: '#fff',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'Georgia',
                  fontSize: '1em',
                  borderRadius: '0.25em'
                }}
                onMouseOver={(e) => e.target.style.backgroundColor = '#AA0000'}
                onMouseOut={(e) => e.target.style.backgroundColor = '#CC0000'}
              >
                🗑️ Delete Revelation
              </button>
            </div>
          </div>
        </section>
      </div>
      
      <div className="sidebar">
        <div className="tab-panel">
          <div className="tab-buttons">
            <button
              className={`tab-button ${activeTab === 'ranking' ? 'tab-active' : ''}`}
              onClick={() => setActiveTab('ranking')}
            >
              Revealed Preferences
            </button>
            <button
              className={`tab-button ${activeTab === 'votes' ? 'tab-active' : ''}`}
              onClick={() => setActiveTab('votes')}
            >
              All Votes ({run?.votes?.length || 0})
            </button>
          </div>
        </div>

        {activeTab === 'ranking' ? (
          <>
            <h2 style={{color: "black"}}>Revealed Preferences:</h2>
            {rankedItems.length === 0 ? (
              <div className="empty-state">
                <p>No preferences revealed yet. Begin the revelation to explore this mind's taste.</p>
              </div>
            ) : (
              <ol className="ranked-list">
                <AnimatePresence mode="popLayout">
                  {rankedItems.map((item, index) => {
                    // Calculate votes for this item dynamically
                    const itemVotes = run?.votes?.filter(vote => 
                      vote.item_a_id === item.id || vote.item_b_id === item.id
                    ).map(vote => {
                      const isItemA = vote.item_a_id === item.id;
                      const againstId = isItemA ? vote.item_b_id : vote.item_a_id;
                      const againstItem = itemset?.items.find(i => i.id === againstId);
                      return {
                        against_item_id: againstId,
                        against_item_text: againstItem?.text || 'Unknown item',
                        score: isItemA ? -vote.score : vote.score,
                        reasoning: vote.reasoning
                      };
                    }) || [];

                    const isUnranked = itemVotes.length === 0;

                    return (
                      <motion.li 
                        key={item.id} 
                        className={`ranked-item ${isUnranked ? 'unranked-item' : ''}`}
                        layout
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ 
                          type: "spring",
                          stiffness: 500,
                          damping: 30,
                          opacity: { duration: 0.1 }
                        }}
                      >
                        <p>{item.text}</p>
                        <div className="item-meta">
                          <span className="score">
                            Score: {item.score.toFixed(1)}
                            {isUnranked && <em> (no votes)</em>}
                          </span>
                          <a
                            href="#"
                            className={expandedVotes === index ? 'visited' : ''}
                            onClick={(e) => {
                              e.preventDefault();
                              if (!isUnranked) {
                                setExpandedVotes(expandedVotes === index ? null : index);
                              }
                            }}
                          >
                            [{itemVotes.length} votes]
                          </a>
                        </div>
                        <AnimatePresence>
                          {expandedVotes === index && itemVotes.length > 0 && (
                            <motion.div 
                              className="vote-history"
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2 }}
                            >
                              <h4 className="vote-history-title">The Mind's Reasoning:</h4>
                              {itemVotes.map((vote, voteIndex) => (
                                <div key={voteIndex} className="vote-record">
                                  <div className="vote-opponent">
                                    compared to: "{vote.against_item_text.length > 50 ? 
                                      vote.against_item_text.substring(0, 50) + '...' : 
                                      vote.against_item_text}"
                                  </div>
                                  <div className="vote-score">
                                    Preference: {vote.score > 0 ? '+' : ''}{vote.score}
                                  </div>
                                  <div className="vote-reasoning">
                                    <em>"{vote.reasoning}"</em>
                                  </div>
                                </div>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ol>
            )}
          </>
        ) : (
          <>
            <h2 style={{color: "black"}}>All Votes:</h2>
            {run?.votes?.length === 0 ? (
              <div className="empty-state">
                <p>No votes recorded yet.</p>
              </div>
            ) : (
              <div className="votes-list">
                {run?.votes?.map((vote, index) => {
                  const itemA = itemset?.items.find(item => item.id === vote.item_a_id);
                  const itemB = itemset?.items.find(item => item.id === vote.item_b_id);
                  
                  return (
                    <div key={index} className="vote-card">
                      <div className="vote-comparison">
                        <div className="vote-item">
                          <span className="vote-label">A:</span>
                          <p className="vote-text">"{itemA?.text || 'Unknown item'}"</p>
                        </div>
                        <div className="vote-versus">vs</div>
                        <div className="vote-item">
                          <span className="vote-label">B:</span>
                          <p className="vote-text">"{itemB?.text || 'Unknown item'}"</p>
                        </div>
                      </div>
                      <div className="vote-result">
                        <div className="vote-score-display">
                          <span className="vote-direction">
                            {vote.score < 0 ? '← Prefers A' : vote.score > 0 ? 'Prefers B →' : 'Neutral'}
                          </span>
                          <span className="vote-magnitude">
                            Score: {vote.score > 0 ? '+' : ''}{vote.score}
                          </span>
                        </div>
                        <div className="vote-reasoning">
                          <em>"{vote.reasoning}"</em>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default RunDetailPage;