import { Link } from 'react-router-dom';

function TagCollectionsPage() {
    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-6xl mx-auto px-4 py-8">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">
                        📚 Tag Collections
                    </h1>
                    <p className="text-gray-600">
                        Browse and manage tag collections
                    </p>
                </div>

                {/* Navigation */}
                <div className="flex justify-center mb-8">
                    <div className="bg-white rounded-lg shadow-sm p-2 flex space-x-2">
                        <Link 
                            to="/folksonomy"
                            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                        >
                            ← Back to Folksonomy
                        </Link>
                        <Link 
                            to="/folksonomy/vote"
                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                        >
                            🗳️ Vote on Tags
                        </Link>
                    </div>
                </div>

                {/* Coming soon */}
                <div className="bg-white rounded-lg shadow-md p-12 text-center">
                    <div className="text-6xl mb-6">🚧</div>
                    <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                        Coming Soon
                    </h2>
                    <p className="text-gray-600 max-w-2xl mx-auto mb-8">
                        This page will allow you to browse all tag collections, create new ones, 
                        add entities to collections, and manage collection memberships. 
                        The backend API endpoints are ready and documented in the folksonomy module.
                    </p>
                    
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 max-w-2xl mx-auto">
                        <h3 className="font-semibold text-blue-900 mb-3">Planned Features:</h3>
                        <ul className="text-left text-blue-800 space-y-1">
                            <li>• Browse existing tag collections</li>
                            <li>• Create new collections with descriptions</li>
                            <li>• Add/remove entities from collections</li>
                            <li>• View collection statistics and voting history</li>
                            <li>• Filter by collection type (public/private)</li>
                            <li>• Search collections by name or content</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default TagCollectionsPage;