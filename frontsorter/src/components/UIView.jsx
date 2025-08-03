import useUIStore from '../store/uiStore.js';
import { wsAPI } from '../services/api.js';

const UIView = ({ onCompletionSelect }) => {
  const {
    guide,
    selection,
    searchResults,
    votingPairs,
    entityView,
    error,
    notYetImplemented,
    isLoading
  } = useUIStore();

  // Render nothing if no state
  if (!guide && !selection && !searchResults && !votingPairs && 
      !entityView && !error && !notYetImplemented && !isLoading) {
    return null;
  }

  return (
    <div className="w-full max-w-3xl mx-auto space-y-4">
      {isLoading && (
        <div className="text-gray-600 text-center">Loading...</div>
      )}
      
      {error && (
        <div className="bg-red-50 border border-red-200 p-4 rounded">
          <h4 className="font-semibold text-red-800 mb-2">
            Error: {error.error_type || 'Error'}
          </h4>
          <p className="text-red-700">{error.message}</p>
        </div>
      )}
      
      {guide && (
        <div className="bg-blue-50 border border-blue-200 p-6 rounded-lg">
          <h4 className="font-semibold text-blue-800 text-xl mb-2">{guide.title}</h4>
          <p className="text-blue-700 mb-6">{guide.description}</p>
          
          <div className="grid gap-3">
            {guide.options.map((option, index) => (
              <button
                key={option.key}
                onClick={() => {
                  if (onCompletionSelect) {
                    onCompletionSelect(option.completion);
                  }
                }}
                className="text-left p-4 bg-white border border-blue-300 rounded-lg hover:bg-blue-50 hover:border-blue-400 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono bg-blue-100 text-blue-800 px-2 py-1 rounded">
                    {option.key}
                  </span>
                  <span className="font-medium text-gray-900">{option.label}</span>
                </div>
                <p className="text-sm text-gray-600 mt-1 ml-12">{option.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}
      
      {selection && (
        <div className="bg-green-50 border border-green-200 p-6 rounded-lg">
          <h4 className="font-semibold text-green-800 text-xl mb-2">{selection.title}</h4>
          <p className="text-green-700 mb-6">{selection.description}</p>
          
          <div className="grid gap-3">
            {selection.items.map((item, index) => (
              <button
                key={item.id}
                onClick={() => {
                  if (onCompletionSelect) {
                    onCompletionSelect(item.completion);
                  }
                }}
                className="text-left p-4 bg-white border border-green-300 rounded-lg hover:bg-green-50 hover:border-green-400 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-mono bg-green-100 text-green-800 px-2 py-1 rounded">
                        {index + 1}
                      </span>
                      <span className="font-medium text-gray-900">{item.title}</span>
                    </div>
                    {item.description && (
                      <p className="text-sm text-gray-600 mt-1 ml-8">{item.description}</p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 font-mono group-hover:text-gray-600">
                    {item.completion}
                  </span>
                </div>
              </button>
            ))}
          </div>
          
          <p className="text-xs text-green-600 mt-4">
            Press the number keys (1-{selection.items.length}) or click an item to select
          </p>
        </div>
      )}
      
      {searchResults && (
        <div className="bg-gray-50 border border-gray-200 p-4 rounded">
          <h4 className="font-semibold text-gray-800 mb-3">Search Results</h4>
          {searchResults.results.map((result, idx) => (
            <div key={idx} className="mb-3 p-3 bg-white rounded border">
              <h5 className="font-medium text-blue-600">{result.title}</h5>
              <p className="text-sm text-gray-600">{result.url}</p>
              {result.snippet && (
                <p className="text-sm mt-1">{result.snippet}</p>
              )}
            </div>
          ))}
        </div>
      )}
      
      {notYetImplemented && (
        <div className="bg-yellow-50 border border-yellow-200 p-4 rounded text-center">
          <h4 className="font-semibold text-yellow-800 text-lg mb-2">
            {notYetImplemented.feature_name}
          </h4>
          <p className="text-yellow-700 mb-4">{notYetImplemented.description}</p>
          {notYetImplemented.issue_url && (
            <a 
              href={notYetImplemented.issue_url} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline"
            >
              Track progress on GitHub
            </a>
          )}
        </div>
      )}
      
      {/* Add other view types as needed */}
    </div>
  );
};

export default UIView;