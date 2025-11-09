import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FaGithub, FaPlus, FaEye, FaExternalLinkAlt, FaClock, FaComment, FaTag, FaVoteYea, FaSync } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { AuthAPI } from '../api/auth';
import {
  ingestRepository,
  resyncRepository,
  fetchGitHubRepos,
  fetchGitHubIssues,
  IngestRepoRequest
} from '../fetchers/githubEndpoints';
import '../styles/github.css';

interface Repository {
  user_id: string;
  ns: string;
  pk: string;
  title: string;
  profile_picture_url: string;
  metadata: {
    id: number;
    name: string;
    full_name: string;
    html_url: string;
    description?: string;
    language?: string;
    stargazers_count: number;
    watchers_count: number;
    forks_count: number;
    open_issues_count: number;
    created_at: string;
    updated_at: string;
    owner: {
      login: string;
      avatar_url: string;
      html_url: string;
    };
  };
  created_at: string;
}

interface Issue {
  user_id: string;
  ns: string;
  pk: string;
  title: string;
  profile_picture_url: string;
  metadata: {
    id: number;
    number: number;
    title: string;
    body?: string;
    state: string;
    html_url: string;
    comments: number;
    labels: Array<{
      name: string;
      color: string;
      description?: string;
    }>;
    user: {
      login: string;
      avatar_url: string;
      html_url: string;
    };
    created_at: string;
    updated_at: string;
    closed_at?: string;
  };
  created_at: string;
}

function GitHubPage() {
  const queryClient = useQueryClient();
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [isIngestFormOpen, setIsIngestFormOpen] = useState(false);
  const [newRepoOwner, setNewRepoOwner] = useState('');
  const [newRepoName, setNewRepoName] = useState('');

  // Query for current user info
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: AuthAPI.getMe,
    refetchOnWindowFocus: false,
  });

  // Fetch repositories
  const { data: repositories, isLoading: reposLoading, error: reposError } = useQuery<Repository[]>({
    queryKey: ['github-repos'],
    queryFn: fetchGitHubRepos,
    refetchOnWindowFocus: false,
    onSuccess: (data) => {
      console.log('GitHub repositories loaded:', data);
    },
    onError: (error) => {
      console.error('Failed to load repositories:', error);
    },
  });

  // Fetch issues for selected repository
  const { data: issues, isLoading: issuesLoading } = useQuery<Issue[]>({
    queryKey: ['github-issues', selectedRepo?.pk],
    queryFn: () => selectedRepo ? fetchGitHubIssues(selectedRepo.pk) : Promise.resolve([]),
    enabled: !!selectedRepo,
    refetchOnWindowFocus: false,
  });

  // Mutation for ingesting new repositories
  const ingestMutation = useMutation({
    mutationFn: (data: IngestRepoRequest) => ingestRepository(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['github-repos'] });
      queryClient.invalidateQueries({ queryKey: ['github-issues'] });
      setIsIngestFormOpen(false);
      setNewRepoOwner('');
      setNewRepoName('');
    },
  });

  // Mutation for resyncing existing repositories
  const resyncMutation = useMutation({
    mutationFn: (data: IngestRepoRequest) => resyncRepository(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['github-repos'] });
      queryClient.invalidateQueries({ queryKey: ['github-issues'] });
    },
  });

  const handleIngestRepo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRepoOwner.trim() || !newRepoName.trim()) return;

    ingestMutation.mutate({
      owner: newRepoOwner.trim(),
      repo: newRepoName.trim()
    });
  };

  const handleResyncRepo = (repo: Repository) => {
    const [owner, repoName] = repo.metadata.full_name.split('/');
    resyncMutation.mutate({
      owner,
      repo: repoName
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) return `${diffInDays}d ago`;
    const diffInMonths = Math.floor(diffInDays / 30);
    return `${diffInMonths}mo ago`;
  };

  return (
    <div className="github-page">
      <div className="github-header">
        <div className="header-content">
          <div className="header-title">
            <FaGithub className="header-icon" />
            <h1>GitHub Repository Manager</h1>
          </div>
          <button
            className="btn-primary"
            onClick={() => setIsIngestFormOpen(true)}
            disabled={ingestMutation.isPending}
          >
            <FaPlus /> Add Repository
          </button>
        </div>
      </div>

      <div className="github-content">
        {/* Repository List */}
        <div className="repo-panel">
          <div className="panel-header">
            <h2>Repositories ({repositories?.length || 0})</h2>
          </div>

          {reposLoading ? (
            <div className="loading">Loading repositories...</div>
          ) : reposError ? (
            <div className="error-state">
              <p>Failed to load repositories</p>
              <p>{reposError.message}</p>
            </div>
          ) : repositories?.length === 0 ? (
            <div className="empty-state">
              <FaGithub size={48} />
              <p>No repositories yet</p>
              <button
                className="btn-secondary"
                onClick={() => setIsIngestFormOpen(true)}
              >
                Add your first repository
              </button>
            </div>
          ) : (
            <div className="repo-list">
              {repositories?.map((repo) => {
                // Defensive check for metadata structure
                if (!repo.metadata || !repo.metadata.owner) {
                  console.warn('Repository missing metadata or owner:', repo);
                  return null;
                }

                return (
                  <div
                    key={repo.pk}
                    className={`repo-card ${selectedRepo?.pk === repo.pk ? 'selected' : ''}`}
                    onClick={() => setSelectedRepo(repo)}
                  >
                    <div className="repo-header">
                      <img
                        src={repo.metadata.owner.avatar_url}
                        alt={repo.metadata.owner.login}
                        className="owner-avatar"
                      />
                      <div className="repo-info">
                        <h3>{repo.metadata.full_name}</h3>
                        {repo.metadata.description && (
                          <p className="repo-description">{repo.metadata.description}</p>
                        )}
                      </div>
                      <div className="repo-actions">
                        <button
                          className={`resync-btn ${resyncMutation.isPending ? 'spinning' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleResyncRepo(repo);
                          }}
                          disabled={resyncMutation.isPending}
                          title="Resync repository"
                        >
                          <FaSync />
                        </button>
                        <a
                          href={repo.metadata.html_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="external-link"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <FaExternalLinkAlt />
                        </a>
                      </div>
                    </div>

                    <div className="repo-stats">
                      <span className="stat">
                        ⭐ {repo.metadata.stargazers_count || 0}
                      </span>
                      <span className="stat">
                        🍴 {repo.metadata.forks_count || 0}
                      </span>
                      <span className="stat">
                        🐛 {repo.metadata.open_issues_count || 0}
                      </span>
                      {repo.metadata.language && (
                        <span className="language">{repo.metadata.language}</span>
                      )}
                    </div>

                    <div className="repo-dates">
                      <span>Updated {formatRelativeTime(repo.metadata.updated_at)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Issues Panel */}
        <div className="issues-panel">
          {selectedRepo ? (
            <>
              <div className="panel-header">
                <h2>Open Issues in {selectedRepo.metadata.name}</h2>
                <div className="panel-actions">
                  <span className="issue-count">{issues?.length || 0} open issues</span>
                  {issues && issues.length > 1 && (
                    <Link
                      to={`/vote?ns=github.issue&pk=${encodeURIComponent(selectedRepo.pk)}`}
                      className="btn-vote"
                    >
                      <FaVoteYea /> Start Voting
                    </Link>
                  )}
                </div>
              </div>

              {issuesLoading ? (
                <div className="loading">Loading issues...</div>
              ) : issues?.length === 0 ? (
                <div className="empty-state">
                  <FaComment size={32} />
                  <p>No open issues found</p>
                </div>
              ) : (
                <div className="issues-list">
                  {issues?.map((issue) => (
                    <div key={issue.pk} className="issue-card">
                      <div className="issue-header">
                        <div className="issue-title-row">
                          <h4 className="issue-title">{issue.metadata.title}</h4>
                          <span className={`issue-state ${issue.metadata.state}`}>
                            {issue.metadata.state}
                          </span>
                        </div>
                        <div className="issue-meta">
                          <span className="issue-number">#{issue.metadata.number}</span>
                          <span className="issue-author">
                            by {issue.metadata.user.login}
                          </span>
                          <span className="issue-date">
                            <FaClock /> {formatRelativeTime(issue.metadata.updated_at)}
                          </span>
                        </div>
                      </div>

                      {issue.metadata.labels.length > 0 && (
                        <div className="issue-labels">
                          {issue.metadata.labels.map((label, index) => (
                            <span
                              key={index}
                              className="issue-label"
                              style={{ backgroundColor: `#${label.color}` }}
                            >
                              <FaTag /> {label.name}
                            </span>
                          ))}
                        </div>
                      )}

                      {issue.metadata.body && (
                        <div className="issue-body">
                          {issue.metadata.body.substring(0, 200)}
                          {issue.metadata.body.length > 200 && '...'}
                        </div>
                      )}

                      <div className="issue-footer">
                        <span className="issue-comments">
                          <FaComment /> {issue.metadata.comments} comments
                        </span>
                        <a
                          href={issue.metadata.html_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="issue-link"
                        >
                          View on GitHub <FaExternalLinkAlt />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="no-repo-selected">
              <FaEye size={48} />
              <h3>Select a Repository</h3>
              <p>Choose a repository from the list to view its issues</p>
            </div>
          )}
        </div>
      </div>

      {/* Ingest Form Modal */}
      {isIngestFormOpen && (
        <div className="modal-overlay" onClick={() => setIsIngestFormOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add GitHub Repository</h3>
              <button
                className="modal-close"
                onClick={() => setIsIngestFormOpen(false)}
                disabled={ingestMutation.isPending}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleIngestRepo} className="ingest-form">
              <div className="form-group">
                <label htmlFor="owner">Repository Owner</label>
                <input
                  id="owner"
                  type="text"
                  value={newRepoOwner}
                  onChange={(e) => setNewRepoOwner(e.target.value)}
                  placeholder="e.g., octocat"
                  required
                  disabled={ingestMutation.isPending}
                />
              </div>

              <div className="form-group">
                <label htmlFor="repo">Repository Name</label>
                <input
                  id="repo"
                  type="text"
                  value={newRepoName}
                  onChange={(e) => setNewRepoName(e.target.value)}
                  placeholder="e.g., Hello-World"
                  required
                  disabled={ingestMutation.isPending}
                />
              </div>

              {ingestMutation.error && (
                <div className="error-message">
                  {ingestMutation.error.message}
                </div>
              )}

              <div className="form-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsIngestFormOpen(false)}
                  disabled={ingestMutation.isPending}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={ingestMutation.isPending || !newRepoOwner.trim() || !newRepoName.trim()}
                >
                  {ingestMutation.isPending ? 'Adding...' : 'Add Repository'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default GitHubPage;