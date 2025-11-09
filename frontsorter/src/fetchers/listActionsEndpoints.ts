// List Actions API endpoints
// Replaces the old pool system with a more flexible list-actions system

export interface ListActionPayload {
  list_ns: string;
  list_pk: string;
  entity_ns: string;
  entity_pk: string;
  action: 'allow' | 'deny' | 'reset' | 'temporary_block';
  expires_at?: string;
}

export interface ListStateResponse {
  include_by_default: boolean;
  included: Entity[];
  excluded: Entity[];
}

interface Entity {
  ns: string;
  pk: string;
  title?: string;
  profile_picture_url?: string;
  metadata?: any;
}

// Fetch the current state of a list (included/excluded entities)
export async function fetchListState(listNs: string, listPk: string): Promise<ListStateResponse> {
  const response = await fetch(`/api/list-actions/${listNs}/${listPk}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch list state');
  }

  return response.json();
}

// Create a list action (allow, deny, reset, temporary_block)
export async function createListAction(payload: ListActionPayload): Promise<void> {
  const response = await fetch('/api/list-actions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create list action');
  }
}

// Batch create list actions
export async function batchListActions(actions: ListActionPayload[]): Promise<void> {
  await Promise.all(actions.map(action => createListAction(action)));
}

// Update list behavior (include_by_default)
export async function updateListBehavior(
  listNs: string,
  listPk: string,
  includeByDefault: boolean
): Promise<void> {
  const response = await fetch(`/api/list-actions/${listNs}/${listPk}/behavior`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ include_by_default: includeByDefault }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update list behavior');
  }
}
