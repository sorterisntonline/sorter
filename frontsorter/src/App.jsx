import React, { useState, useEffect } from 'react';
import './App.css'
import OpenRouterModelSelector from './components/OpenRouterModelSelector';

import { useWebSocketContext } from './contexts/WebSocketContext';

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

    const handleCreateTag = () => {
        if (!localNewTagName.trim() || !isConnected) return;
        sendCommand({ cmd: 'create_tag', name: localNewTagName.trim() });
        setLocalNewTagName(''); // Clear input after creating
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
                        onChange={(e) => setLocalNewTagName(e.target.value)}
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

function TagDetailPageV2({ pageState, sendCommand, isConnected, lastMessage }) {
    const [localNewItemText, setLocalNewItemText] = useState('');
    const [localNewAttributeLabel, setLocalNewAttributeLabel] = useState('');
    const [localNewAttributeTemplate, setLocalNewAttributeTemplate] = useState('');

    // Initialize local state from server state only once
    useEffect(() => {
        setLocalNewItemText(pageState.new_item_text || '');
    }, [pageState.tag.id]); // Only reset when switching tags

    useEffect(() => {
        setLocalNewAttributeLabel(pageState.new_attribute_label || '');
        setLocalNewAttributeTemplate(pageState.new_attribute_template || '');
    }, [pageState.show_new_attribute_form]); // Only reset when form opens/closes

    // Handle voting progress messages
    const [votingProgress, setVotingProgress] = useState(null);
    useEffect(() => {
        if (lastMessage?.event === 'voting_progress') {
            setVotingProgress(lastMessage);
        }
    }, [lastMessage]);

    const handleBackToCollections = () => {
        sendCommand({ cmd: 'navigate_to_tags_list' });
    };

    const handleAddItem = () => {
        if (!localNewItemText.trim() || !isConnected) return;
        sendCommand({ cmd: 'add_item', text: localNewItemText.trim() });
        setLocalNewItemText(''); // Clear input after adding
    };

    const handleSelectedVotersChange = (voterIds) => {
        sendCommand({ cmd: 'update_selected_voters', voter_ids: voterIds });
    };

    const handleSelectedAttributesChange = (attributeIds) => {
        sendCommand({ cmd: 'update_selected_attributes', attribute_ids: attributeIds });
    };

    const handleSortMissingPairs = () => {
        if (!isConnected || pageState.missing_comparisons.length === 0) return;
        sendCommand({ cmd: 'sort_missing_pairs' });
    };

    const handleToggleNewAttributeForm = () => {
        sendCommand({ cmd: 'toggle_new_attribute_form' });
    };

    const handleCreateAttribute = () => {
        if (!localNewAttributeLabel.trim() || !localNewAttributeTemplate.trim() || !isConnected) return;
        sendCommand({ 
            cmd: 'create_attribute', 
            label: localNewAttributeLabel.trim(),
            template: localNewAttributeTemplate.trim()
        });
        // Clear form after creating
        setLocalNewAttributeLabel('');
        setLocalNewAttributeTemplate('');
    };

    const handleCreateOrSelectVoter = (name) => {
        sendCommand({ cmd: 'create_or_select_voter', name });
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleAddItem();
        }
    };

    // Sort voters: those with votes first, then alphabetically
    const sortedVoters = [...pageState.voters]
        .filter(v => v.is_ai)
        .sort((a, b) => {
            const aHasVotes = pageState.voters_with_votes.includes(a.id);
            const bHasVotes = pageState.voters_with_votes.includes(b.id);
            
            if (aHasVotes && !bHasVotes) return -1;
            if (!aHasVotes && bHasVotes) return 1;
            return a.name.localeCompare(b.name);
        });

    // Prepare voter options for OpenRouterModelSelector
    const voterOptions = sortedVoters.map(voter => ({
        value: voter.id,
        label: `@${voter.name}`,
        data: voter,
        hasVotes: pageState.voters_with_votes.includes(voter.id)
    }));

    // Also prepare selected voter options using the voter names
    const selectedVoterOptions = pageState.selected_voters
        .map(voterId => voterOptions.find(opt => opt.value === voterId))
        .filter(Boolean);

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
                            onClick={handleBackToCollections}
                            className="back-link"
                        >
                            ← Back to Collections
                        </button>
                    </div>

                    <h1>{pageState.tag.name}</h1>
                    <p className="sorter-label">COLLECTION • {pageState.items.length} ITEMS</p>

                    <div className="job-control-panel">
                        <h2>Whose preferences to explore:</h2>
                        <div style={{ marginBottom: '1.5em' }}>
                            <div style={{ marginTop: '0.5em', marginBottom: '1em' }}>
                                <OpenRouterModelSelector
                                    value={selectedVoterOptions}
                                    onChange={(selectedOptions) => {
                                        // Separate existing voters from new models
                                        const existingVoterIds = [];
                                        const newModels = [];
                                        
                                        selectedOptions.forEach(option => {
                                            // Check if this is an existing voter by matching the label
                                            const existingVoter = voterOptions.find(v => 
                                                v.label === option.label
                                            );
                                            
                                            if (existingVoter) {
                                                existingVoterIds.push(existingVoter.value);
                                            } else {
                                                // This is a new model from OpenRouter
                                                const modelName = option.label.startsWith('@') 
                                                    ? option.label.substring(1) 
                                                    : option.value;
                                                newModels.push(modelName);
                                            }
                                        });
                                        
                                        // First, update selected voters with ONLY existing ones
                                        // This will clear any deselected voters
                                        handleSelectedVotersChange(existingVoterIds);
                                        
                                        // Then create new voters (they will be auto-selected by the backend)
                                        newModels.forEach(modelName => {
                                            handleCreateOrSelectVoter(modelName);
                                        });
                                    }}
                                />
                            </div>
                        </div>

                        <h2>Through which lens:</h2>
                        <div style={{ marginBottom: '1.5em' }}>
                            <div style={{ marginTop: '0.5em' }}>
                                <select
                                    value={pageState.selected_attributes[0] || ''}
                                    onChange={(e) => {
                                        const attributeIds = e.target.value ? [e.target.value] : [];
                                        handleSelectedAttributesChange(attributeIds);
                                    }}
                                    className="attribute-selector"
                                    style={{ width: '100%' }}
                                >
                                    <option value="">Select evaluation prompt...</option>
                                    {pageState.attributes.map(attr => (
                                        <option key={attr.id} value={attr.id}>
                                            {attr.label}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    onClick={handleToggleNewAttributeForm}
                                    className="back-link"
                                    style={{ marginTop: '0.5em', display: 'inline-block' }}
                                >
                                    + Create New Prompt
                                </button>
                            </div>
                        </div>

                        {pageState.missing_comparisons.length > 0 && 
                         pageState.selected_voters.length > 0 && 
                         pageState.selected_attributes.length > 0 && (
                            <div className="voting-status" style={{ marginBottom: '1em' }}>
                                🔄 {pageState.missing_comparisons.length} missing comparisons
                                {votingProgress && (
                                    <span style={{ marginLeft: '1em' }}>
                                        ({votingProgress.completed}/{votingProgress.total})
                                    </span>
                                )}
                            </div>
                        )}

                        <button
                            onClick={handleSortMissingPairs}
                            disabled={!isConnected || pageState.is_voting_in_progress || 
                                     pageState.missing_comparisons.length === 0 || 
                                     pageState.selected_voters.length === 0 || 
                                     pageState.selected_attributes.length === 0}
                            className="voting-button start-voting"
                        >
                            {pageState.is_voting_in_progress ? '⏳ Sorting...' : `Sort ${pageState.missing_comparisons.length} missing pairs`}
                        </button>
                    </div>

                    {pageState.show_new_attribute_form && (
                        <div className="job-control-panel" style={{ marginTop: '2em' }}>
                            <h3>Create new evaluation prompt:</h3>
                            
                            <input
                                type="text"
                                value={localNewAttributeLabel}
                                onChange={(e) => setLocalNewAttributeLabel(e.target.value)}
                                placeholder="Prompt name (e.g., Aesthetic Soul)"
                                className="topic-input"
                                style={{ marginBottom: '0.5em' }}
                            />
                            <textarea
                                value={localNewAttributeTemplate}
                                onChange={(e) => setLocalNewAttributeTemplate(e.target.value)}
                                placeholder="Enter your prompt template. Use {{A}} and {{B}} as placeholders..."
                                className="topic-input"
                                rows="10"
                            />
                            <div style={{ display: 'flex', gap: '1em' }}>
                                <button
                                    onClick={handleCreateAttribute}
                                    disabled={!isConnected || !localNewAttributeLabel.trim() || !localNewAttributeTemplate.trim()}
                                    className="primary-button"
                                >
                                    Create Prompt
                                </button>
                                <button
                                    onClick={handleToggleNewAttributeForm}
                                    className="back-link"
                                    style={{ padding: '0.75em 1.5em' }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </section>
            </div>
            
            <div className="sidebar">
                <h2 style={{color: "black"}}>Ensemble Rankings:</h2>
                {pageState.rankings.length === 0 ? (
                    <div className="empty-state">
                        <p>Add items below to see rankings</p>
                    </div>
                ) : (
                    <ol className="ranked-list">
                        {pageState.rankings.map((item) => (
                            <li key={item.item_id} className="ranked-item">
                                <p>{item.text}</p>
                                <div className="item-meta">
                                    <span className="score">
                                        Score: {item.score.toFixed(1)}
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ol>
                )}

                <div style={{ marginTop: '3em', borderTop: '1px solid #ddd', paddingTop: '2em' }}>
                    <h3 style={{ fontSize: '1em', marginBottom: '0.5em' }}>Add new item:</h3>
                    <textarea
                        value={localNewItemText}
                        onChange={(e) => setLocalNewItemText(e.target.value)}
                        onKeyDown={handleKeyPress}
                        placeholder="Type or paste your text here..."
                        className="item-textarea"
                        rows="3"
                        disabled={!isConnected}
                        style={{ marginBottom: '0.5em' }}
                    />
                    <button
                        className="submit-button"
                        onClick={handleAddItem}
                        disabled={!isConnected || !localNewItemText.trim()}
                        style={{ width: '100%' }}
                    >
                        Add Item
                    </button>
                </div>
            </div>
        </div>
    );
}

export default App
