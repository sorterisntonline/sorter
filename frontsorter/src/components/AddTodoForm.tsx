import { useState } from 'react';
import '../styles/retrofuturist.css';
import { AddTodoFormProps } from '../types/api';

const AddTodoForm = ({ onAddTodo }: AddTodoFormProps) => {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('medium');
  const [showForm, setShowForm] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      onAddTodo({
        title: title.trim(),
        priority,
        completed: false
      });
      setTitle('');
      setPriority('medium');
      setShowForm(false);
    }
  };

  const handleCancel = () => {
    setTitle('');
    setPriority('medium');
    setShowForm(false);
  };

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="add-todo-button"
      >
        Add New Task
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="add-todo-form">
      <div>
        <input
          type="text"
          placeholder="What needs to be done?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="input-field"
          autoFocus
        />
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
        <label style={{ color: 'var(--text-primary)', fontSize: '0.95rem' }}>
          Priority:
        </label>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="priority-selector"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>
      
      <div className="form-controls">
        <button
          type="button"
          onClick={handleCancel}
          className="academic-button secondary"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!title.trim()}
          className="academic-button primary"
        >
          Add Task
        </button>
      </div>
    </form>
  );
};

export default AddTodoForm;
