import React, { useState, useEffect } from 'react';
import { useWebSocketContext } from '../contexts/WebSocketContext';

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
  const { isConnected, lastMessage, sendCommand } = useWebSocketContext();
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [items, setItems] = useState([]);
  const [currentItem, setCurrentItem] = useState('');
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [currentJobId, setCurrentJobId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;

    switch (lastMessage.event) {
      case 'job_created':
        setCurrentJobId(lastMessage.job_id);
        setItems([]);
        // Save the prompt with the job
        sendCommand({ cmd: 'get_job', job_id: lastMessage.job_id });
        break;

      case 'item_added':
        if (lastMessage.job_id === currentJobId) {
          setIsLoading(true);
        }
        break;

      case 'ranking':
        if (lastMessage.job_id === currentJobId) {
          setItems(lastMessage.items);
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
  }, [lastMessage, currentJobId, sendCommand]);

  // Create or get job on mount
  useEffect(() => {
    if (isConnected && !currentJobId) {
      // Create a new job with the default prompt
      sendCommand({ cmd: 'create_job', prompt: defaultPrompt });
    }
  }, [isConnected, currentJobId, sendCommand]);

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
          <div className="flex items-center gap-2 mb-4">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-gray-600">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
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
        {isLoading && (
          <div className="text-center py-4">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            <p className="mt-2 text-gray-600">Ranking items...</p>
          </div>
        )}
        
        {items.length > 0 && !isLoading && (
          <>
            <h2 style={{color: "black"}}>Ranked items:</h2>
            <ol className="ranked-list">
              {items.map((item, index) => (
                <li key={item.id} className="ranked-item">
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
                  {hoveredIndex === index && item.explanation && (
                    <p className="explanation">
                      {item.explanation}
                      {item.score && (
                        <span className="block mt-1 text-sm text-gray-600">
                          Score: {item.score.toFixed(1)}
                        </span>
                      )}
                    </p>
                  )}
                </li>
              ))}
            </ol>

            <hr />
          </>
        )}
      </div>
    </div>
  );
}

export default RankPage; 