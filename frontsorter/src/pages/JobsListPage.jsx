import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWebSocketContext } from '../contexts/WebSocketContext';

function JobsListPage() {
  const navigate = useNavigate();
  const { isConnected, lastMessage, sendCommand } = useWebSocketContext();
  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Request jobs list when connected
  useEffect(() => {
    if (isConnected) {
      setIsLoading(true);
      sendCommand({ cmd: 'list_jobs' });
    }
  }, [isConnected, sendCommand]);

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;

    switch (lastMessage.event) {
      case 'jobs_list':
        setJobs(lastMessage.jobs || []);
        setIsLoading(false);
        break;
      case 'job_created':
        // Refresh the list when a new job is created
        sendCommand({ cmd: 'list_jobs' });
        break;
      case 'error':
        console.error('WebSocket error:', lastMessage.message);
        setIsLoading(false);
        break;
    }
  }, [lastMessage, sendCommand]);

  const handleCreateNewJob = () => {
    navigate('/rank');
  };

  const handleSelectJob = (jobId) => {
    navigate(`/rank/${jobId}`);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Ranking Jobs</h1>
          <p className="text-gray-600">Select a job to continue ranking or create a new one.</p>
        </div>

        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-gray-600">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          
          <button
            onClick={handleCreateNewJob}
            disabled={!isConnected}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            Create New Job
          </button>
        </div>

        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            <p className="mt-2 text-gray-600">Loading jobs...</p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-500 mb-4">No ranking jobs yet.</p>
            <button
              onClick={handleCreateNewJob}
              disabled={!isConnected}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Create Your First Job
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => (
              <div
                key={job.id}
                onClick={() => handleSelectJob(job.id)}
                className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow cursor-pointer"
              >
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {job.prompt.split('\n')[0] || 'Untitled Job'}
                  </h3>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    job.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {job.status}
                  </span>
                </div>
                
                <div className="text-sm text-gray-600 space-y-1">
                  <p>{job.item_count} items</p>
                  <p>Created: {formatDate(job.created_at)}</p>
                </div>
                
                {job.prompt.length > 100 && (
                  <p className="mt-3 text-sm text-gray-500 line-clamp-2">
                    {job.prompt}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default JobsListPage; 