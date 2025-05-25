import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import { AnimatePresence, motion } from 'framer-motion';
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
`

function RankPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { isConnected, lastMessage, sendCommand } = useWebSocketContext();
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [items, setItems] = useState([]);
  const [currentItem, setCurrentItem] = useState('');
  const [expandedVotes, setExpandedVotes] = useState(null);
  const [currentJobId, setCurrentJobId] = useState(jobId || null);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingItems, setPendingItems] = useState(new Set());
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
        // Filter and sort models for better UX
        const filteredModels = data.data
          .filter(model => model.id)
          .sort((a, b) => (new Date(b.created_at) - new Date(a.created_at)));
        
        setModels(filteredModels);
        setFilteredModels(filteredModels);
        
        // Set default model if none selected
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

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;

    switch (lastMessage.event) {
      case 'job_created':
        setCurrentJobId(lastMessage.job_id);
        setItems([]);
        // Navigate to the new job URL
        navigate(`/rank/${lastMessage.job_id}`, { replace: true });
        break;

      case 'item_added':
        if (lastMessage.job_id === currentJobId) {
          // Add the item to pending items set
          setPendingItems(prev => new Set(prev).add(lastMessage.item_id));
        }
        break;

      case 'ranking':
        if (lastMessage.job_id === currentJobId) {
          setItems(lastMessage.items);
          // Clear pending items as they're now ranked
          setPendingItems(new Set());
          setIsLoading(false);
        }
        break;

      case 'job_data':
        if (lastMessage.job) {
          setCurrentJobId(lastMessage.job.id);
          setPrompt(lastMessage.job.prompt);
          setItems(lastMessage.job.items);
        }
        break;

      case 'item_deleted':
        if (lastMessage.job_id === currentJobId) {
          // Items will be updated by the following ranking event
        }
        break;

      case 'error':
        console.error('WebSocket error:', lastMessage.message);
        setIsLoading(false);
        break;
    }
  }, [lastMessage, currentJobId, navigate]);

  // Load job on mount or when jobId changes
  useEffect(() => {
    if (isConnected) {
      if (jobId) {
        // Load existing job
        setCurrentJobId(jobId);
        sendCommand({ cmd: 'get_job', job_id: jobId });
      } else if (!currentJobId) {
        // Create a new job if no ID provided
        sendCommand({ cmd: 'create_job', prompt: defaultPrompt });
      }
    }
  }, [isConnected, jobId, sendCommand]);

  const handleAddItem = async () => {
    if (!currentItem.trim() || !currentJobId || !isConnected) return;

    sendCommand({
      cmd: 'add_item',
      job_id: currentJobId,
      text: currentItem.trim()
    });
    
    setCurrentItem('');
  };

  const handleDeleteItem = (itemId) => {
    if (!currentJobId || !isConnected) return;

    sendCommand({
      cmd: 'delete_item',
      job_id: currentJobId,
      item_id: itemId
    });
  };

  const handlePromptChange = (newPrompt) => {
    setPrompt(newPrompt);
    // Create a new job with the new prompt
    if (isConnected) {
      sendCommand({ cmd: 'create_job', prompt: newPrompt });
    }
  };

  // Combobox configuration
  const {
    isOpen,
    getToggleButtonProps,
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
        // TODO: Send model selection to backend if needed
        // sendCommand({ cmd: 'set_model', job_id: currentJobId, model: selectedItem.id });
      }
    },
  });

  const handleBackToList = () => {
    navigate('/');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && e.shiftKey) {
      // Allow shift+enter for new lines
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddItem();
    }
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
              onClick={handleBackToList}
              className="back-link"
            >
              ← Back to Jobs
            </button>
          </div>

          <h2>Add new item:</h2>
          <textarea
            value={currentItem}
            onChange={(e) => setCurrentItem(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Type or paste your text here..."
            className="item-textarea"
            rows="4"
            disabled={!isConnected || !currentJobId}
          />
          <button
            className="submit-button"
            onClick={handleAddItem}
            disabled={!isConnected || !currentJobId || !currentItem.trim()}
            onMouseDown={(e) => e.target.classList.add('pressed')}
            onMouseUp={(e) => e.target.classList.remove('pressed')}
            onMouseLeave={(e) => e.target.classList.remove('pressed')}
          >
            Submit
          </button>
          <h2>Prompt:</h2>
          <textarea
            type="text"
            value={prompt}
            onChange={(e) => handlePromptChange(e.target.value)}
            className="topic-input"
            rows="13"
            disabled={!isConnected}
          />
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
        </section>
      </div>
      
      <div className="sidebar">
        {items.length > 0 && (
          <>
            <h2 style={{color: "black"}}>Ranked items:</h2>
            <ol className="ranked-list">
              <AnimatePresence mode="popLayout">
                {items.map((item, index) => (
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

            {pendingItems.size > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="pending-items"
              >
                Ranking {pendingItems.size} new item{pendingItems.size > 1 ? 's' : ''}...
              </motion.div>
            )}

            <hr />
          </>
        )}
        
        {items.length === 0 && !isLoading && (
          <div className="empty-state">
            <p>No items yet. Add some text to rank!</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default RankPage; 