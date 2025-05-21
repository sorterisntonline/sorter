import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import CreateTagModal from '../components/CreateTagModal';
import { FaPlus } from 'react-icons/fa';

// Dummy data for initial tags
const initialTags = [
  { id: 'tag1', name: 'Startup Ideas Q3', promptPreamble: 'Rank by market size and feasibility.', itemCount: 5 },
  { id: 'tag2', name: 'Essay Drafts - Chapter 1', promptPreamble: 'Rank by clarity and flow.', itemCount: 3 },
  { id: 'tag3', name: 'Life Decisions 2024', promptPreamble: 'Rank by long-term happiness impact.', itemCount: 8 },
];

function TagListPage() {
  const [tags, setTags] = useState(initialTags);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleCreateTag = (newTag) => {
    setTags(prevTags => [
      ...prevTags,
      { ...newTag, id: `tag${prevTags.length + Date.now()}`, itemCount: 0 } // Dummy ID
    ]);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-semibold text-gray-800">My Sorting Rooms</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md flex items-center space-x-2 transition-colors"
        >
          <FaPlus />
          <span>Create New Room</span>
        </button>
      </div>

      {tags.length === 0 ? (
        <p className="text-gray-600 text-center py-10">No sorting rooms yet. Create one to get started!</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tags.map(tag => (
            <Link key={tag.id} to={`/tags/${tag.id}`} className="block group">
              <div className="bg-white p-6 rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300 border border-transparent hover:border-blue-400">
                <h2 className="text-xl font-bold text-gray-800 mb-2 group-hover:text-blue-600">{tag.name}</h2>
                <p className="text-sm text-gray-500 mb-1 italic truncate" title={tag.promptPreamble}>
                  Criteria: {tag.promptPreamble}
                </p>
                <p className="text-sm text-gray-600">{tag.itemCount} items</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      <CreateTagModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreate={handleCreateTag}
      />
    </div>
  );
}

export default TagListPage; 