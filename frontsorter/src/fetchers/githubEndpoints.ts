// --- GitHub API Fetchers ---

export interface IngestRepoRequest {
  owner: string;
  repo: string;
}

export interface IngestRepoResponse {
  repo_ns: string;
  repo_pk: string;
  issues_ingested: number;
  message: string;
}

export const ingestRepository = async (data: IngestRepoRequest): Promise<IngestRepoResponse> => {
  const res = await fetch('/api/github/ingest', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `Failed to ingest repository: ${res.status}`);
  }

  return res.json();
};

export const resyncRepository = async (data: IngestRepoRequest): Promise<IngestRepoResponse> => {
  const res = await fetch('/api/github/resync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorData.error || `Failed to resync repository: ${res.status}`);
  }

  return res.json();
};

export const fetchGitHubRepos = async () => {
  const res = await fetch('/api/entity?ns=github.repo', {
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch GitHub repositories: ${res.status}`);

  return res.json();
};

export const fetchGitHubIssues = async (repoFullName?: string) => {
  const res = await fetch('/api/entity?ns=github.issue', {
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch GitHub issues: ${res.status}`);
  const githubIssues = await res.json();

  let filteredIssues = githubIssues;

  // Filter by repository if specified
  if (repoFullName) {
    filteredIssues = filteredIssues.filter(issue => issue.pk.startsWith(repoFullName + '#'));
  }

  // Filter to show only open issues
  filteredIssues = filteredIssues.filter(issue => issue.metadata.state === 'open');

  // Sort by most recent activity (updated_at)
  filteredIssues.sort((a, b) => {
    const aUpdated = new Date(a.metadata.updated_at).getTime();
    const bUpdated = new Date(b.metadata.updated_at).getTime();
    return bUpdated - aUpdated; // Most recent first
  });

  return filteredIssues;
};