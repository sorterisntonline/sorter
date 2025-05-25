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
    <div className="jobs-page">
      <div className="jobs-header">
        <h1 className="jobs-title">Ranking Jobs</h1>
        <p className="jobs-subtitle">Select a job to continue ranking or create a new one.</p>
      </div>

      <div className="jobs-controls">
        <div className="connection-status">
          <div className={`status-indicator ${isConnected ? 'status-connected' : 'status-disconnected'}`} />
          <span className="status-text">
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        
        <button
          onClick={handleCreateNewJob}
          disabled={!isConnected}
          className="primary-button"
        >
          Create New Job
        </button>
      </div>

      {isLoading ? (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p className="loading-text">Loading jobs...</p>
        </div>
      ) : jobs.length === 0 ? (
        <div className="empty-jobs">
          <p className="empty-jobs-text">No ranking jobs yet.</p>
          <button
            onClick={handleCreateNewJob}
            disabled={!isConnected}
            className="primary-button"
          >
            Create Your First Job
          </button>
        </div>
      ) : (
        <div className="jobs-list">
          {jobs.map((job) => (
            <div
              key={job.id}
              onClick={() => handleSelectJob(job.id)}
              className="job-item"
            >
              <div className="job-header">
                <h3 className="job-title">
                  {job.prompt.split('\n')[0] || 'Untitled Job'}
                </h3>
                <span className={`job-status ${
                  job.status === 'active' ? 'job-status-active' : 'job-status-inactive'
                }`}>
                  {job.status}
                </span>
              </div>
              
              <div className="job-details">
                <p>{job.item_count} items</p>
                <p>Created: {formatDate(job.created_at)}</p>
              </div>
              
              {job.prompt.length > 100 && (
                <p className="job-prompt">
                  {job.prompt}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default JobsListPage; 