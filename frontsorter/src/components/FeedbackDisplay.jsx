function FeedbackDisplay({ type = 'loading', error, voteMutationError, message }) {
    if (type === 'loading') {
        return (
            <div className="min-h-screen bg-gray-50/60 flex items-center justify-center">
                <div className="text-center text-gray-500 py-10">
                    {message || "Loading..."}
                </div>
            </div>
        );
    }

    if (type === 'error') {
        return (
            <div className="min-h-screen bg-gray-50/60 flex items-center justify-center px-4">
                <div className="w-full max-w-2xl">
                    <div className="text-center text-red-600 bg-red-50 border border-red-200 p-4 rounded-md">
                        <p className="font-semibold mb-2">Error loading or submitting vote:</p>
                        
                        {error && (
                            <div className="text-sm mt-2">
                                <p className="font-medium">Loading pair:</p>
                                <p className="mt-1">{error.message || 'Unknown error'}</p>
                                {error.status === 404 && (
                                    <p className="mt-1 text-red-500">Could not find the requested pair.</p>
                                )}
                            </div>
                        )}
                        
                        {voteMutationError && (
                            <div className="text-sm mt-2">
                                <p className="font-medium">Submitting vote:</p>
                                <p className="mt-1">{voteMutationError.message || 'Unknown error'}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return null;
}

export default FeedbackDisplay;