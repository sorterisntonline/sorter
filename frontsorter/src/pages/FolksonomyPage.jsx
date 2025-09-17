import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { 
    fetchFolksonomyInfoFn, 
    fetchFolksonomyStatsFn, 
    createExampleScenarioFn 
} from '../fetchers/folksonomyEndpoints';

// Component to display a single concept card
function ConceptCard({ concept }) {
    return (
        <div className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
                {concept.problem}
            </h3>
            <div className="space-y-3">
                <div>
                    <span className="text-sm font-medium text-blue-600">Solution:</span>
                    <p className="text-sm text-gray-700 mt-1">{concept.solution}</p>
                </div>
                <div>
                    <span className="text-sm font-medium text-green-600">Example:</span>
                    <p className="text-sm text-gray-700 mt-1 italic">{concept.example}</p>
                </div>
            </div>
        </div>
    );
}

// Component to display statistics
function StatsCard({ stats, isLoading }) {
    if (isLoading) {
        return (
            <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Database Statistics</h3>
                <div className="animate-pulse">
                    <div className="h-4 bg-gray-200 rounded mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded mb-2"></div>
                    <div className="h-4 bg-gray-200 rounded"></div>
                </div>
            </div>
        );
    }

    const statItems = [
        { label: 'Tag Collections', value: stats.tag_collections_count, color: 'text-blue-600' },
        { label: 'Tag Claims', value: stats.tag_claims_count, color: 'text-green-600' },
        { label: 'Collection Memberships', value: stats.collection_memberships_count, color: 'text-purple-600' },
        { label: 'Votes Cast', value: stats.votes_count, color: 'text-orange-600' },
        { label: 'Reputation Entries', value: stats.reputation_entries_count, color: 'text-indigo-600' },
        { label: 'Slug Resolutions', value: stats.slug_resolutions_count, color: 'text-red-600' },
    ];

    return (
        <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Database Statistics</h3>
            <div className="grid grid-cols-2 gap-4">
                {statItems.map((item, index) => (
                    <div key={index} className="text-center">
                        <div className={`text-2xl font-bold ${item.color}`}>
                            {item.value.toLocaleString()}
                        </div>
                        <div className="text-sm text-gray-600">{item.label}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// Component for creating example scenarios
function ExampleScenarios() {
    const queryClient = useQueryClient();
    const [selectedScenario, setSelectedScenario] = useState('');

    const scenarios = [
        {
            key: 'jedi_dispute',
            name: 'Jedi Canon Dispute',
            description: 'Create competing collections for #Jedi (Original Trilogy vs Disney Canon vs Legends)'
        },
        {
            key: 'synonyms',
            name: 'Vehicle Synonyms',
            description: 'Demonstrate synonym handling with #vehicle, #car, #auto, #transport'
        },
        {
            key: 'personal_tags',
            name: 'Personal vs Community Tags',
            description: 'Show private collections vs public collections for #toread'
        }
    ];

    const createScenarioMutation = useMutation({
        mutationFn: createExampleScenarioFn,
        onSuccess: (data) => {
            console.log('Scenario created successfully:', data);
            // Invalidate stats to refresh counts
            queryClient.invalidateQueries({ queryKey: ['folksonomy', 'stats'] });
            setSelectedScenario('');
        },
        onError: (error) => {
            console.error('Failed to create scenario:', error);
        },
    });

    const handleCreateScenario = () => {
        if (selectedScenario) {
            createScenarioMutation.mutate(selectedScenario);
        }
    };

    return (
        <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Example Scenarios</h3>
            <p className="text-sm text-gray-600 mb-4">
                Create example data to demonstrate folksonomy concepts:
            </p>
            
            <div className="space-y-3 mb-4">
                {scenarios.map((scenario) => (
                    <label key={scenario.key} className="flex items-start space-x-3 cursor-pointer">
                        <input
                            type="radio"
                            name="scenario"
                            value={scenario.key}
                            checked={selectedScenario === scenario.key}
                            onChange={(e) => setSelectedScenario(e.target.value)}
                            className="mt-1 text-blue-600"
                            disabled={createScenarioMutation.isPending}
                        />
                        <div>
                            <div className="font-medium text-gray-900">{scenario.name}</div>
                            <div className="text-sm text-gray-600">{scenario.description}</div>
                        </div>
                    </label>
                ))}
            </div>

            {createScenarioMutation.isError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                    <p className="text-sm text-red-600">
                        {createScenarioMutation.error?.status === 401 || createScenarioMutation.error?.status === 403
                            ? 'Authentication required to create scenarios'
                            : `Error: ${createScenarioMutation.error?.message || 'Unknown error'}`}
                    </p>
                </div>
            )}

            {createScenarioMutation.isSuccess && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
                    <p className="text-sm text-green-600">
                        Scenario created successfully! Check the updated statistics above.
                    </p>
                </div>
            )}

            <button
                onClick={handleCreateScenario}
                disabled={!selectedScenario || createScenarioMutation.isPending}
                className={`w-full px-4 py-2 rounded-md font-medium transition-colors ${
                    !selectedScenario || createScenarioMutation.isPending
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
            >
                {createScenarioMutation.isPending ? 'Creating...' : 'Create Example Scenario'}
            </button>
        </div>
    );
}

// Main folksonomy page component
function FolksonomyPage() {
    // Fetch system information
    const infoQuery = useQuery({
        queryKey: ['folksonomy', 'info'],
        queryFn: fetchFolksonomyInfoFn,
        staleTime: 5 * 60 * 1000, // 5 minutes
        retry: 1,
    });

    // Fetch database statistics
    const statsQuery = useQuery({
        queryKey: ['folksonomy', 'stats'],
        queryFn: fetchFolksonomyStatsFn,
        staleTime: 30 * 1000, // 30 seconds (more frequent updates)
        retry: 1,
    });

    const isLoading = infoQuery.isLoading || statsQuery.isLoading;
    const hasError = infoQuery.isError || statsQuery.isError;

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <div className="text-gray-600">Loading Folksonomy System...</div>
                </div>
            </div>
        );
    }

    if (hasError) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center max-w-md">
                    <div className="text-red-600 text-xl mb-4">⚠️ System Error</div>
                    <div className="text-gray-600 mb-4">
                        Failed to load folksonomy system data:
                    </div>
                    {infoQuery.isError && (
                        <div className="text-sm text-red-600 mb-2">
                            Info: {infoQuery.error?.message}
                        </div>
                    )}
                    {statsQuery.isError && (
                        <div className="text-sm text-red-600 mb-4">
                            Stats: {statsQuery.error?.message}
                        </div>
                    )}
                    <button 
                        onClick={() => {
                            infoQuery.refetch();
                            statsQuery.refetch();
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-7xl mx-auto px-4 py-8">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-4">
                        🏷️ Bitemporal Folksonomy System
                    </h1>
                    <p className="text-lg text-gray-600 max-w-3xl mx-auto">
                        {infoQuery.data?.message || 'Competitive Democratic Tagging'}
                    </p>
                </div>

                {/* Navigation */}
                <div className="flex justify-center mb-8">
                    <div className="bg-white rounded-lg shadow-sm p-2 flex space-x-2">
                        <Link 
                            to="/folksonomy/vote"
                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                        >
                            🗳️ Vote on Tags
                        </Link>
                        <Link 
                            to="/folksonomy/collections"
                            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                        >
                            📚 Browse Collections
                        </Link>
                        <Link 
                            to="/folksonomy/history"
                            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
                        >
                            📜 Tag History
                        </Link>
                    </div>
                </div>

                {/* Main content grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left column: Concepts */}
                    <div className="lg:col-span-2">
                        <h2 className="text-2xl font-semibold text-gray-900 mb-6">
                            Key Concepts Addressed
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {infoQuery.data?.example_concepts?.map((concept, index) => (
                                <ConceptCard key={index} concept={concept} />
                            ))}
                        </div>
                    </div>

                    {/* Right column: Stats and Examples */}
                    <div className="space-y-6">
                        <StatsCard 
                            stats={statsQuery.data} 
                            isLoading={statsQuery.isLoading} 
                        />
                        <ExampleScenarios />
                    </div>
                </div>

                {/* Footer info */}
                <div className="mt-12 text-center text-sm text-gray-500">
                    <p>
                        This system demonstrates competitive democratic tagging where multiple 
                        collections can compete for hashtag ownership through voting.
                    </p>
                    <p className="mt-2">
                        Built on Sorter's existing democratic voting infrastructure.
                    </p>
                </div>
            </div>
        </div>
    );
}

export default FolksonomyPage;