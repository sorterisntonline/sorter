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

      case 'voting_progress':
        if (lastMessage.run_id === runId) {
          // Could show progress indicator
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
  }, [lastMessage, runId, sendCommand]);

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

          <h1>Ranking Run Results</h1>
          <p className="sorter-label">
            {itemset?.title || 'Unknown Itemset'} • {run.model || 'No model'} • {new Date(run.created_at).toLocaleString()}
          </p>

          <h2>Configuration:</h2>
          <div className="job-control-panel">
            <div className="job-status">
              Model: <strong>{run.model || 'Not selected'}</strong>
            </div>
            <div className="job-status">
              Status: <span className={`status-badge status-${run.status.replace('_', '-')}`}>
                {run.status.replace('_', ' ').toUpperCase()}
              </span>
            </div>
            <div className="job-status">
              Votes Cast: <strong>{run.votes?.length || 0}</strong>
            </div>
          </div>

          <h2>Prompt:</h2>
          <pre className="job-prompt" style={{ 
            whiteSpace: 'pre-wrap', 
            backgroundColor: '#f8f8f8', 
            padding: '1em',
            border: '1px solid #ddd'
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
                Start Voting
              </button>
            )}
            
            {votingInProgress && (
              <>
                <button
                  onClick={handleStopVoting}
                  disabled={!isConnected}
                  className="voting-button stop-voting"
                >
                  Stop Voting
                </button>
                <div className="voting-status">
                  🤖 AI is comparing items...
                </div>
              </>
            )}
          </div>
        </section>
      </div>
      
      <div className="sidebar">
        <h2 style={{color: "black"}}>Rankings:</h2>
        {rankedItems.length === 0 ? (
          <div className="empty-state">
            <p>No rankings yet. Start voting to see results!</p>
          </div>
        ) : (
          <ol className="ranked-list">
            <AnimatePresence mode="popLayout">
              {rankedItems.map((item, index) => (
                <motion.li 
                  key={item.id} 
                  className="ranked-item"
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
                    <span className="score">Score: {item.score.toFixed(1)}</span>
                    <a
                      href="#"
                      className={expandedVotes === index ? 'visited' : ''}
                      onClick={(e) => {
                        e.preventDefault();
                        setExpandedVotes(expandedVotes === index ? null : index);
                      }}
                    >
                      [{item.votes ? item.votes.length : 0} votes]
                    </a>
                  </div>
                  <AnimatePresence>
                    {expandedVotes === index && item.votes && item.votes.length > 0 && (
                      <motion.div 
                        className="vote-history"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <h4 className="vote-history-title">Voting History:</h4>
                        {item.votes.map((vote, voteIndex) => (
                          <div key={voteIndex} className="vote-record">
                            <div className="vote-opponent">
                              vs. "{vote.against_item_text.length > 50 ? 
                                vote.against_item_text.substring(0, 50) + '...' : 
                                vote.against_item_text}"
                            </div>
                            <div className="vote-score">
                              Score: {vote.score > 0 ? '+' : ''}{vote.score}
                            </div>
                            <div className="vote-reasoning">
                              {vote.reasoning}
                            </div>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        )}
      </div>
    </div>
  );
}

export default RunDetailPage;