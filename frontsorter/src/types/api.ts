// API related types

export interface Vote {
  left_entity_ns: string;
  left_entity_pk: string;
  right_entity_ns: string;
  right_entity_pk: string;
  user_id: string;
  attribute_id: string;
  created_at?: string;
  winner?: 'left' | 'right';
}

export interface Todo {
  pk: string;
  title: string;
  completed: boolean;
  created_at: string;
  updated_at?: string;
}

export interface TodoUpdate {
  pk: string;
  updates: {
    title?: string;
    completed?: boolean;
  };
}

export interface SubtaskData {
  parentPk: string;
  subtaskData: {
    title: string;
  };
}

// Enhanced Error type for API responses
export interface APIError extends Error {
  status?: number;
  statusText?: string;
}

// Mutation function types
export interface DeleteVoteParams {
  left_entity_ns: string;
  left_entity_pk: string;
  right_entity_ns: string;
  right_entity_pk: string;
  user_id: string;
  attribute_id: string;
}

export interface UpdateTodoParams {
  pk: string;
  updates: {
    title?: string;
    completed?: boolean;
  };
}

export interface CreateSubtaskParams {
  parentPk: string;
  subtaskData: {
    title: string;
  };
}
