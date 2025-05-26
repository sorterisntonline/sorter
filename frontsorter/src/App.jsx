import React, { useState, useEffect } from 'react';
import './App.css'

import { useWebSocketContext } from './contexts/WebSocketContext';
import TagsListPage from './pages/TagsListPage';
import TagDetailPage from './pages/TagDetailPage';

function App() {
    const { isConnected, lastMessage, sendCommand } = useWebSocketContext();
    const [currentPageState, setCurrentPageState] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    // Handle WebSocket messages
    useEffect(() => {
        if (!lastMessage) return;

        switch (lastMessage.event) {
            case 'connected':
                console.log('Connected to WebSocket');
                // Navigate to tags list on connection
                sendCommand({ cmd: 'navigate_to_tags_list' });
                break;

            case 'page_state':
                console.log('Received page state:', lastMessage.state);
                setCurrentPageState(lastMessage.state);
                setIsLoading(false);
                break;

            case 'voting_progress':
                // Pass through to current page component
                break;

            case 'error':
                console.error('WebSocket error:', lastMessage.message);
                setIsLoading(false);
                break;

            default:
                console.log('Unknown event:', lastMessage.event);
        }
    }, [lastMessage, sendCommand]);

    // Show loading state
    if (isLoading || !currentPageState) {
        return (
            <div className="sorter-page">
                <div className="loading-container">
                    <div className="loading-spinner" />
                    <p className="loading-text">
                        {!isConnected ? 'Connecting...' : 'Loading...'}
                    </p>
                </div>
            </div>
        );
    }

    // Render the appropriate page based on server state
    switch (currentPageState.page) {
        case 'tags_list':
            return (
                <TagsListPageV2 
                    pageState={currentPageState}
                    sendCommand={sendCommand}
                    isConnected={isConnected}
                />
            );

        case 'tag_detail':
            return (
                <TagDetailPageV2 
                    pageState={currentPageState}
                    sendCommand={sendCommand}
                    isConnected={isConnected}
                    lastMessage={lastMessage}
                />
            );

        default:
            return (
                <div className="sorter-page">
                    <div className="empty-state">
                        <p>Unknown page state: {currentPageState.page}</p>
                    </div>
                </div>
            );
    }
}

// Temporary wrapper components until we create the V2 versions
function TagsListPageV2({ pageState, sendCommand, isConnected }) {
    const [localNewTagName, setLocalNewTagName] = useState('');

    // Sync local state with server state
    useEffect(() => {
        setLocalNewTagName(pageState.new_tag_name || '');
    }, [pageState.new_tag_name]);

    const handleCreateTag = () => {
        if (!localNewTagName.trim() || !isConnected) return;
        sendCommand({ cmd: 'create_tag' });
    };

    const handleNewTagNameChange = (name) => {
        setLocalNewTagName(name);
        sendCommand({ cmd: 'update_new_tag_name', name });
    };



    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleCreateTag();
        }
    };

    const handleTagClick = (tagId) => {
        sendCommand({ cmd: 'navigate_to_tag_detail', tag_id: tagId });
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
                        value={localNewTagName}
                        onChange={(e) => handleNewTagNameChange(e.target.value)}
                        onKeyDown={handleKeyPress}
                        placeholder="e.g., Startup Ideas, Book Recommendations..."
                        className="topic-input"
                        disabled={!isConnected}
                        style={{ flex: 1, marginBottom: 0 }}
                    />
                    <button
                        onClick={handleCreateTag}
                        disabled={!isConnected || !localNewTagName.trim()}
                        className="primary-button"
                    >
                        Create Collection
                    </button>
                </div>
            </div>

            {pageState.tags.length === 0 ? (
                <div className="empty-jobs">
                    <p className="empty-jobs-text">
                        No collections yet. Create your first collection above!
                    </p>
                </div>
            ) : (
                <>
                    <h2>Your collections:</h2>
                    <ul className="jobs-list">
                        {pageState.tags.map((tag) => (
                            <li
                                key={tag.id}
                                className="job-item"
                                onClick={() => handleTagClick(tag.id)}
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

function TagDetailPageV2() {
    // For now, use the existing TagDetailPage
    // TODO: Create a proper thin client version that uses pageState
    return <TagDetailPage />;
}

export default App
