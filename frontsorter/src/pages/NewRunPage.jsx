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

function NewRunPage() {
  const { itemsetId } = useParams();
  const navigate = useNavigate();
  const { isConnected, sendCommand } = useWebSocketContext();
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [modelsLoading, setModelsLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [filteredModels, setFilteredModels] = useState([]);

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

          <h1>Configure New Ranking Run</h1>
          <p className="sorter-label">SET UP YOUR RANKING PARAMETERS</p>

          <h2>Model:</h2>
          <div className="model-selector">
            <div className="model-input-container">
              <input
                {...getInputProps()}
                placeholder={modelsLoading ? "Loading models..." : "Search models..."}
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
                    <div className="model-id">{item.id}</div>
                  </li>
                ))}
            </ul>
          </div>

          <h2>Prompt:</h2>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="topic-input"
            rows="13"
            disabled={!isConnected}
            placeholder="Enter your comparison prompt..."
          />

          <div style={{ marginTop: '2em', display: 'flex', gap: '1em' }}>
            <button
              onClick={handleStartRun}
              disabled={!isConnected || !selectedModel || !prompt.trim()}
              className="primary-button"
            >
              Start Ranking Run
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
              ⚠️ Please select a model before starting the run
            </p>
          )}
        </section>
      </div>
      
      <div className="sidebar">
        <h2 style={{color: "black"}}>About Ranking Runs</h2>
        <div className="empty-state">
          <p>A ranking run will:</p>
          <ol style={{ textAlign: 'left', marginTop: '1em' }}>
            <li>Use your selected model to compare all items pairwise</li>
            <li>Apply your custom prompt to guide the comparisons</li>
            <li>Generate a complete ranking based on the AI's preferences</li>
            <li>Save all voting history for transparency</li>
          </ol>
          <p style={{ marginTop: '1em' }}>
            You can create multiple runs with different models or prompts to see how rankings change!
          </p>
        </div>
      </div>
    </div>
  );
}

export default NewRunPage; 