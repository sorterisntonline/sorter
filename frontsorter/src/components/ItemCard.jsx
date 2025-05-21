import React from 'react';
import { FaLightbulb, FaAward, FaInfoCircle } from 'react-icons/fa';

function ItemCard({ rank, item, onShowComparisonDetails, comparisonAvailable }) {
  return (
    <div className="flex items-center bg-gray-50 p-4 rounded-lg border border-gray-200 shadow-sm hover:border-blue-300 transition-colors">
      <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white mr-4 font-bold text-lg ${
        rank === 1 ? 'bg-yellow-500' : rank === 2 ? 'bg-slate-400' : rank === 3 ? 'bg-orange-400' : 'bg-blue-500'
      }`}>
        {rank === 1 ? <FaAward/> : rank}
      </div>
      <div className="flex-grow">
        <p className="text-gray-800 leading-relaxed">{item.text}</p>
        <p className="text-xs text-blue-600 font-semibold">AI Score: {item.score}</p>
      </div>
      {comparisonAvailable && (
          <button
              onClick={onShowComparisonDetails}
              className="ml-4 p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-100 rounded-full transition-colors"
              title="See AI Judgement Details"
          >
              <FaInfoCircle size="1.2em" />
          </button>
      )}
    </div>
  );
}

export default ItemCard; 