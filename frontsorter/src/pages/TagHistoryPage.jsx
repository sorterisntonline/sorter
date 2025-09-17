import { useState } from 'react';
import { Link } from 'react-router-dom';

function TagHistoryPage() {
    const [selectedSlug, setSelectedSlug] = useState('Jedi');
    const [selectedDate, setSelectedDate] = useState('');

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-6xl mx-auto px-4 py-8">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">
                        📜 Tag History
                    </h1>
                    <p className="text-gray-600">
                        Explore how hashtag meanings have evolved over time
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

                {/* Time machine interface */}
                <div className="bg-white rounded-lg shadow-md p-6 mb-8">
                    <h2 className="text-xl font-semibold text-gray-900 mb-6 text-center">
                        🕰️ Bitemporal Time Machine
                    </h2>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label htmlFor="slug" className="block text-sm font-medium text-gray-700 mb-2">
                                Hashtag to explore:
                            </label>
                            <input
                                id="slug"
                                type="text"
                                value={selectedSlug}
                                onChange={(e) => setSelectedSlug(e.target.value)}
                                placeholder="Enter hashtag (e.g., Jedi)"
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        
                        <div>
                            <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-2">
                                View as of date:
                            </label>
                            <input
                                id="date"
                                type="datetime-local"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>
                    
                    <div className="mt-6 text-center">
                        <button className="px-6 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors">
                            🔍 Explore Historical Meaning
                        </button>
                    </div>
                </div>

                {/* Coming soon */}
                <div className="bg-white rounded-lg shadow-md p-12 text-center">
                    <div className="text-6xl mb-6">⏳</div>
                    <h2 className="text-2xl font-semibold text-gray-900 mb-4">
                        Bitemporal History Coming Soon
                    </h2>
                    <p className="text-gray-600 max-w-2xl mx-auto mb-8">
                        This page will provide a comprehensive view of how hashtag meanings have 
                        changed over time. You'll be able to see which collections controlled 
                        specific tags at any point in history.
                    </p>
                    
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-6 max-w-2xl mx-auto">
                        <h3 className="font-semibold text-purple-900 mb-3">Planned Features:</h3>
                        <ul className="text-left text-purple-800 space-y-1">
                            <li>• <strong>Valid Time Queries:</strong> See what #Jedi meant in 2020 vs 2024</li>
                            <li>• <strong>Transaction Time Tracking:</strong> When changes were recorded</li>
                            <li>• <strong>Timeline Visualization:</strong> Visual history of tag ownership</li>
                            <li>• <strong>Dispute History:</strong> Track major tag battles and resolutions</li>
                            <li>• <strong>Collection Evolution:</strong> How collections changed membership</li>
                            <li>• <strong>Vote Analysis:</strong> Voting patterns and trends over time</li>
                        </ul>
                    </div>

                    <div className="mt-8 text-sm text-gray-500">
                        <p>
                            The database already stores full bitemporal data with both valid_time 
                            (when something was true) and transaction_time (when it was recorded).
                        </p>
                    </div>
                </div>

                {/* Example scenarios */}
                <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <h3 className="font-semibold text-blue-900 mb-2">🌟 Example: #Jedi Evolution</h3>
                        <p className="text-sm text-blue-800">
                            Track how the definition of #Jedi changed from Original Trilogy purists 
                            to including Disney Canon and Legends content.
                        </p>
                    </div>
                    
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <h3 className="font-semibold text-green-900 mb-2">🚗 Example: Vehicle Synonyms</h3>
                        <p className="text-sm text-green-800">
                            See how #vehicle, #car, #auto, and #transport competed for semantic space 
                            and which collection won each term.
                        </p>
                    </div>
                    
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                        <h3 className="font-semibold text-orange-900 mb-2">🏦 Example: Bank Polysemy</h3>
                        <p className="text-sm text-orange-800">
                            Explore how #bank evolved between financial institutions and 
                            geographical features based on usage context.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default TagHistoryPage;