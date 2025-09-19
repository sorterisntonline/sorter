import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FaCheckCircle, FaCircle, FaTasks } from 'react-icons/fa';
import AddTodoForm from '../components/AddTodoForm';
import TodoItem from '../components/TodoItem';
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
      <div className="flex items-center justify-center min-h-64">
        <div className="text-lg text-gray-600">Loading todos...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="text-red-800">
          Error loading todos: {error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center justify-center space-x-3">
          <FaTasks className="text-blue-500" />
          <span>Todo Demo</span>
        </h1>
        <p className="text-gray-600 mt-2">
          Built using Sorter's entity API as a generic document store
        </p>
      </div>

      {/* Stats */}
      {totalTodos > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Progress</h2>
            <span className="text-sm text-gray-600">
              {completedTodos} of {totalTodos} completed
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-center mt-2 text-sm font-medium text-gray-700">
            {progress.toFixed(0)}%
          </div>
        </div>
      )}

      {/* Add Todo Form */}
      <AddTodoForm onAddTodo={handleAddTodo} />

      {/* Todo List */}
      <div className="space-y-2">
        {todoTree.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <FaCircle size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-lg">No todos yet!</p>
            <p className="text-sm">Add your first todo above to get started.</p>
          </div>
        ) : (
          todoTree.map((todo) => (
            <TodoItem
              key={todo.pk}
              todo={todo}
              onToggleComplete={handleToggleComplete}
              onUpdateTitle={handleUpdateTitle}
              onDelete={handleDeleteTodo}
              onAddSubtask={handleAddSubtask}
              children={todo.children}
            />
          ))
        )}
      </div>

      {/* Loading States */}
      {(createTodoMutation.isPending || 
        updateTodoMutation.isPending || 
        deleteTodoMutation.isPending || 
        createSubtaskMutation.isPending) && (
        <div className="fixed bottom-4 right-4 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg">
          Processing...
        </div>
      )}
    </div>
  );
};

export default TodoPage;
