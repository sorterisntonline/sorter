import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWebSocketContext } from '../contexts/WebSocketContext';

function ItemsetsPage() {
  const navigate = useNavigate();
  const { isConnected, lastMessage, sendCommand } = useWebSocketContext();
  const [itemsets, setItemsets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewItemsetForm, setShowNewItemsetForm] = useState(false);
  const [newItemsetTitle, setNewItemsetTitle] = useState('');

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;

    switch (lastMessage.event) {
      case 'itemsets_list':
        setItemsets(lastMessage.itemsets);
        setIsLoading(false);
        break;

      case 'itemset_created':
        // Navigate to the new itemset
        navigate(`/itemsets/${lastMessage.itemset_id}`);
        break;

      case 'error':
        console.error('WebSocket error:', lastMessage.message);
        setIsLoading(false);
        break;
    }
  }, [lastMessage, navigate]);

  // Load itemsets on mount
  useEffect(() => {
    if (isConnected) {
      sendCommand({ cmd: 'list_itemsets' });
    }
  }, [isConnected, sendCommand]);

  const handleCreateItemset = () => {
    if (!newItemsetTitle.trim() || !isConnected) return;

    sendCommand({
      cmd: 'create_itemset',
      title: newItemsetTitle.trim()
    });
  };

  const handleItemsetClick = (itemsetId) => {
    navigate(`/itemsets/${itemsetId}`);
  };

  return (
    <div className="jobs-page">
      <div className="jobs-header">
        <h1 className="jobs-title">Your Itemsets</h1>
        <p className="jobs-subtitle">
          Collections of items to rank with different models and prompts
        </p>
      </div>

      <div className="jobs-controls">
        <div className="connection-status">
          <div className={`status-indicator ${isConnected ? 'status-connected' : 'status-disconnected'}`} />
          <span className="status-text">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        
        {!showNewItemsetForm ? (
          <button
            onClick={() => setShowNewItemsetForm(true)}
            disabled={!isConnected}
            className="primary-button"
          >
            New Itemset
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '1em', alignItems: 'center' }}>
            <input
              type="text"
              value={newItemsetTitle}
              onChange={(e) => setNewItemsetTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateItemset();
                if (e.key === 'Escape') {
                  setShowNewItemsetForm(false);
                  setNewItemsetTitle('');
                }
              }}
              placeholder="Itemset title..."
              className="topic-input"
              style={{ marginBottom: 0, width: '20em' }}
              autoFocus
            />
            <button
              onClick={handleCreateItemset}
              disabled={!newItemsetTitle.trim()}
              className="primary-button"
            >
              Create
            </button>
            <button
              onClick={() => {
                setShowNewItemsetForm(false);
                setNewItemsetTitle('');
              }}
              className="back-link"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="loading-container">
          <div className="loading-spinner" />
          <p className="loading-text">Loading itemsets...</p>
        </div>
      ) : itemsets.length === 0 ? (
        <div className="empty-jobs">
          <p className="empty-jobs-text">
            No itemsets yet. Create your first collection of items to rank!
          </p>
        </div>
      ) : (
        <ul className="jobs-list">
          {itemsets.map((itemset) => (
            <li
              key={itemset.id}
              className="job-item"
              onClick={() => handleItemsetClick(itemset.id)}
            >
              <div className="job-header">
                <h3 className="job-title">{itemset.title}</h3>
                <span className="job-status job-status-active">
                  {itemset.items.length} items
                </span>
              </div>
              <div className="job-details">
                <p>Created: {new Date(itemset.created_at).toLocaleDateString()}</p>
                <p>{itemset.run_count || 0} ranking runs</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ItemsetsPage; 