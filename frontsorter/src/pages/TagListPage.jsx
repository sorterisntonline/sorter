import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaPlus } from 'react-icons/fa';

// Dummy data for initial tags
const initialTags = [
  { id: 'tag1', name: 'Startup Ideas Q3', promptPreamble: 'Rank by market size and feasibility.', itemCount: 5 },
  { id: 'tag2', name: 'Essay Drafts - Chapter 1', promptPreamble: 'Rank by clarity and flow.', itemCount: 3 },
  { id: 'tag3', name: 'Life Decisions 2024', promptPreamble: 'Rank by long-term happiness impact.', itemCount: 8 },
];

function TagListPage() {
  const [tags, setTags] = useState(initialTags);
  const [name, setName] = useState('');
  const [promptPreamble, setPromptPreamble] = useState('');
  const [isFormExpanded, setIsFormExpanded] = useState(false);

  const handleCreateTag = (e) => {
    e.preventDefault();
    if (!name.trim()) return; // Basic validation
    
    const newTag = {
      name,
      promptPreamble,
      id: `tag${tags.length + Date.now()}`,
      itemCount: 0
    };
    
    setTags(prevTags => [newTag, ...prevTags]);
    setName('');
    setPromptPreamble('');
    setIsFormExpanded(false);
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Create Tag Form */}
      <div className={`bg-white border border-gray-200 mb-6 ${isFormExpanded ? 'p-4' : ''}`}>
        {!isFormExpanded ? (
          <button
            onClick={() => setIsFormExpanded(true)}
            className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 w-full flex items-center justify-center space-x-2 transition-colors"
          >
            <FaPlus />
            <span>Create New Topic</span>
          </button>
        ) : (
          <form onSubmit={handleCreateTag} className="space-y-4">
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Create New Sorting Topic</h2>
            <div>
              <label htmlFor="tagName" className="block text-sm font-medium text-gray-700 mb-1">
                Topic Name (e.g., "Project Ideas")
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
                onClick={() => setIsFormExpanded(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 focus:outline-none"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none"
              >
                Create Topic
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Tag List */}
      {tags.length === 0 ? (
        <p className="text-gray-600 text-center py-10">No sorting topics yet. Create one to get started!</p>
      ) : (
        <div className="space-y-4">
          {tags.map(tag => (
            <Link key={tag.id} to={`/tags/${tag.id}`} className="block group">
              <div className="bg-white p-4 border border-gray-200 hover:border-blue-400 transition-colors">
                <h2 className="text-xl font-bold text-gray-800 group-hover:text-blue-600">{tag.name}</h2>
                <p className="text-sm text-gray-500 mb-1 italic truncate" title={tag.promptPreamble}>
                  Criteria: {tag.promptPreamble}
                </p>
                <p className="text-sm text-gray-600">{tag.itemCount} items</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default TagListPage; 