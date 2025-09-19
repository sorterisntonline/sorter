import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AddTodoForm from '../components/AddTodoForm';
import TodoItem from '../components/TodoItem';
import '../styles/retrofuturist.css';
import { 
  fetchAllTodos, 
  createTodo, 
  updateTodo, 
  deleteTodo, 
  createSubtask 
} from '../fetchers/todoEndpoints';

const TodoPage = () => {
  const queryClient = useQueryClient();

  // Fetch all todos
  const { data: todos = [], isLoading, error } = useQuery({
    queryKey: ['todos'],
    queryFn: fetchAllTodos,
  });

  // Create todo mutation
  const createTodoMutation = useMutation({
    mutationFn: createTodo,
    onSuccess: () => {
      queryClient.invalidateQueries(['todos']);
    },
  });

  // Update todo mutation
  const updateTodoMutation = useMutation({
    mutationFn: ({ pk, updates }) => updateTodo(pk, updates),
    onSuccess: () => {
      queryClient.invalidateQueries(['todos']);
    },
  });

  // Delete todo mutation
  const deleteTodoMutation = useMutation({
    mutationFn: deleteTodo,
    onSuccess: () => {
      queryClient.invalidateQueries(['todos']);
    },
  });

  // Create subtask mutation
  const createSubtaskMutation = useMutation({
    mutationFn: ({ parentPk, subtaskData }) => createSubtask(parentPk, subtaskData),
    onSuccess: () => {
      queryClient.invalidateQueries(['todos']);
    },
  });

  // Build a tree structure from flat todos array
  const buildTodoTree = (todos) => {
    const todoMap = new Map();
    const roots = [];

    // First pass: create map of all todos
    todos.forEach(todo => {
      todoMap.set(todo.pk, { ...todo, children: [] });
    });

    // Second pass: build tree structure
    // Note: Since we're using a simple entity fetch, we won't have parent-child relationships
    // For now, treat all todos as root level
    todos.forEach(todo => {
      roots.push(todoMap.get(todo.pk));
    });

    return roots;
  };

  const todoTree = buildTodoTree(todos);

  // Calculate stats
  const totalTodos = todos.length;
  const completedTodos = todos.filter(todo => todo.metadata?.completed).length;
  const progress = totalTodos > 0 ? (completedTodos / totalTodos) * 100 : 0;

  const handleAddTodo = (todoData) => {
    createTodoMutation.mutate(todoData);
  };

  const handleToggleComplete = (pk, completed) => {
    updateTodoMutation.mutate({
      pk,
      updates: { completed }
    });
  };

  const handleUpdateTitle = (pk, title) => {
    updateTodoMutation.mutate({
      pk,
      updates: { title }
    });
  };

  const handleDeleteTodo = (pk) => {
    if (window.confirm('Are you sure you want to delete this todo?')) {
      deleteTodoMutation.mutate(pk);
    }
  };

  const handleAddSubtask = (parentPk, subtaskData) => {
    createSubtaskMutation.mutate({ parentPk, subtaskData });
  };

  if (isLoading) {
    return (
      <div className="academic-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>
          Loading tasks...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="academic-container">
        <div style={{ 
          background: 'var(--bg-secondary)', 
          border: '1px solid var(--accent-red)', 
          borderRadius: '4px',
          padding: '1.5rem',
          boxShadow: 'var(--shadow-subtle)'
        }}>
          <div style={{ color: 'var(--accent-red)' }}>
            Error: {error.message}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="academic-container">
      {/* Header */}
      <div className="academic-header">
        <h1 className="academic-title">
          Task Management System
        </h1>
        <p className="academic-subtitle">
          A hierarchical approach to productivity
        </p>
      </div>

      {/* Progress Panel */}
      {totalTodos > 0 && (
        <div className="progress-panel">
          <div className="progress-header">System Status</div>
          <div className="progress-stats">
            {completedTodos} of {totalTodos} tasks completed
          </div>
          <div className="progress-bar-container">
            <div 
              className="progress-bar-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="progress-percentage">
            {progress.toFixed(0)}%
          </div>
        </div>
      )}

      {/* Add Todo Form */}
      <AddTodoForm onAddTodo={handleAddTodo} />

      {/* Todo Tree */}
      {todoTree.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">◉</div>
          <div className="empty-title">System Ready</div>
          <div className="empty-subtitle">Initialize your first task to begin</div>
        </div>
      ) : (
        <div className="todo-tree">
          {todoTree.map((todo, index) => (
            <TodoItem
              key={todo.pk}
              todo={todo}
              onToggleComplete={handleToggleComplete}
              onUpdateTitle={handleUpdateTitle}
              onDelete={handleDeleteTodo}
              onAddSubtask={handleAddSubtask}
              children={todo.children}
              level={0}
              isLast={index === todoTree.length - 1}
            />
          ))}
        </div>
      )}

      {/* Loading Indicator */}
      {(createTodoMutation.isPending || 
        updateTodoMutation.isPending || 
        deleteTodoMutation.isPending || 
        createSubtaskMutation.isPending) && (
        <div className="loading-indicator">
          Processing...
        </div>
      )}
    </div>
  );
};

export default TodoPage;
