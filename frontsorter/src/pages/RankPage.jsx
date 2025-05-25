import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import { motion, AnimatePresence } from 'framer-motion';

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
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [currentJobId, setCurrentJobId] = useState(jobId || null);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingItems, setPendingItems] = useState(new Set());

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
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm text-gray-600">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <button
              onClick={handleBackToList}
              className="text-sm text-blue-600 hover:text-blue-800"
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
                        className={hoveredIndex === index ? 'visited' : ''}
                        onClick={(e) => {
                          e.preventDefault();
                          setHoveredIndex(hoveredIndex === index ? null : index);
                        }}
                      >
                        [Why?]
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
                      {hoveredIndex === index && item.explanation && (
                        <motion.p 
                          className="explanation"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          {item.explanation}
                          {item.score && (
                            <span className="block mt-1 text-sm text-gray-600">
                              Score: {item.score.toFixed(1)}
                            </span>
                          )}
                        </motion.p>
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
                className="text-center py-2 text-sm text-gray-500"
              >
                Ranking {pendingItems.size} new item{pendingItems.size > 1 ? 's' : ''}...
              </motion.div>
            )}

            <hr />
          </>
        )}
        
        {items.length === 0 && !isLoading && (
          <div className="text-center py-8 text-gray-500">
            <p>No items yet. Add some text to rank!</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default RankPage; 