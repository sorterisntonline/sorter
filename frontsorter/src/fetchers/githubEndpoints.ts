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

export const fetchGitHubRepos = async () => {
  const res = await fetch('/api/entity?ns=github.repo', {
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch GitHub repositories: ${res.status}`);
  const allEntities = await res.json();

  // Filter to only github.repo entities (in case the backend filter isn't working)
  return allEntities.filter(entity => entity.ns === 'github.repo');
};

export const fetchGitHubIssues = async (repoFullName?: string) => {
  const res = await fetch('/api/entity?ns=github.issue', {
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Failed to fetch GitHub issues: ${res.status}`);
  const allEntities = await res.json();

  // Filter to only github.issue entities first
  const githubIssues = allEntities.filter(entity => entity.ns === 'github.issue');

  // Then filter by repository if specified
  if (repoFullName) {
    return githubIssues.filter(issue => issue.pk.startsWith(repoFullName + '#'));
  }

  return githubIssues;
};