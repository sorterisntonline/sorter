// Entity types
export interface Entity {
  pk: string;
  pk_namespace: string;
  title?: string;
  description?: string;
  created_at: string;
  updated_at: string;
  profile_picture_url?: string;
  entity?: Entity;
  children?: Entity[];
}

export interface CreateEntityData {
  title?: string;
  description?: string;
  pk_namespace: string;
  pk?: string;
  profile_picture_url?: string;
  metadata?: any;
}

// Todo types
export interface Todo {
  pk: string;
  title: string;
  completed: boolean;
  created_at: string;
  updated_at: string;
  children?: Todo[];
  parent_pk?: string;
  metadata?: {
    completed?: boolean;
    priority?: string;
    [key: string]: any;
  };
}

export interface CreateTodoData {
  title: string;
  entity_pk?: string;
  priority?: string;
  completed?: boolean;
  id?: string;
  metadata?: {
    [key: string]: any;
  };
}

export interface UpdateTodoData {
  title?: string;
  completed?: boolean;
  metadata?: {
    [key: string]: any;
  };
  priority?: string;
}

export interface CreateSubtaskData {
  title: string;
  priority?: string;
}

// Vote types
export interface VoteData {
  left_ns: string;
  left_pk: string;
  right_ns: string;
  right_pk: string;
  attribute_id: string | number;
  magnitude: number;
}

export interface VoteResponse {
  status: string;
  message?: string;
}

export interface VoteEntity {
  left_entity: Entity;
  right_entity: Entity;
}

export interface VoteParams {
  child_pk: string;
  child_pk_namespace: string;
  parent_pk: string;
  parent_pk_namespace: string;
}

// API Error type
export interface ApiError extends Error {
  status?: number;
}

// Query key types
export type QueryKeyParams = (string | number)[];

// Component prop types
export interface AddTodoFormProps {
  onAddTodo: (todoData: CreateTodoData) => void;
}

export interface TodoItemProps {
  todo: Todo;
  onToggleComplete: (pk: string, completed: boolean) => void;
  onUpdateTitle: (pk: string, title: string) => void;
  onDelete: (pk: string) => void;
  onAddSubtask: (parentPk: string, subtaskData: CreateSubtaskData) => void;
  expanded?: boolean;
  parentExpanded?: boolean;
}

export interface EntityFormProps {
  onSuccess: (data?: any) => void;
  onCancel: () => void;
}

export interface VoteItemProps {
  item: Entity;
  isDisabled: boolean;
}