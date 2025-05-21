import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import AddItemForm from '../components/AddItemForm';
import RankedItemsList from '../components/RankedItemsList';
import ComparisonDetailsModal from '../components/ComparisonDetailsModal';
import { FaArrowLeft } from 'react-icons/fa';

// More extensive dummy data for a specific tag
const dummyTagDetails = {
  tag1: {
    id: 'tag1',
    name: 'Startup Ideas Q3',
    promptPreamble: 'Rank by market size and feasibility.',
    items: [
      { id: 'itemA', text: 'AI-powered recipe generator for dietary restrictions', score: 85 },
      { id: 'itemB', text: 'Subscription box for rare indoor plants', score: 70 },
      { id: 'itemC', text: 'Platform for local artists to sell digital prints', score: 92 },
      { id: 'itemD', text: 'Personalized star-gazing tour guide app', score: 60 },
    ],
    comparisons: [
        { itemAId: 'itemC', itemBId: 'itemA', reasoning: "Platform C shows broader appeal and stronger monetization potential than recipe generator A at this stage.", score: 7, modelUsed: "Gemini Pro 1.5" },
        { itemAId: 'itemA', itemBId: 'itemB', reasoning: "Recipe generator A, while niche, has a clearer path to product-market fit than plant subscription B which faces high logistical costs.", score: 15, modelUsed: "GPT-4 Turbo" }
    ]
  },
  tag2: {
    id: 'tag2',
    name: 'Essay Drafts - Chapter 1',
    promptPreamble: 'Rank by clarity and flow.',
    items: [
      { id: 'itemE', text: 'Opening paragraph about the history of...', score: 78 },
      { id: 'itemF', text: 'Alternative intro focusing on a specific anecdote...', score: 88 },
    ],
    comparisons: []
  },
};

function TagDetailPage() {
  const { tagId } = useParams();
  const [tag, setTag] = useState(null);
  const [selectedComparison, setSelectedComparison] = useState(null);

  useEffect(() => {
    // Simulate fetching tag details
    const foundTag = dummyTagDetails[tagId] || {
      id: tagId,
      name: `Unknown Room (${tagId})`,
      promptPreamble: 'No criteria defined.',
      items: [],
      comparisons: []
    };
    setTag(foundTag);
  }, [tagId]);

  const handleAddItem = (newItemText) => {
    if (!tag) return;
    const newItem = {
      id: `item${Date.now()}`,
      text: newItemText,
      score: Math.floor(Math.random() * 101) // Dummy score for new item
    };
    const updatedItems = [...tag.items, newItem];
    // Simulate re-ranking: assign new random scores to all items for the "live" effect
    const reRankedItems = updatedItems.map(item => ({
      ...item,
      score: Math.floor(Math.random() * 101)
    }));

    setTag(prevTag => ({ ...prevTag, items: reRankedItems }));
    // In a real app, new comparison data would also stream in
  };

  const sortedItems = useMemo(() => {
    if (!tag || !tag.items) return [];
    return [...tag.items].sort((a, b) => b.score - a.score);
  }, [tag]);

  if (!tag) {
    return <div className="text-center p-10">Loading sorting room...</div>;
  }

  // Function to find item text by ID for comparison display
  const getItemTextById = (itemId) => {
    return tag.items.find(item => item.id === itemId)?.text || "Unknown Item";
  }

  return (
    <div className="space-y-6">
      <Link to="/tags" className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4">
        <FaArrowLeft className="mr-2" /> Back to All Rooms
      </Link>

      <div className="bg-white p-6 rounded-lg shadow-md">
        <h1 className="text-3xl font-semibold text-gray-800 mb-1">{tag.name}</h1>
        <p className="text-sm text-gray-600 italic">
          AI Judging Criteria: "{tag.promptPreamble || 'Default criteria'}"
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <AddItemForm onAddItem={handleAddItem} />

          {/* Recent Comparisons Section (Simplified) */}
          <div className="bg-white p-4 rounded-lg shadow">
            <h3 className="text-lg font-semibold text-gray-700 mb-3">AI Judgements</h3>
            {tag.comparisons.length > 0 ? (
              <ul className="space-y-2 max-h-60 overflow-y-auto text-sm">
                {tag.comparisons.map((comp, index) => (
                  <li key={index}
                      className="p-2 border rounded-md hover:bg-gray-50 cursor-pointer"
                      onClick={() => setSelectedComparison(comp)}
                  >
                    Comparison between items ending with "{getItemTextById(comp.itemAId).slice(-15).trim()}..." and "{getItemTextById(comp.itemBId).slice(-15).trim()}..."
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500 text-sm">No AI judgements recorded yet for these items.</p>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">Live Ranked Items</h2>
          <RankedItemsList 
            items={sortedItems} 
            onShowComparison={setSelectedComparison} 
            comparisons={tag.comparisons} 
            getItemTextById={getItemTextById} 
          />
        </div>
      </div>

      {selectedComparison && (
          <ComparisonDetailsModal
              isOpen={!!selectedComparison}
              onClose={() => setSelectedComparison(null)}
              comparison={selectedComparison}
              itemAText={getItemTextById(selectedComparison.itemAId)}
              itemBText={getItemTextById(selectedComparison.itemBId)}
          />
      )}
    </div>
  );
}

export default TagDetailPage; 