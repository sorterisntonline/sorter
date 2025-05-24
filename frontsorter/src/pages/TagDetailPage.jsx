import React from 'react';
import { Link } from 'react-router-dom';
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
  return ( 
    <div>
      <Link to="/tags" className="inline-flex items-center text-blue-600 hover:text-blue-800 mb-4">
        <FaArrowLeft className="mr-2" /> Back to All Topics
      </Link>
      <h1>Tag Detail Page</h1>
    </div>
  )
}

export default TagDetailPage; 