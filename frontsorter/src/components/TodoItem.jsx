import React, { useState } from 'react';
import { FaTrash, FaPlus, FaChevronDown, FaChevronRight } from 'react-icons/fa';

const TodoItem = ({ 
  todo, 
  onToggleComplete, 
  onUpdateTitle, 
  onDelete, 
  onAddSubtask,
  children,
  level = 0 
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(todo.title || '');
  const [showAddSubtask, setShowAddSubtask] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  const handleSaveEdit = () => {
    if (editTitle.trim() && editTitle !== todo.title) {
      onUpdateTitle(todo.pk, editTitle.trim());
    }
    setIsEditing(false);
  };

  const handleAddSubtask = () => {
    if (newSubtaskTitle.trim()) {
      onAddSubtask(todo.pk, { 
        title: newSubtaskTitle.trim(),
        priority: 'medium'
      });
      setNewSubtaskTitle('');
      setShowAddSubtask(false);
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return 'border-l-red-500';
      case 'medium': return 'border-l-yellow-500';
      case 'low': return 'border-l-green-500';
      default: return 'border-l-gray-300';
    }
  };

  const indentation = level * 24; // 24px per level

  return (
    <div style={{ marginLeft: `${indentation}px` }} className="mb-2">
      <div className={`bg-white border-l-4 ${getPriorityColor(todo.metadata?.priority)} rounded-lg shadow-sm p-4 hover:shadow-md transition-shadow`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 flex-1">
            {children && children.length > 0 && (
              <button 
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-gray-500 hover:text-gray-700 transition-colors"
              >
                {isExpanded ? <FaChevronDown size={12} /> : <FaChevronRight size={12} />}
              </button>
            )}
            
            <input
              type="checkbox"
              checked={todo.metadata?.completed || false}
              onChange={(e) => onToggleComplete(todo.pk, e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            
            {isEditing ? (
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={handleSaveEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveEdit();
                  if (e.key === 'Escape') setIsEditing(false);
                }}
                className="flex-1 bg-transparent border-b border-gray-300 focus:border-blue-500 focus:outline-none"
                autoFocus
              />
            ) : (
              <span 
                className={`flex-1 cursor-pointer ${todo.metadata?.completed ? 'line-through text-gray-500' : ''}`}
                onClick={() => setIsEditing(true)}
              >
                {todo.title}
              </span>
            )}
            
            <span className={`text-xs px-2 py-1 rounded-full ${
              todo.metadata?.priority === 'high' ? 'bg-red-100 text-red-800' :
              todo.metadata?.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
              'bg-green-100 text-green-800'
            }`}>
              {todo.metadata?.priority || 'medium'}
            </span>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowAddSubtask(!showAddSubtask)}
              className="text-blue-500 hover:text-blue-700 transition-colors"
              title="Add subtask"
            >
              <FaPlus size={14} />
            </button>
            <button
              onClick={() => onDelete(todo.pk)}
              className="text-red-500 hover:text-red-700 transition-colors"
              title="Delete todo"
            >
              <FaTrash size={14} />
            </button>
          </div>
        </div>

        {showAddSubtask && (
          <div className="mt-3 flex items-center space-x-2">
            <input
              type="text"
              placeholder="Enter subtask..."
              value={newSubtaskTitle}
              onChange={(e) => setNewSubtaskTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddSubtask();
                if (e.key === 'Escape') setShowAddSubtask(false);
              }}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              autoFocus
            />
            <button
              onClick={handleAddSubtask}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
            >
              Add
            </button>
            <button
              onClick={() => setShowAddSubtask(false)}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Render children/subtasks */}
      {isExpanded && children && children.length > 0 && (
        <div className="mt-2">
          {children.map((child) => (
            <TodoItem
              key={child.pk}
              todo={child}
              onToggleComplete={onToggleComplete}
              onUpdateTitle={onUpdateTitle}
              onDelete={onDelete}
              onAddSubtask={onAddSubtask}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default TodoItem;
