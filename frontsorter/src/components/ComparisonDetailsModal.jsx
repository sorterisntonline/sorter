import React from 'react';
import { FaTimes, FaBalanceScale } from 'react-icons/fa';

function ComparisonDetailsModal({ isOpen, onClose, comparison, itemAText, itemBText }) {
  if (!isOpen || !comparison) return null;

  const { reasoning, score, modelUsed } = comparison;
  const isLeftFavored = score < 0;
  const isRightFavored = score > 0;
  const strength = Math.abs(score);

  let scoreDescription;
  if (strength > 40) scoreDescription = "Very Strongly Favored";
  else if (strength > 25) scoreDescription = "Strongly Favored";
  else if (strength > 10) scoreDescription = "Moderately Favored";
  else if (strength > 0) scoreDescription = "Slightly Favored";
  else scoreDescription = "Neutral";

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 transition-opacity duration-300">
      <div className="bg-white p-6 sm:p-8 w-full max-w-2xl transform transition-all duration-300 scale-95 opacity-0 animate-modalEnter">
        <div className="flex justify-between items-center mb-6 pb-3 border-b">
          <h2 className="text-2xl font-semibold text-gray-800 flex items-center">
            <FaBalanceScale className="mr-3 text-blue-500" /> AI Judgement Details
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 p-1 hover:bg-gray-100 transition-colors"
          >
            <FaTimes size="1.5em" />
          </button>
        </div>

        <div className="space-y-6 text-sm sm:text-base">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={`p-4 border ${isLeftFavored ? 'border-green-400 bg-green-50' : 'border-gray-300'}`}>
              <h3 className="font-semibold text-gray-700 mb-1">Item A:</h3>
              <p className="text-gray-600 leading-relaxed">{itemAText}</p>
            </div>
            <div className={`p-4 border ${isRightFavored ? 'border-green-400 bg-green-50' : 'border-gray-300'}`}>
              <h3 className="font-semibold text-gray-700 mb-1">Item B:</h3>
              <p className="text-gray-600 leading-relaxed">{itemBText}</p>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-gray-700 mb-1">AI's Reasoning:</h3>
            <p className="text-gray-600 bg-gray-50 p-3 leading-relaxed border">{reasoning}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <h3 className="font-semibold text-gray-700 mb-1">Score:</h3>
              <p className={`text-lg font-bold ${isLeftFavored ? 'text-green-600' : isRightFavored ? 'text-green-600' : 'text-gray-700'}`}>
                {score}
                <span className="text-xs font-normal ml-1 text-gray-500">({scoreDescription} for {score > 0 ? "B" : "A"})</span>
              </p>
              <p className="text-xs text-gray-500">(-50 = Strong A, 0 = Neutral, +50 = Strong B)</p>
            </div>
             <div>
                <h3 className="font-semibold text-gray-700 mb-1">Model Used:</h3>
                <p className="text-gray-600">{modelUsed || 'N/A'}</p>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-4 border-t flex justify-end">
            <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none"
            >
                Close
            </button>
        </div>
      </div>
      <style jsx>{`
        @keyframes modalEnter {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .animate-modalEnter {
          animation: modalEnter 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}

export default ComparisonDetailsModal; 