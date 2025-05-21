import React, { useState } from 'react';

function AddItemForm({ onAddItem }) {
  const [itemText, setItemText] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!itemText.trim()) return;
    onAddItem(itemText);
    setItemText('');
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-xl font-semibold text-gray-700 mb-3">Add New Item</h3>
      <textarea
        rows="4"
        value={itemText}
        onChange={(e) => setItemText(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        placeholder="Enter your idea, draft, or thought..."
      />
      <button
        type="submit"
        className="mt-3 w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
      >
        Add Item to Room
      </button>
    </form>
  );
}

export default AddItemForm; 