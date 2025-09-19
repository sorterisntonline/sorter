import React, { useState } from 'react';
import '../styles/retrofuturist.css';

const AddTodoForm = ({ onAddTodo }) => {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('medium');
  const [showForm, setShowForm] = useState(false);

  const handleSubmit = (e) => {
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
        + INITIALIZE NEW TASK
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="add-todo-form">
      <div>
        <input
          type="text"
          placeholder="ENTER TASK DESCRIPTION..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="input-field"
          autoFocus
        />
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '15px' }}>
        <label style={{ color: 'var(--neon-cyan)', fontFamily: 'Orbitron, monospace', textTransform: 'uppercase', letterSpacing: '1px' }}>
          Priority Level:
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
          className="retro-button secondary"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!title.trim()}
          className="retro-button primary"
        >
          Execute
        </button>
      </div>
    </form>
  );
};

export default AddTodoForm;
