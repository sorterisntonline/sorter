const SearchResultsPanel = ({ isLoading, searchResults, error }) => {
  // Don't render anything if there's nothing to show
  if (!isLoading && !searchResults && !error) {
    return null;
  }

  return (
    <div className="w-full max-w-4xl bg-gray-50 border border-gray-200 rounded-lg p-6 mt-4">
      <h3 className="text-lg font-semibold mb-4">Search Results:</h3>
      
      {isLoading && (
        <div className="text-gray-600">Loading...</div>
      )}
      
      {error && (
        <div className="text-red-600">Error: {error}</div>
      )}
      
      {searchResults && (
        <pre className="bg-white p-4 rounded border text-sm overflow-auto max-h-96">
          {JSON.stringify(searchResults, null, 2)}
        </pre>
      )}
    </div>
  );
};

export default SearchResultsPanel;