import useUIStore, { ViewTypes } from '../store/uiStore.js';
import { wsAPI } from '../services/api.js';

const UIView = ({ onCompletionSelect }) => {
  const { view, isLoading } = useUIStore();

  // Helper function to render a single view based on type and data
  const renderView = (viewType, viewData) => {
    switch (viewType) {
      case ViewTypes.ERROR_PAGE:
        return (
          <div className="bg-red-50 border border-red-200 p-4 rounded">
            <h4 className="font-semibold text-red-800 mb-2">
              Error: {viewData?.error_type || 'Error'}
            </h4>
            <p className="text-red-700">{viewData?.message}</p>
          </div>
        );

      case ViewTypes.GUIDE:
        return (
          <div className="bg-blue-50 border border-blue-200 p-6 rounded-lg">
            <h4 className="font-semibold text-blue-800 text-xl mb-2">{viewData?.title}</h4>
            <p className="text-blue-700 mb-6">{viewData?.description}</p>
            
            <div className="grid gap-3">
              {viewData?.options?.map((option, index) => (
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
        );

      case ViewTypes.SELECTION:
        return (
          <div className="bg-green-50 border border-green-200 p-6 rounded-lg">
            <h4 className="font-semibold text-green-800 text-xl mb-2">{viewData?.title}</h4>
            <p className="text-green-700 mb-6">{viewData?.description}</p>
            
            <div className="grid gap-3">
              {viewData?.items?.map((item, index) => (
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
              Press the number keys (1-{viewData?.items?.length}) or click an item to select
            </p>
          </div>
        );

      case ViewTypes.SEARCH_RESULTS:
        return (
          <div className="bg-gray-50 border border-gray-200 p-4 rounded">
            <h4 className="font-semibold text-gray-800 mb-3">Search Results</h4>
            {viewData?.results?.map((result, idx) => (
              <div key={idx} className="mb-3 p-3 bg-white rounded border">
                <h5 className="font-medium text-blue-600">{result.title}</h5>
                <p className="text-sm text-gray-600">{result.url}</p>
                {result.snippet && (
                  <p className="text-sm mt-1">{result.snippet}</p>
                )}
              </div>
            ))}
          </div>
        );

      case ViewTypes.NOT_YET_IMPLEMENTED:
        return (
          <div className="bg-yellow-50 border border-yellow-200 p-4 rounded text-center">
            <h4 className="font-semibold text-yellow-800 text-lg mb-2">
              {viewData?.feature_name}
            </h4>
            <p className="text-yellow-700 mb-4">{viewData?.description}</p>
            {viewData?.issue_url && (
              <a 
                href={viewData.issue_url} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline"
              >
                Track progress on GitHub
              </a>
            )}
          </div>
        );

      case ViewTypes.VOTING_PAIRS:
        return (
          <div className="bg-purple-50 border border-purple-200 p-4 rounded">
            <h4 className="font-semibold text-purple-800 mb-3">Vote on Items</h4>
            {viewData?.pairs?.map((pair, idx) => (
              <div key={idx} className="mb-4 p-4 bg-white rounded border">
                <div className="grid grid-cols-2 gap-4">
                  <button className="p-3 border rounded hover:bg-gray-50">
                    {pair.item_a.title}
                  </button>
                  <button className="p-3 border rounded hover:bg-gray-50">
                    {pair.item_b.title}
                  </button>
                </div>
              </div>
            ))}
          </div>
        );

      case ViewTypes.ENTITY_VIEW:
        return (
          <div className="bg-indigo-50 border border-indigo-200 p-4 rounded">
            <h4 className="font-semibold text-indigo-800 mb-3">
              {viewData?.title || 'Entity'}
            </h4>
            <p className="text-indigo-700">{viewData?.description}</p>
            {/* Add more entity view rendering as needed */}
          </div>
        );

      case ViewTypes.SUGGESTIONS:
        // Suggestions are typically handled by the input component
        // but we can show them here if needed
        return null;

      case ViewTypes.HOME_PAGE:
        // HomePage might not need any special rendering
        return null;

      default:
        return null;
    }
  };

  // Handle Multiple view type - render all sub-views
  if (view.type === ViewTypes.MULTIPLE) {
    const responses = view.data?.responses || [];
    return (
      <div className="w-full max-w-3xl mx-auto space-y-4">
        {isLoading && (
          <div className="text-gray-600 text-center">Loading...</div>
        )}
        {responses.map((response, index) => (
          <div key={index}>
            {renderView(response.type, response.data)}
          </div>
        ))}
      </div>
    );
  }

  // Handle single view type
  const viewContent = renderView(view.type, view.data);
  
  // Don't render anything if there's no content and not loading
  if (!viewContent && !isLoading) {
    return null;
  }

  return (
    <div className="w-full max-w-3xl mx-auto space-y-4">
      {isLoading && (
        <div className="text-gray-600 text-center">Loading...</div>
      )}
      {viewContent}
    </div>
  );
};

export default UIView;