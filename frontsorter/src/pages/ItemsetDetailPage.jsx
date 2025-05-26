import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWebSocketContext } from '../contexts/WebSocketContext';

function ItemsetDetailPage() {
  const { itemsetId } = useParams();
  const navigate = useNavigate();
  const { isConnected, lastMessage, sendCommand } = useWebSocketContext();
  const [itemset, setItemset] = useState(null);
  const [runs, setRuns] = useState([]);
  const [currentItem, setCurrentItem] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;

    switch (lastMessage.event) {
      case 'itemset_data':
        if (lastMessage.itemset.id === itemsetId) {
          setItemset(lastMessage.itemset);
          setIsLoading(false);
        }
        break;

      case 'runs_list':
        if (lastMessage.itemset_id === itemsetId) {
          setRuns(lastMessage.runs);
        }
        break;

      case 'item_added_to_itemset':
        if (lastMessage.itemset_id === itemsetId) {
          // Refresh itemset data
          sendCommand({ cmd: 'get_itemset', itemset_id: itemsetId });
        }
        break;

      case 'run_created':
        // Navigate to the new run
        navigate(`/runs/${lastMessage.run_id}`);
        break;

      case 'error':
        console.error('WebSocket error:', lastMessage.message);
        setIsLoading(false);
        break;
    }
  }, [lastMessage, itemsetId, navigate, sendCommand]);

  // Load itemset and runs on mount
  useEffect(() => {
    if (isConnected && itemsetId) {
      sendCommand({ cmd: 'get_itemset', itemset_id: itemsetId });
      sendCommand({ cmd: 'list_runs', itemset_id: itemsetId });
    }
  }, [isConnected, itemsetId, sendCommand]);

  const handleAddItem = () => {
    if (!currentItem.trim() || !itemsetId || !isConnected) return;

    sendCommand({
      cmd: 'add_item_to_itemset',
      itemset_id: itemsetId,
      text: currentItem.trim()
    });
    
    setCurrentItem('');
  };

  const handleDeleteItem = (itemId) => {
    if (!itemsetId || !isConnected) return;

    sendCommand({
      cmd: 'delete_item_from_itemset',
      itemset_id: itemsetId,
      item_id: itemId
    });
  };

  const handleStartRun = () => {
    navigate(`/itemsets/${itemsetId}/new-run`);
  };

  const handleRunClick = (runId) => {
    navigate(`/runs/${runId}`);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddItem();
    }
  };

  if (isLoading) {
    return (
      <div className="sorter-page">
        <div className="loading-container">
          <div className="loading-spinner" />
          <p className="loading-text">Loading itemset...</p>
        </div>
      </div>
    );
  }

  if (!itemset) {
    return (
      <div className="sorter-page">
        <div className="empty-state">
          <p>Itemset not found</p>
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
              onClick={() => navigate('/itemsets')}
              className="back-link"
            >
              ← Back to Itemsets
            </button>
          </div>

          <h1>{itemset.title}</h1>
          <p className="sorter-label">ITEMSET • {itemset.items.length} ITEMS</p>

          <h2>Add new item:</h2>
          <textarea
            value={currentItem}
            onChange={(e) => setCurrentItem(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Type or paste your text here..."
            className="item-textarea"
            rows="4"
            disabled={!isConnected}
          />
          <button
            className="submit-button"
            onClick={handleAddItem}
            disabled={!isConnected || !currentItem.trim()}
          >
            Add Item
          </button>

          <h2>Items in this set:</h2>
          {itemset.items.length === 0 ? (
            <div className="empty-state">
              <p>No items yet. Add some text above!</p>
            </div>
          ) : (
            <ol className="ranked-list">
              {itemset.items.map((item) => (
                <li key={item.id} className="ranked-item">
                  <p>{item.text}</p>
                  <div className="item-meta">
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        handleDeleteItem(item.id);
                      }}
                    >
                      [Delete]
                    </a>
                  </div>
                </li>
              ))}
            </ol>
          )}

          <div style={{ marginTop: '2em' }}>
            <button
              onClick={handleStartRun}
              disabled={!isConnected || itemset.items.length < 2}
              className="primary-button"
            >
              Start New Ranking Run
            </button>
            {itemset.items.length < 2 && (
              <p className="warning-message">
                Add at least 2 items before starting a ranking run
              </p>
            )}
          </div>
        </section>
      </div>
      
      <div className="sidebar">
        <h2 style={{color: "black"}}>Ranking Runs:</h2>
        {runs.length === 0 ? (
          <div className="empty-state">
            <p>No ranking runs yet. Start one to see how different models rank these items!</p>
          </div>
        ) : (
          <ul className="jobs-list" style={{ marginLeft: 0 }}>
            {runs.map((run) => (
              <li
                key={run.id}
                className="job-item"
                onClick={() => handleRunClick(run.id)}
                style={{ cursor: 'pointer' }}
              >
                <div className="job-header">
                  <h3 className="job-title" style={{ fontSize: '1em' }}>
                    {run.model || 'No model selected'}
                  </h3>
                  <span className={`job-status job-status-${run.status}`}>
                    {run.status}
                  </span>
                </div>
                <div className="job-details">
                  <p>Created: {new Date(run.created_at).toLocaleString()}</p>
                  <p>{run.vote_count || 0} votes cast</p>
                </div>
                <div className="job-prompt">
                  {run.prompt.substring(0, 100)}...
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default ItemsetDetailPage; 