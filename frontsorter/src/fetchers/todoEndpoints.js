// --- Todo API Fetchers ---

const TODO_NAMESPACE = 'todos';
const STATIC_KEY = "STATIC_TEST_KEY_FOR_ADMIN_USER_123";

export const fetchAllTodos = async () => {
  const res = await fetch('/api/entity');
  if (!res.ok) throw new Error(`Failed to fetch todos: ${res.status}`);
  const entities = await res.json();
  // Filter to only todo entities
  return entities.filter(entity => entity.pk_namespace === TODO_NAMESPACE);
};

export const fetchTodoWithSubtasks = async (pk) => {
  const url = `/api/entity/${encodeURIComponent(TODO_NAMESPACE)}/${encodeURIComponent(pk)}?children=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch todo: ${res.status}`);
  return res.json();
};

export const createTodo = async (todoData) => {
  const entity = {
    pk_namespace: TODO_NAMESPACE,
    pk: todoData.id || `todo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    title: todoData.title,
    metadata: {
      completed: todoData.completed || false,
      priority: todoData.priority || 'medium',
      createdAt: new Date().toISOString(),
      ...todoData.metadata
    }
  };

  const res = await fetch('/api/entity', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${STATIC_KEY}`,
    },
    body: JSON.stringify(entity),
  });
  if (!res.ok) throw new Error(`Failed to create todo: ${res.status}`);
  return res.json();
};

export const updateTodo = async (pk, updates) => {
  // First fetch the current todo to merge updates
  const currentRes = await fetch(`/api/entity/${encodeURIComponent(TODO_NAMESPACE)}/${encodeURIComponent(pk)}`);
  if (!currentRes.ok) throw new Error(`Failed to fetch current todo: ${currentRes.status}`);
  const current = await currentRes.json();
  
  const updated = {
    pk_namespace: TODO_NAMESPACE,
    pk: pk,
    title: updates.title !== undefined ? updates.title : current.entity.title,
    metadata: {
      ...current.entity.metadata,
      ...updates.metadata,
      completed: updates.completed !== undefined ? updates.completed : current.entity.metadata?.completed || false,
      priority: updates.priority !== undefined ? updates.priority : current.entity.metadata?.priority || 'medium'
    }
  };

  const res = await fetch(`/api/entity/${encodeURIComponent(TODO_NAMESPACE)}/${encodeURIComponent(pk)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${STATIC_KEY}`,
    },
    body: JSON.stringify(updated),
  });
  if (!res.ok) throw new Error(`Failed to update todo: ${res.status}`);
  return res.json();
};

export const deleteTodo = async (pk) => {
  const res = await fetch(`/api/entity/${encodeURIComponent(TODO_NAMESPACE)}/${encodeURIComponent(pk)}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${STATIC_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Failed to delete todo: ${res.status}`);
  return true;
};

export const createSubtask = async (parentPk, subtaskData) => {
  // First create the subtask entity
  const subtask = await createTodo(subtaskData);
  
  // Then create the parent-child relationship
  const relationship = {
    parent_pk_namespace: TODO_NAMESPACE,
    parent_pk: parentPk,
    child_pk_namespace: TODO_NAMESPACE,
    child_pk: subtask.pk
  };

  const res = await fetch('/api/entity_relationships', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${STATIC_KEY}`,
    },
    body: JSON.stringify(relationship),
  });
  if (!res.ok) throw new Error(`Failed to create subtask relationship: ${res.status}`);
  
  return subtask;
};

export const deleteSubtaskRelationship = async (parentPk, childPk) => {
  const params = new URLSearchParams({
    parent_pk_namespace: TODO_NAMESPACE,
    parent_pk: parentPk,
    child_pk_namespace: TODO_NAMESPACE,
    child_pk: childPk
  });

  const res = await fetch(`/api/entity_relationships?${params}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${STATIC_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Failed to delete subtask relationship: ${res.status}`);
  return true;
};
