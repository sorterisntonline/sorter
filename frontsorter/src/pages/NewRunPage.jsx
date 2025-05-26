import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import { useCombobox } from 'downshift';

const defaultPrompt = `Between A and B, which do you prefer?

<A>
{{A}}
</A>
<B>
{{B}}
</B>

if -50 is strongly prefer A, and 50 is strongly prefer B, then your answer should be a number between -50 and 50.
respond with some reasoning and your score. Your score will be read by this regex: /SCORE: (-?\\d+)/
`;

const poeticPrompts = [
  {
    name: "Pure Preference",
    prompt: defaultPrompt
  },
  {
    name: "Aesthetic Soul",
    prompt: `Which resonates more deeply with your aesthetic sensibility?

<A>
{{A}}
</A>
<B>
{{B}}
</B>

Consider beauty, elegance, and emotional resonance. Express your preference from -50 (strongly A) to 50 (strongly B).
Meditate on your choice and explain. Your score will be read by: /SCORE: (-?\\d+)/`
  },
  {
    name: "Pragmatic Mind", 
    prompt: `From a purely practical standpoint, which serves humanity better?

<A>
{{A}}
</A>
<B>
{{B}}
</B>

Consider utility, efficiency, and real-world impact. Rate from -50 (strongly A) to 50 (strongly B).
Explain your reasoning. Your score will be read by: /SCORE: (-?\\d+)/`
  }
];

function NewRunPage() {
  const { itemsetId } = useParams();
  const navigate = useNavigate();
  const { isConnected, sendCommand, lastMessage } = useWebSocketContext();
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [modelsLoading, setModelsLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [filteredModels, setFilteredModels] = useState([]);

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;

    switch (lastMessage.event) {
      case 'run_created':
        // Navigate to the new run and start voting automatically
        navigate(`/runs/${lastMessage.run_id}`);
        // Start voting automatically after a short delay to ensure navigation completes
        setTimeout(() => {
          sendCommand({ cmd: 'start_run_voting', run_id: lastMessage.run_id });
        }, 100);
        break;

      case 'error':
        console.error('WebSocket error:', lastMessage.message);
        break;
    }
  }, [lastMessage, navigate, sendCommand]);

  // Fetch models from OpenRouter API
  const fetchModels = async () => {
    setModelsLoading(true);
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models');
      const data = await response.json();
      
      if (data.data && Array.isArray(data.data)) {
        const filteredModels = data.data
          .filter(model => model.id)
          .sort((a, b) => (new Date(b.created_at) - new Date(a.created_at)));
        
        setModels(filteredModels);
        setFilteredModels(filteredModels);
        
        if (!selectedModel && filteredModels.length > 0) {
          setSelectedModel(filteredModels[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch models:', error);
    } finally {
      setModelsLoading(false);
    }
  };

  // Filter models based on input value
  useEffect(() => {
    if (!inputValue) {
      setFilteredModels(models);
    } else {
      const filtered = models.filter(model =>
        model.id.toLowerCase().includes(inputValue.toLowerCase())
      );
      setFilteredModels(filtered);
    }
  }, [models, inputValue]);

  // Fetch models on component mount
  useEffect(() => {
    fetchModels();
  }, []);

  // Combobox configuration
  const {
    isOpen,
    getMenuProps,
    getInputProps,
    highlightedIndex,
    getItemProps,
    selectedItem,
  } = useCombobox({
    items: filteredModels,
    itemToString: (item) => (item ? item.id : ''),
    selectedItem: models.find(model => model.id === selectedModel) || null,
    onInputValueChange: ({ inputValue }) => {
      setInputValue(inputValue || '');
    },
    onSelectedItemChange: ({ selectedItem }) => {
      if (selectedItem) {
        setSelectedModel(selectedItem.id);
      }
    },
  });

  const handleStartRun = () => {
    if (!itemsetId || !selectedModel || !prompt.trim()) return;

    sendCommand({
      cmd: 'create_run',
      itemset_id: itemsetId,
      prompt: prompt,
      model: selectedModel
    });
  };

  const handleCancel = () => {
    navigate(`/itemsets/${itemsetId}`);
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
              onClick={handleCancel}
              className="back-link"
            >
              ← Back to Itemset
            </button>
          </div>

          <h1>Reveal AI Preferences</h1>
          <p className="sorter-label">EXPLORE THE SOUL OF THE MACHINE</p>

          <h2>Whose preferences shall we explore?</h2>
          <div className="model-selector">
            <div className="model-input-container">
              <input
                {...getInputProps()}
                placeholder={modelsLoading ? "Summoning available minds..." : "Search for a model..."}
                className="model-input"
                disabled={!isConnected || modelsLoading}
              />
            </div>
            <ul
              {...getMenuProps()}
              className={`model-dropdown ${isOpen && filteredModels.length > 0 ? 'model-dropdown-open' : 'model-dropdown-closed'}`}
            >
              {isOpen &&
                filteredModels.map((item, index) => (
                  <li
                    key={item.id}
                    {...getItemProps({ item, index })}
                    className={`model-option ${highlightedIndex === index ? 'model-option-highlighted' : ''} ${selectedItem?.id === item.id ? 'model-option-selected' : ''}`}
                  >
                    <div className="model-id">@{item.id}</div>
                  </li>
                ))}
            </ul>
          </div>

          <h2>Through which lens?</h2>
          
          <div style={{ marginBottom: '1em' }}>
            <span className="sorter-label">PROMPT TEMPLATES</span>
            <div style={{ display: 'flex', gap: '0.5em', marginTop: '0.5em' }}>
              {poeticPrompts.map((template) => (
                <button
                  key={template.name}
                  onClick={() => setPrompt(template.prompt)}
                  className="back-link"
                  style={{ padding: '0.5em 1em', fontSize: '0.875em' }}
                >
                  {template.name}
                </button>
              ))}
            </div>
          </div>
          
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="topic-input"
            rows="13"
            disabled={!isConnected}
            placeholder="Craft your prompt to reveal deeper preferences..."
          />

          <div style={{ marginTop: '2em', display: 'flex', gap: '1em' }}>
            <button
              onClick={handleStartRun}
              disabled={!isConnected || !selectedModel || !prompt.trim()}
              className="primary-button"
            >
              ✨ Begin Revelation
            </button>
            <button
              onClick={handleCancel}
              className="back-link"
              style={{ padding: '0.75em 1.5em' }}
            >
              Cancel
            </button>
          </div>

          {!selectedModel && (
            <p className="warning-message">
              ⚡ Select a mind to explore
            </p>
          )}
        </section>
      </div>
      
      <div className="sidebar">
        <h2 style={{color: "black"}}>The Revelation Process</h2>
        <div className="empty-state">
          <p>We will systematically explore preferences by:</p>
          <ol style={{ textAlign: 'left', marginTop: '1em' }}>
            <li>Presenting every possible pair from your collection</li>
            <li>Recording not just choices, but reasoning</li>
            <li>Building a complete preference map</li>
            <li>Revealing the hidden structure of AI taste</li>
          </ol>
          <p style={{ marginTop: '1em' }}>
            Each model, each prompt reveals a different facet of machine consciousness.
          </p>
          <p style={{ marginTop: '1em', fontStyle: 'italic' }}>
            "In their preferences, we glimpse their souls."
          </p>
        </div>
      </div>
    </div>
  );
}

export default NewRunPage; 