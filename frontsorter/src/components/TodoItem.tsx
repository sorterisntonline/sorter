import { useState } from 'react';
import '../styles/retrofuturist.css';
import { ExtendedTodoItemProps } from '../generated/types';

const TodoItem = ({
  todo,
  onToggleComplete,
  onUpdateTitle,
  onDelete,
  onAddSubtask,
  children = [],
  level = 0,
  isLast = false,
  parentExpanded = true
}: ExtendedTodoItemProps) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(todo.title || '');
  const [showAddSubtask, setShowAddSubtask] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  const handleSaveEdit = () => {
    if (editTitle.trim() && editTitle !== todo.title) {
      onUpdateTitle?.(todo.pk, editTitle.trim());
    }
    setIsEditing(false);
  };

  const handleAddSubtask = () => {
    if (newSubtaskTitle.trim()) {
      onAddSubtask?.(todo.pk, {
        title: newSubtaskTitle.trim(),
        priority: 'medium'
      });
      setNewSubtaskTitle('');
      setShowAddSubtask(false);
    }
  };

  const hasChildren = children && children.length > 0;

  return (
    <>
      <div className="todo-tree-item">
        <div className="todo-item-content">
          {/* Tree indentation and connectors */}
          {level > 0 && (
            <div className="tree-indent">
              <div className={`tree-connector ${isLast ? 'last' : ''}`}></div>
              <div className="tree-connector horizontal"></div>
            </div>
          )}

          {/* Expand/collapse button for items with children */}
          {hasChildren ? (
            <button 
              className={`expand-button ${isExpanded ? 'expanded' : ''}`}
              onClick={() => setIsExpanded(!isExpanded)}
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? '−' : '+'}
            </button>
          ) : (
            <div style={{ width: '16px', marginRight: '8px' }}></div>
          )}

          {/* Checkbox */}
          <input
            type="checkbox"
            checked={todo.metadata?.completed || false}
            onChange={(e) => onToggleComplete?.(todo.pk, e.target.checked)}
            className="todo-checkbox"
          />

          {/* Todo text */}
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
              className="todo-text editing"
              autoFocus
            />
          ) : (
            <span 
              className={`todo-text ${todo.metadata?.completed ? 'completed' : ''}`}
              onClick={() => setIsEditing(true)}
              title="Click to edit"
            >
              {todo.title}
            </span>
          )}

          {/* Priority badge */}
          <div className={`priority-badge ${todo.metadata?.priority || 'medium'}`}>
            {todo.metadata?.priority || 'medium'}
          </div>

          {/* Actions */}
          <div className="todo-actions">
            <button
              className="action-button add"
              onClick={() => setShowAddSubtask(!showAddSubtask)}
              title="Add subtask"
            >
              +
            </button>
            <button
              className="action-button delete"
              onClick={() => onDelete?.(todo.pk)}
              title="Delete todo"
            >
              ×
            </button>
          </div>
        </div>

        {/* Add subtask form */}
        {showAddSubtask && (
          <div className="subtask-form">
            <input
              type="text"
              placeholder="Enter subtask..."
              value={newSubtaskTitle}
              onChange={(e) => setNewSubtaskTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddSubtask();
                if (e.key === 'Escape') setShowAddSubtask(false);
              }}
              className="subtask-input"
              autoFocus
            />
            <button
              onClick={handleAddSubtask}
              className="academic-button primary"
            >
              Add
            </button>
            <button
              onClick={() => setShowAddSubtask(false)}
              className="academic-button secondary"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Render children/subtasks */}
      {isExpanded && hasChildren && (
        <>
          {children.map((child, index) => (
            <TodoItem
              key={child.pk}
              todo={child}
              onToggleComplete={onToggleComplete}
              onUpdateTitle={onUpdateTitle}
              onDelete={onDelete}
              onAddSubtask={onAddSubtask}
              children={child.children || []}
              level={level + 1}
              isLast={index === children.length - 1}
              parentExpanded={isExpanded}
            />
          ))}
        </>
      )}
    </>
  );
};

export default TodoItem;
