import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import { DEFAULT_PROMPT_TEMPLATE, PROMPT_TEMPLATES } from '../constants/prompts';
import Select from 'react-select';
import OpenRouterModelSelector from '../components/OpenRouterModelSelector';

function TagDetailPageV2() {
  const { tagId } = useParams();
  const navigate = useNavigate();
  const { isConnected, lastMessage, sendCommand } = useWebSocketContext();
  
  // Only state: the entire page state from server
  const [pageState, setPageState] = useState(null);
  
  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;

    switch (lastMessage.event) {
      case 'page_state':
        if (lastMessage.state.tag.id === tagId) {
          setPageState(lastMessage.state);
        }
        break;

      case 'voting_progress':
        // Could show progress indicator if desired
        break;

      case 'error':
        console.error('WebSocket error:', lastMessage.message);
        break;
    }
  }, [lastMessage, tagId]);

  // Load initial page state
  useEffect(() => {
    if (isConnected && tagId) {
      sendCommand({ cmd: 'open_tag_detail', tag_id: tagId });
    }
  }, [isConnected, tagId, sendCommand]);

  // All UI interactions just send commands
  const handleAddItem = () => {
    sendCommand({ cmd: 'add_item', tag_id: tagId });
  };

  const handleUpdateItemText = (text) => {
    sendCommand({ cmd: 'update_new_item_text', tag_id: tagId, text });
  };

  const handleToggleAttributeForm = () => {
    sendCommand({ cmd: 'toggle_new_attribute_form', tag_id: tagId });
  };

  const handleUpdateAttributeLabel = (label) => {
    sendCommand({ cmd: 'update_new_attribute_label', tag_id: tagId, label });
  };

  const handleUpdateAttributeTemplate = (template) => {
    sendCommand({ cmd: 'update_new_attribute_template', tag_id: tagId, template });
  };

  const handleCreateAttribute = () => {
    sendCommand({ cmd: 'create_attribute', tag_id: tagId });
  };

  const handleUpdateSelectedVoters = (voterIds) => {
    sendCommand({ cmd: 'update_selected_voters', tag_id: tagId, voter_ids: voterIds });
  };

  const handleUpdateSelectedAttributes = (attributeIds) => {
    sendCommand({ cmd: 'update_selected_attributes', tag_id: tagId, attribute_ids: attributeIds });
  };

  const handleCreateOrSelectVoter = (name) => {
    sendCommand({ cmd: 'create_or_select_voter', tag_id: tagId, name });
  };

  const handleSortMissingPairs = () => {
    sendCommand({ cmd: 'sort_missing_pairs', tag_id: tagId });
  };

  if (!pageState) {
    return (
      <div className="sorter-page">
        <div className="loading-container">
          <div className="loading-spinner" />
          <p className="loading-text">Loading collection...</p>
        </div>
      </div>
    );
  }

  // Sort voters: those with votes first
  const sortedVoters = [...pageState.voters]
    .filter(v => v.is_ai)
    .sort((a, b) => {
      const aHasVotes = pageState.voters_with_votes.includes(a.id);
      const bHasVotes = pageState.voters_with_votes.includes(b.id);
      
      if (aHasVotes && !bHasVotes) return -1;
      if (!aHasVotes && bHasVotes) return 1;
      return a.name.localeCompare(b.name);
    });

  // Prepare options for react-select
  const voterOptions = sortedVoters.map(voter => ({
    value: voter.id,
    label: `@${voter.name}`,
    data: voter,
    hasVotes: pageState.voters_with_votes.includes(voter.id)
  }));

  const attributeOptions = pageState.attributes.map(attr => ({
    value: attr.id,
    label: attr.label,
    data: attr
  }));

  const selectStyles = {
    control: (base) => ({
      ...base,
      fontFamily: 'Georgia',
      fontSize: '1em',
      backgroundColor: '#fff',
      borderColor: '#ccc',
      minHeight: '2.5em',
      '&:hover': {
        borderColor: '#68693F'
      }
    }),
    menu: (base) => ({
      ...base,
      fontFamily: 'Georgia',
      backgroundColor: '#fff',
      border: '1px solid #ccc',
      marginTop: '0.25em'
    }),
    option: (base, state) => ({
      ...base,
      fontFamily: 'Georgia',
      backgroundColor: state.isSelected ? '#D2D6BC' : state.isFocused ? '#f5f5f5' : '#fff',
      color: state.isSelected ? '#68693F' : '#333',
      cursor: 'pointer',
      '&:active': {
        backgroundColor: '#D2D6BC'
      }
    }),
    multiValue: (base) => ({
      ...base,
      backgroundColor: '#D2D6BC',
      borderRadius: '0.25em'
    }),
    multiValueLabel: (base) => ({
      ...base,
      color: '#68693F',
      fontFamily: 'monospace',
      fontSize: '0.9em'
    }),
    multiValueRemove: (base) => ({
      ...base,
      color: '#68693F',
      cursor: 'pointer',
      '&:hover': {
        backgroundColor: '#68693F',
        color: '#fff'
      }
    }),
    placeholder: (base) => ({
      ...base,
      color: '#999'
    })
  };

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
              onClick={() => navigate('/tags')}
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
              <span className="sorter-label">SELECT AI MODELS</span>
              <div style={{ marginTop: '0.5em', marginBottom: '1em' }}>
                <OpenRouterModelSelector
                  value={voterOptions.filter(opt => pageState.selected_voters.includes(opt.value))}
                  onChange={(selectedOptions) => {
                    // Check if we need to create any new voters
                    selectedOptions.forEach(opt => {
                      if (!opt.data) {
                        // This is a new model, create it
                        handleCreateOrSelectVoter(opt.label.substring(1)); // Remove @ prefix
                      }
                    });
                    
                    // Update selected voters
                    const voterIds = selectedOptions
                      .filter(opt => opt.data) // Only existing voters
                      .map(opt => opt.value);
                    
                    handleUpdateSelectedVoters(voterIds);
                  }}
                />
              </div>
            </div>

            <h2>Through which lens:</h2>
            <div style={{ marginBottom: '1.5em' }}>
              <span className="sorter-label">EVALUATION PROMPTS</span>
              <div style={{ marginTop: '0.5em' }}>
                <Select
                  options={attributeOptions}
                  value={attributeOptions.find(opt => pageState.selected_attributes.includes(opt.value))}
                  onChange={(selectedOption) => {
                    const attributeIds = selectedOption ? [selectedOption.value] : [];
                    handleUpdateSelectedAttributes(attributeIds);
                  }}
                  placeholder="Select evaluation prompt..."
                  styles={selectStyles}
                  className="attribute-selector"
                  classNamePrefix="select"
                />
                <button
                  onClick={handleToggleAttributeForm}
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
              
              <div style={{ marginBottom: '1em' }}>
                <span className="sorter-label">QUICK TEMPLATES</span>
                <div style={{ display: 'flex', gap: '0.5em', marginTop: '0.5em', flexWrap: 'wrap' }}>
                  {PROMPT_TEMPLATES.map((template) => (
                    <button
                      key={template.label}
                      onClick={() => {
                        handleUpdateAttributeLabel(template.label);
                        handleUpdateAttributeTemplate(template.template);
                      }}
                      className="back-link"
                      style={{ padding: '0.5em 1em', fontSize: '0.875em' }}
                    >
                      {template.label}
                    </button>
                  ))}
                </div>
              </div>
              
              <input
                type="text"
                value={pageState.new_attribute_label}
                onChange={(e) => handleUpdateAttributeLabel(e.target.value)}
                placeholder="Prompt name (e.g., Aesthetic Soul)"
                className="topic-input"
                style={{ marginBottom: '0.5em' }}
              />
              <textarea
                value={pageState.new_attribute_template}
                onChange={(e) => handleUpdateAttributeTemplate(e.target.value)}
                placeholder="Enter your prompt template. Use {{A}} and {{B}} as placeholders..."
                className="topic-input"
                rows="10"
              />
              <div style={{ display: 'flex', gap: '1em' }}>
                <button
                  onClick={handleCreateAttribute}
                  disabled={!isConnected || !pageState.new_attribute_label.trim() || !pageState.new_attribute_template.trim()}
                  className="primary-button"
                >
                  Create Prompt
                </button>
                <button
                  onClick={handleToggleAttributeForm}
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
            value={pageState.new_item_text}
            onChange={(e) => handleUpdateItemText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleAddItem();
              }
            }}
            placeholder="Type or paste your text here..."
            className="item-textarea"
            rows="3"
            disabled={!isConnected}
            style={{ marginBottom: '0.5em' }}
          />
          <button
            className="submit-button"
            onClick={handleAddItem}
            disabled={!isConnected || !pageState.new_item_text.trim()}
            style={{ width: '100%' }}
          >
            Add Item
          </button>
        </div>
      </div>
    </div>
  );
}

export default TagDetailPageV2; 