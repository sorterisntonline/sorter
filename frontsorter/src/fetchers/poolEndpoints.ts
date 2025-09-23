import { QueryFunction } from "@tanstack/react-query";

// Type definitions matching the backend
export type PoolMembershipStatus = "unclassified" | "in_pool" | "blocked";

export interface PoolStatus {
  entity_ns: string;
  entity_pk: string;
  status: PoolMembershipStatus;
  status_updated_at: string | null;
}

export interface EntityWithPoolStatus {
  ns: string;
  pk: string;
  title: string | null;
  profile_picture_url: string | null;
  metadata: any;
  pool_status: PoolMembershipStatus;
  status_updated_at: string | null;
}

export interface PoolOperation {
  entity_ns: string;
  entity_pk: string;
  action: "add" | "block" | "remove";
}

export interface BatchPoolOperation {
  operations: PoolOperation[];
}

export interface BatchPoolResult {
  success_count: number;
  failed_operations: Array<{
    entity_ns: string;
    entity_pk: string;
    action: "add" | "block" | "remove";
    error: string;
  }>;
}

export interface ListPoolQuery {
  ns?: string;
  status?: PoolMembershipStatus;
}

// API functions
export const fetchPoolEntities: QueryFunction<EntityWithPoolStatus[], [string, ListPoolQuery]> = async ({
  queryKey: [, query],
}) => {
  const params = new URLSearchParams();
  
  if (query.ns) params.append('ns', query.ns);
  if (query.status) params.append('status', query.status);

  const response = await fetch(`/api/pool/list?${params.toString()}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch pool entities: ${response.status}`);
  }

  return response.json();
};

export const fetchPoolStatus = async (ns: string, pk: string): Promise<PoolStatus> => {
  const response = await fetch(`/api/pool/${encodeURIComponent(ns)}/${encodeURIComponent(pk)}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch pool status: ${response.status}`);
  }

  return response.json();
};

export const addToPool = async (ns: string, pk: string): Promise<PoolStatus> => {
  const response = await fetch(`/api/pool/${encodeURIComponent(ns)}/${encodeURIComponent(pk)}/add`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to add to pool: ${response.status}`);
  }

  return response.json();
};

export const blockFromPool = async (ns: string, pk: string): Promise<PoolStatus> => {
  const response = await fetch(`/api/pool/${encodeURIComponent(ns)}/${encodeURIComponent(pk)}/block`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to block from pool: ${response.status}`);
  }

  return response.json();
};

export const removeFromPool = async (ns: string, pk: string): Promise<PoolStatus> => {
  const response = await fetch(`/api/pool/${encodeURIComponent(ns)}/${encodeURIComponent(pk)}/remove`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error(`Failed to remove from pool: ${response.status}`);
  }

  return response.json();
};

export const batchPoolOperations = async (operations: PoolOperation[]): Promise<BatchPoolResult> => {
  const response = await fetch('/api/pool/batch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ operations }),
  });

  if (!response.ok) {
    throw new Error(`Failed to perform batch operations: ${response.status}`);
  }

  return response.json();
};
