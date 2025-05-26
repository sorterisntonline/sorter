import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWebSocketContext } from '../contexts/WebSocketContext';

function TagsListPage() {
  const navigate = useNavigate();
  const { isConnected, lastMessage, sendCommand } = useWebSocketContext();
  const [tags, setTags] = useState([]);
  const [newTagName, setNewTagName] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;

    switch (lastMessage.event) {
      case 'tags_list':
        setTags(lastMessage.tags);
        setIsLoading(false);
        break;

      case 'tag_created':
        // Navigate to the new tag
        navigate(`/tags/${lastMessage.tag.id}`);
        break;

      case 'error':
        console.error('WebSocket error:', lastMessage.message);
        setIsLoading(false);
        break;
    }
  }, [lastMessage, navigate]);

  // Load tags on mount
  useEffect(() => {
    if (isConnected) {
      sendCommand({ cmd: 'list_tags' });
    }
  }, [isConnected, sendCommand]);

  const handleCreateTag = () => {
    if (!newTagName.trim() || !isConnected) return;

    sendCommand({
      cmd: 'create_tag',
      name: newTagName.trim()
    });
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCreateTag();
    }
  };

  return (
    <div className="jobs-page">
      <div className="jobs-header">
        <h1 className="jobs-title">Collections of Things to Compare</h1>
        <p className="jobs-subtitle">
          Each collection is a space to explore preferences across different minds and lenses.
        </p>
      </div>

      <div className="jobs-controls">
        <div className="connection-status">
          <div className={`status-indicator ${isConnected ? 'status-connected' : 'status-disconnected'}`} />
          <span className="status-text">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      <div style={{ marginBottom: '2em' }}>
        <h2>Create a new collection:</h2>
        <div style={{ display: 'flex', gap: '1em' }}>
          <input
            type="text"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="e.g., Startup Ideas, Book Recommendations..."
            className="topic-input"
            disabled={!isConnected}
            style={{ flex: 1, marginBottom: 0 }}
          />
          <button
            onClick={handleCreateTag}
            disabled={!isConnected || !newTagName.trim()}
            className="primary-button"
          >
            Create Collection
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="loading-container">
          <div className="loading-spinner" />
          <p className="loading-text">Loading collections...</p>
        </div>
      ) : tags.length === 0 ? (
        <div className="empty-jobs">
          <p className="empty-jobs-text">
            No collections yet. Create your first collection above!
          </p>
        </div>
      ) : (
        <>
          <h2>Your collections:</h2>
          <ul className="jobs-list">
            {tags.map((tag) => (
              <li
                key={tag.id}
                className="job-item"
                onClick={() => navigate(`/tags/${tag.id}`)}
              >
                <div className="job-header">
                  <h3 className="job-title">{tag.name}</h3>
                </div>
                <div className="job-details">
                  <p>Created: {new Date(tag.created_at).toLocaleString()}</p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default TagsListPage; 