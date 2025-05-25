import React, { useState } from 'react';
import { useWebSocketContext } from '../contexts/WebSocketContext';

export function WebSocketTest() {
  const { isConnected, lastMessage, error, sendCommand } = useWebSocketContext();
  const [prompt, setPrompt] = useState('');
  const [jobId, setJobId] = useState('');
  const [itemText, setItemText] = useState('');

  const handleCreateJob = () => {
    if (prompt.trim()) {
      sendCommand({ cmd: 'create_job', prompt: prompt.trim() });
      setPrompt('');
    }
  };

  const handleAddItem = () => {
    if (jobId && itemText.trim()) {
      sendCommand({ 
        cmd: 'add_item', 
        job_id: jobId, 
        text: itemText.trim() 
      });
      setItemText('');
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">WebSocket Test</h2>
      
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-4">
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            Error: {error}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="border rounded-lg p-4">
          <h3 className="font-semibold mb-2">Create Job</h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter prompt..."
              className="flex-1 px-3 py-2 border rounded"
              onKeyPress={(e) => e.key === 'Enter' && handleCreateJob()}
            />
            <button
              onClick={handleCreateJob}
              disabled={!isConnected || !prompt.trim()}
              className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300"
            >
              Create Job
            </button>
          </div>
        </div>

        <div className="border rounded-lg p-4">
          <h3 className="font-semibold mb-2">Add Item</h3>
          <div className="space-y-2">
            <input
              type="text"
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              placeholder="Job ID..."
              className="w-full px-3 py-2 border rounded"
            />
            <div className="flex gap-2">
              <input
                type="text"
                value={itemText}
                onChange={(e) => setItemText(e.target.value)}
                placeholder="Item text..."
                className="flex-1 px-3 py-2 border rounded"
              />
              <button
                onClick={handleAddItem}
                disabled={!isConnected || !jobId || !itemText.trim()}
                className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300"
              >
                Add Item
              </button>
            </div>
          </div>
        </div>

        {lastMessage && (
          <div className="border rounded-lg p-4">
            <h3 className="font-semibold mb-2">Last Message</h3>
            <pre className="bg-gray-100 p-2 rounded text-sm overflow-auto">
              {JSON.stringify(lastMessage, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
} 