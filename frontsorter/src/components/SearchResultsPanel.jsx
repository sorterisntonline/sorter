import { wsAPI } from '../services/api.js';

const SearchResultsPanel = ({ isLoading, searchResults, error }) => {
  // Don't render anything if there's nothing to show
  if (!isLoading && !searchResults && !error) {
    return null;
  }

  const renderUIResponse = (uiResponse) => {
    if (!uiResponse || !uiResponse.type) {
      // Fallback to JSON display for malformed responses
      return (
        <pre className="bg-white p-4 rounded border text-sm overflow-auto max-h-96">
          {JSON.stringify(uiResponse, null, 2)}
        </pre>
      );
    }

    switch (uiResponse.type) {
      case 'HomePage':
        return <HomePageView data={uiResponse.data} />;
      case 'SearchResults':
        return <SearchResultsView data={uiResponse.data} />;
      case 'VotingPairs':
        return <VotingPairsView data={uiResponse.data} />;
      case 'EntityView':
        return <EntityViewComponent data={uiResponse.data} />;
      case 'ErrorPage':
        return <ErrorPageView data={uiResponse.data} />;
      case 'NotYetImplemented':
        return <NotYetImplementedView data={uiResponse.data} />;
      case 'Suggestions':
        return <SuggestionsView data={uiResponse.data} />;
      case 'Guide':
        return <GuideView data={uiResponse.data} />;
      case 'Selection':
        return <SelectionView data={uiResponse.data} />;
      default:
        return (
          <div className="text-orange-600">
            Unknown UI response type: {uiResponse.type}
            <pre className="bg-white p-4 rounded border text-sm overflow-auto max-h-96 mt-2">
              {JSON.stringify(uiResponse, null, 2)}
            </pre>
          </div>
        );
    }
  };

  return (
    <div className="w-full max-w-4xl bg-gray-50 border border-gray-200 rounded-lg p-6 mt-4">
      <h3 className="text-lg font-semibold mb-4">Search Results:</h3>
      
      {isLoading && (
        <div className="text-gray-600">Loading...</div>
      )}
      
      {error && (
        <div className="text-red-600">Error: {error}</div>
      )}
      
      {searchResults && renderUIResponse(searchResults)}
    </div>
  );
};

// UI Component Renderers
const HomePageView = ({ data }) => (
  <div className="bg-white p-4 rounded border">
    <h4 className="font-semibold mb-2">Home Page</h4>
    {data.current_query && (
      <p className="text-gray-600 mb-2">Current query: {data.current_query}</p>
    )}
    <div>
      <h5 className="font-medium mb-1">Suggested queries:</h5>
      <ul className="list-disc list-inside text-sm text-gray-700">
        {data.suggested_queries.map((query, idx) => (
          <li key={idx}>{query}</li>
        ))}
      </ul>
    </div>
  </div>
);

const SearchResultsView = ({ data }) => (
  <div className="bg-white p-4 rounded border">
    <h4 className="font-semibold mb-2">Search Results for: "{data.query}"</h4>
    <div className="space-y-3">
      {data.results.map((result, idx) => (
        <div key={idx} className="border-l-4 border-blue-500 pl-4">
          <h5 className="font-medium text-blue-700">{result.title}</h5>
          <p className="text-sm text-gray-600">{result.url}</p>
          {result.snippet && (
            <p className="text-sm text-gray-500 mt-1">{result.snippet}</p>
          )}
          <div className="flex gap-4 text-xs text-gray-500 mt-1">
            <span>Type: {result.entity_type}</span>
            {result.score && <span>Score: {result.score.toFixed(1)}</span>}
          </div>
        </div>
      ))}
    </div>
    <div className="mt-4 text-sm text-gray-500">
      Page {data.pagination.current_page} of {data.pagination.total_pages} 
      ({data.pagination.total_results} total results)
    </div>
  </div>
);

const VotingPairsView = ({ data }) => (
  <div className="bg-white p-4 rounded border">
    <h4 className="font-semibold mb-2">Voting Pairs</h4>
    <div className="grid grid-cols-2 gap-4 mb-4">
      <div className="border p-3 rounded">
        <h5 className="font-medium">{data.pair.item_a.title}</h5>
        {data.pair.item_a.description && (
          <p className="text-sm text-gray-600">{data.pair.item_a.description}</p>
        )}
      </div>
      <div className="border p-3 rounded">
        <h5 className="font-medium">{data.pair.item_b.title}</h5>
        {data.pair.item_b.description && (
          <p className="text-sm text-gray-600">{data.pair.item_b.description}</p>
        )}
      </div>
    </div>
    <div className="text-sm text-gray-500">
      Progress: {data.progress.current_pair}/{data.progress.total_pairs} 
      ({data.progress.completion_percentage.toFixed(1)}%)
    </div>
  </div>
);

const EntityViewComponent = ({ data }) => (
  <div className="bg-white p-4 rounded border">
    <h4 className="font-semibold mb-2">Entity: {data.entity.title}</h4>
    <p className="text-sm text-gray-600 mb-4">{data.entity.url}</p>
    
    {data.breadcrumbs.length > 0 && (
      <div className="mb-4">
        <span className="text-sm text-gray-500">
          {data.breadcrumbs.map((crumb, idx) => (
            <span key={idx}>
              {idx > 0 && " > "}
              {crumb.label}
            </span>
          ))}
        </span>
      </div>
    )}
    
    {data.rankings.length > 0 && (
      <div>
        <h5 className="font-medium mb-2">Rankings:</h5>
        <div className="space-y-2">
          {data.rankings.map((ranking, idx) => (
            <div key={idx} className="flex justify-between items-center text-sm">
              <span>{ranking.rank}. {ranking.entity.title}</span>
              <span className="text-gray-500">Score: {ranking.score.toFixed(1)}</span>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
);

const ErrorPageView = ({ data }) => (
  <div className="bg-red-50 border border-red-200 p-4 rounded">
    <h4 className="font-semibold text-red-800 mb-2">Error: {data.error_type}</h4>
    <p className="text-red-700 mb-4">{data.message}</p>
    {data.suggestions.length > 0 && (
      <div>
        <h5 className="font-medium text-red-800 mb-1">Suggestions:</h5>
        <ul className="list-disc list-inside text-sm text-red-700">
          {data.suggestions.map((suggestion, idx) => (
            <li key={idx}>{suggestion}</li>
          ))}
        </ul>
      </div>
    )}
  </div>
);

const NotYetImplementedView = ({ data }) => (
  <div className="bg-yellow-50 border border-yellow-200 p-4 rounded text-center">
    <h4 className="font-semibold text-yellow-800 text-lg mb-2">{data.feature_name}</h4>
    <p className="text-yellow-700 mb-4">{data.description}</p>
    {data.issue_url && (
      <a 
        href={data.issue_url} 
        target="_blank" 
        rel="noopener noreferrer"
        className="text-sm text-blue-600 hover:underline"
      >
        Track progress on GitHub
      </a>
    )}
  </div>
);

const GuideView = ({ data }) => {
  const handleOptionClick = (completion) => {
    wsAPI.updateQuery(completion);
  };

  return (
    <div className="bg-blue-50 border border-blue-200 p-6 rounded-lg">
      <h4 className="font-semibold text-blue-800 text-xl mb-2">{data.title}</h4>
      <p className="text-blue-700 mb-6">{data.description}</p>
      
      <div className="space-y-3">
        {data.options.map((option, index) => (
          <button
            key={option.key}
            onClick={() => handleOptionClick(option.completion)}
            className="w-full text-left p-4 bg-white border border-blue-300 rounded-lg hover:bg-blue-50 hover:border-blue-400 transition-colors group"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono bg-blue-100 text-blue-800 px-2 py-1 rounded">
                    {index + 1}
                  </span>
                  <span className="font-medium text-gray-900">{option.label}</span>
                </div>
                <p className="text-sm text-gray-600 mt-1 ml-8">{option.description}</p>
              </div>
              <span className="text-xs text-gray-400 font-mono group-hover:text-gray-600">
                {option.completion}
              </span>
            </div>
          </button>
        ))}
      </div>
      
      <p className="text-xs text-blue-600 mt-4">
        Press the number keys (1-{data.options.length}) or click an option to continue
      </p>
    </div>
  );
};

const SelectionView = ({ data }) => {
  const handleItemClick = (completion) => {
    wsAPI.updateQuery(completion);
  };

  return (
    <div className="bg-green-50 border border-green-200 p-6 rounded-lg">
      <h4 className="font-semibold text-green-800 text-xl mb-2">{data.title}</h4>
      <p className="text-green-700 mb-6">{data.description}</p>
      
      <div className="grid gap-3">
        {data.items.map((item, index) => (
          <button
            key={item.id}
            onClick={() => handleItemClick(item.completion)}
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
        Press the number keys (1-{data.items.length}) or click an item to select
      </p>
    </div>
  );
};

export default SearchResultsPanel;