import React, { useState } from 'react';

function CreateTagModal({ isOpen, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [promptPreamble, setPromptPreamble] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return; // Basic validation
    onCreate({ name, promptPreamble });
    setName('');
    setPromptPreamble('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white p-8 w-full max-w-md">
        <h2 className="text-2xl font-semibold text-gray-800 mb-6">Create New Sorting Room</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="tagName" className="block text-sm font-medium text-gray-700 mb-1">
              Room Name (e.g., "Project Ideas")
            </label>
            <input
              type="text"
              id="tagName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:border-blue-500"
              required
            />
          </div>
          <div>
            <label htmlFor="tagPrompt" className="block text-sm font-medium text-gray-700 mb-1">
              Ranking Prompt (How AI should judge items)
            </label>
            <textarea
              id="tagPrompt"
              rows="3"
              value={promptPreamble}
              onChange={(e) => setPromptPreamble(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:border-blue-500"
              placeholder="e.g., 'Rank these based on clarity and impact.'"
            />
             <p className="text-xs text-gray-500 mt-1">Example: "You are a wise investor. Rank these startup ideas based on clarity, originality, and potential for 10x growth."</p>
          </div>
          <div className="flex justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 focus:outline-none"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none"
            >
              Create Room
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateTagModal; 