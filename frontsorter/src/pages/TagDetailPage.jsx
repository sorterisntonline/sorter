import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import { DEFAULT_PROMPT_TEMPLATE, PROMPT_TEMPLATES } from '../constants/prompts';
import Select from 'react-select';
import AsyncSelect from 'react-select/async';

function TagDetailPage() {
  const { tagId } = useParams();
  const navigate = useNavigate();
  const { isConnected, lastMessage, sendCommand } = useWebSocketContext();
  
  // Core state - now mostly from server
  const [queryState, setQueryState] = useState(null);
  const [tag, setTag] = useState(null);
  
  // UI state
  const [newItemText, setNewItemText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [votingInProgress, setVotingInProgress] = useState(false);
  
  // Attribute creation state
  const [showNewAttribute, setShowNewAttribute] = useState(false);
  const [newAttributeLabel, setNewAttributeLabel] = useState('');
  const [newAttributeTemplate, setNewAttributeTemplate] = useState(DEFAULT_PROMPT_TEMPLATE);
  
  // Cache for models to avoid refetching
  const modelsCache = useRef(null);
  const modelsCacheTime = useRef(null);
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  // Load models with search
  const loadModelOptions = async (inputValue) => {
    try {
      // Check cache first
      const now = Date.now();
      if (modelsCache.current && modelsCacheTime.current && (now - modelsCacheTime.current < CACHE_DURATION)) {
        // Use cached data
        const filtered = modelsCache.current.filter(model =>
          !inputValue || model.id.toLowerCase().includes(inputValue.toLowerCase())
        );
        
        return filtered.slice(0, 50).map(model => ({
          value: model.id,
          label: `@${model.id}`,
          data: model
        }));
      }
      
      // Fetch fresh data
      const response = await fetch('https://openrouter.ai/api/v1/models');
      const data = await response.json();
      
      if (data.data && Array.isArray(data.data)) {
        const allModels = data.data
          .filter(model => model.id)
          .sort((a, b) => {
            // Sort by pricing.prompt ascending (cheapest first)
            const priceA = a.pricing?.prompt ? parseFloat(a.pricing.prompt) : 999;
            const priceB = b.pricing?.prompt ? parseFloat(b.pricing.prompt) : 999;
            return priceA - priceB;
          });
        
        // Cache the results
        modelsCache.current = allModels;
        modelsCacheTime.current = now;
        
        // Filter based on input
        const filtered = allModels.filter(model =>
          !inputValue || model.id.toLowerCase().includes(inputValue.toLowerCase())
        );
        
        // Return top 50 matches to avoid overwhelming the UI
        return filtered.slice(0, 50).map(model => ({
          value: model.id,
          label: `@${model.id}`,
          data: model
        }));
      }
      
      return [];
    } catch (error) {
      console.error('Failed to fetch models:', error);
      return [];
    }
  };

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;

    switch (lastMessage.event) {
      case 'tag_data':
        if (lastMessage.tag.id === tagId) {
          setTag(lastMessage.tag);
          setIsLoading(false);
        }
        break;

      case 'query_updated':
        if (lastMessage.state.tag_id === tagId) {
          setQueryState(lastMessage.state);
          setIsLoading(false);
        }
        break;

      case 'item_added':
        if (lastMessage.tag_id === tagId) {
          setNewItemText('');
          // Server will automatically send updated query state
        }
        break;

      case 'attribute_created':
        if (lastMessage.attribute.tag_id === tagId) {
          setShowNewAttribute(false);
          setNewAttributeLabel('');
          setNewAttributeTemplate(DEFAULT_PROMPT_TEMPLATE);
          // Auto-select the new attribute
          sendCommand({
            cmd: 'update_query',
            tag_id: tagId,
            attribute_ids: [lastMessage.attribute.id],
            voter_ids: queryState?.selected_voters || []
          });
        }
        break;

      case 'voting_started':
        setVotingInProgress(true);
        break;

      case 'voting_completed':
        setVotingInProgress(false);
        break;

      case 'voter_created':
        // Server will send updated voter list via query_updated
        break;

      case 'error':
        console.error('WebSocket error:', lastMessage.message);
        setIsLoading(false);
        break;
    }
  }, [lastMessage, tagId, queryState, sendCommand]);

  // Load initial data
  useEffect(() => {
    if (isConnected && tagId) {
      sendCommand({ cmd: 'get_tag', tag_id: tagId });
      // Request initial query state with empty selections
      sendCommand({ 
        cmd: 'update_query', 
        tag_id: tagId,
        attribute_ids: [],
        voter_ids: []
      });
    }
  }, [isConnected, tagId, sendCommand]);

  const handleAddItem = () => {
    if (!newItemText.trim() || !isConnected) return;

    sendCommand({
      cmd: 'add_item',
      tag_id: tagId,
      text: newItemText.trim()
    });
  };

  const handleSortMissingPairs = () => {
    if (!isConnected || !queryState || queryState.missing_comparisons.length === 0) return;

    sendCommand({
      cmd: 'sort_missing_pairs',
      tag_id: tagId,
      attribute_ids: queryState.selected_attributes,
      voter_ids: queryState.selected_voters,
      limit: null // Sort all missing pairs
    });
  };

  const handleCreateAttribute = () => {
    if (!newAttributeLabel.trim() || !newAttributeTemplate.trim() || !isConnected) return;

    sendCommand({
      cmd: 'create_attribute',
      tag_id: tagId,
      label: newAttributeLabel.trim(),
      template: newAttributeTemplate.trim()
    });
  };

  if (isLoading || !queryState) {
    return (
      <div className="sorter-page">
        <div className="loading-container">
          <div className="loading-spinner" />
          <p className="loading-text">Loading collection...</p>
        </div>
      </div>
    );
  }

  if (!tag) {
    return (
      <div className="sorter-page">
        <div className="empty-state">
          <p>Collection not found</p>
          <button onClick={() => navigate('/tags')} className="back-link">
            ← Back to Collections
          </button>
        </div>
      </div>
    );
  }

  // Sort voters: those with votes first, then alphabetically
  const sortedVoters = [...queryState.all_voters]
    .filter(v => v.is_ai)
    .sort((a, b) => {
      const aHasVotes = queryState.voters_with_votes.includes(a.id);
      const bHasVotes = queryState.voters_with_votes.includes(b.id);
      
      if (aHasVotes && !bHasVotes) return -1;
      if (!aHasVotes && bHasVotes) return 1;
      return a.name.localeCompare(b.name);
    });

  // Prepare options for react-select
  const voterOptions = sortedVoters.map(voter => ({
    value: voter.id,
    label: `@${voter.name}`,
    data: voter,
    hasVotes: queryState.voters_with_votes.includes(voter.id)
  }));

  const attributeOptions = queryState.all_attributes.map(attr => ({
    value: attr.id,
    label: attr.label,
    data: attr
  }));

  // Custom styles for react-select to match the theme
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

          <h1>{tag.name}</h1>
          <p className="sorter-label">COLLECTION • {queryState.all_items.length} ITEMS</p>

          <div className="job-control-panel">
            <h2>Whose preferences to explore:</h2>
            <div style={{ marginBottom: '1.5em' }}>
              <span className="sorter-label">SELECT AI MODELS</span>
              <div style={{ marginTop: '0.5em', marginBottom: '1em' }}>
                <AsyncSelect
                  isMulti
                  cacheOptions
                  defaultOptions
                  loadOptions={loadModelOptions}
                  value={voterOptions.filter(opt => queryState.selected_voters.includes(opt.value))}
                  onChange={(selectedOptions) => {
                    // Find which models need to be created as voters
                    const existingVoterNames = queryState.all_voters.filter(v => v.is_ai).map(v => v.name);
                    const modelsToCreate = selectedOptions
                      .filter(opt => !existingVoterNames.includes(opt.label.substring(1))) // Remove @ prefix
                      .map(opt => opt.label.substring(1)); // Remove @ prefix
                    
                    // Create new voters for models that don't exist yet
                    modelsToCreate.forEach(modelName => {
                      sendCommand({
                        cmd: 'create_human_voter',
                        name: modelName
                      });
                    });
                    
                    // Get voter IDs for selected models
                    const voterIds = selectedOptions
                      .filter(opt => opt.data) // Only existing voters have data
                      .map(opt => opt.value);
                    
                    // Send update query with selected voter IDs
                    sendCommand({
                      cmd: 'update_query',
                      tag_id: tagId,
                      attribute_ids: queryState.selected_attributes,
                      voter_ids: voterIds
                    });
                  }}
                  placeholder="Type to search AI models..."
                  styles={selectStyles}
                  className="model-selector"
                  classNamePrefix="select"
                  formatOptionLabel={(option) => (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.9em' }}>
                        {option.label}
                        {option.hasVotes && <span style={{ marginLeft: '0.5em', color: '#68693F' }}>✓</span>}
                      </span>
                      {option.data?.pricing?.prompt && (
                        <span style={{ fontSize: '0.8em', color: '#666', marginLeft: '1em' }}>
                          ${(parseFloat(option.data.pricing.prompt) * 1000000).toFixed(2)}/M
                        </span>
                      )}
                    </div>
                  )}
                />
              </div>
            </div>

            <h2>Through which lens:</h2>
            <div style={{ marginBottom: '1.5em' }}>
              <span className="sorter-label">EVALUATION PROMPTS</span>
              <div style={{ marginTop: '0.5em' }}>
                <Select
                  options={attributeOptions}
                  value={attributeOptions.find(opt => queryState.selected_attributes.includes(opt.value))}
                  onChange={(selectedOption) => {
                    const attributeIds = selectedOption ? [selectedOption.value] : [];
                    
                    // Send update query with new attribute selection
                    sendCommand({
                      cmd: 'update_query',
                      tag_id: tagId,
                      attribute_ids: attributeIds,
                      voter_ids: queryState.selected_voters
                    });
                  }}
                  placeholder="Select evaluation prompt..."
                  styles={selectStyles}
                  className="attribute-selector"
                  classNamePrefix="select"
                />
                <button
                  onClick={() => setShowNewAttribute(!showNewAttribute)}
                  className="back-link"
                  style={{ marginTop: '0.5em', display: 'inline-block' }}
                >
                  + Create New Prompt
                </button>
              </div>
            </div>

            {queryState.missing_comparisons.length > 0 && 
             queryState.selected_voters.length > 0 && 
             queryState.selected_attributes.length > 0 && (
              <div className="voting-status" style={{ marginBottom: '1em' }}>
                🔄 {queryState.missing_comparisons.length} missing comparisons
              </div>
            )}

            <button
              onClick={handleSortMissingPairs}
              disabled={!isConnected || votingInProgress || 
                       queryState.missing_comparisons.length === 0 || 
                       queryState.selected_voters.length === 0 || 
                       queryState.selected_attributes.length === 0}
              className="voting-button start-voting"
            >
              {votingInProgress ? '⏳ Sorting...' : `Sort ${queryState.missing_comparisons.length} missing pairs`}
            </button>
          </div>

          {showNewAttribute && (
            <div className="job-control-panel" style={{ marginTop: '2em' }}>
              <h3>Create new evaluation prompt:</h3>
              
              <div style={{ marginBottom: '1em' }}>
                <span className="sorter-label">QUICK TEMPLATES</span>
                <div style={{ display: 'flex', gap: '0.5em', marginTop: '0.5em', flexWrap: 'wrap' }}>
                  {PROMPT_TEMPLATES.map((template) => (
                    <button
                      key={template.label}
                      onClick={() => {
                        setNewAttributeLabel(template.label);
                        setNewAttributeTemplate(template.template);
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
                value={newAttributeLabel}
                onChange={(e) => setNewAttributeLabel(e.target.value)}
                placeholder="Prompt name (e.g., Aesthetic Soul)"
                className="topic-input"
                style={{ marginBottom: '0.5em' }}
              />
              <textarea
                value={newAttributeTemplate}
                onChange={(e) => setNewAttributeTemplate(e.target.value)}
                placeholder="Enter your prompt template. Use {{A}} and {{B}} as placeholders..."
                className="topic-input"
                rows="10"
              />
              <div style={{ display: 'flex', gap: '1em' }}>
                <button
                  onClick={handleCreateAttribute}
                  disabled={!isConnected || !newAttributeLabel.trim() || !newAttributeTemplate.trim()}
                  className="primary-button"
                >
                  Create Prompt
                </button>
                <button
                  onClick={() => {
                    setShowNewAttribute(false);
                    setNewAttributeLabel('');
                    setNewAttributeTemplate(DEFAULT_PROMPT_TEMPLATE);
                  }}
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
        {queryState.rankings.length === 0 ? (
          <div className="empty-state">
            <p>Add items below to see rankings</p>
          </div>
        ) : (
          <ol className="ranked-list">
            {queryState.rankings.map((item) => (
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
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
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
            disabled={!isConnected || !newItemText.trim()}
            style={{ width: '100%' }}
          >
            Add Item
          </button>
        </div>
      </div>
    </div>
  );
}

export default TagDetailPage; 