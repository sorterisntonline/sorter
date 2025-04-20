import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

// --- API Fetching Function for a SINGLE entity (copied from VotePage) ---
const fetchEntityFn = async (pk_namespace, pk) => {
    // Basic validation
    if (!pk_namespace || !pk) {
        throw new Error("Missing identifiers for entity fetch.");
    }
    // Uses the existing endpoint from entity.rs
    const apiUrl = `/api/entity/${encodeURIComponent(pk_namespace)}/${encodeURIComponent(pk)}`;
    console.log("Fetching entity details from:", apiUrl);
    const response = await fetch(apiUrl);

    if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`HTTP error! status: ${response.status} for ${apiUrl}. ${errorText}`);
        error.status = response.status; // Attach status code
        throw error;
    }
    const data = await response.json();
    return data.entity;
};


// --- API Function to Fetch Votes (filtered by parent) (copied from VotePage) ---
const fetchVotesFn = async (parentNs, parentPk) => {
    // Only fetch if parent info is available
    if (!parentNs || !parentPk) {
        console.log("Parent info missing, skipping vote fetch.");
        return []; // Return empty array if no parent to filter by
    }

    // Construct the URL with query parameters
    const apiUrl = `/api/vote?parent_entity_ns=${encodeURIComponent(parentNs)}&parent_entity_pk=${encodeURIComponent(parentPk)}`;
    console.log("Fetching previous votes from:", apiUrl);
    const response = await fetch(apiUrl);

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to fetch votes. Status: ${response.status}. Body: ${errorText}`);
        const error = new Error(`HTTP error fetching votes! status: ${response.status}. ${errorText}`);
        error.status = response.status; // Attach status code
        throw error;
    }
    const data = await response.json();
    // Assuming the API returns an array of Vote objects
    return data || []; // Return data or empty array
};

// --- Component for Displaying a Single Previous Vote (copied from VotePage) ---
function PreviousVoteItem({ vote }) {
    // Determine styling based on magnitude
    const magnitudeClass = vote.magnitude > 0
        ? 'bg-green-100 text-green-800 border border-green-200' // Added border, refined colors
        : vote.magnitude < 0
            ? 'bg-red-100 text-red-800 border border-red-200'   // Added border, refined colors
            : 'bg-gray-100 text-gray-700 border border-gray-200'; // Adjusted gray

    // Helper function to extract entity type
    const getEntityType = (ns) => ns.split('.').pop() || ns;

    // Extract and format necessary data
    const leftType = getEntityType(vote.left_entity_pk_namespace);
    const rightType = getEntityType(vote.right_entity_pk_namespace);
    const userIdShort = vote.user_id.substring(0, 8);
    // Use a more compact date/time format
    const voteDate = new Date(vote.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
    const magnitudeValue = vote.magnitude > 0 ? `+${vote.magnitude}` : vote.magnitude;

    let queryOptions = {
        staleTime: 5 * 60 * 1000, // Cache for 5 minutes
        retry: 1,
    };
    const { data: leftEntity, isLoading: leftEntityLoading, error: leftEntityError } = useQuery({ queryKey: ['entity', vote.left_entity_pk_namespace, vote.left_entity_pk], queryFn: () => fetchEntityFn(vote.left_entity_pk_namespace, vote.left_entity_pk), enabled: !!vote.left_entity_pk_namespace && !!vote.left_entity_pk, ...queryOptions });
    const { data: rightEntity, isLoading: rightEntityLoading, error: rightEntityError } = useQuery({ queryKey: ['entity', vote.right_entity_pk_namespace, vote.right_entity_pk], queryFn: () => fetchEntityFn(vote.right_entity_pk_namespace, vote.right_entity_pk), enabled: !!vote.right_entity_pk_namespace && !!vote.right_entity_pk, ...queryOptions });

    // Helper to display entity title or loading/error state
    const renderEntityName = (entity, isLoading, error, pk) => {
        if (isLoading) return <span className="italic text-gray-400">Loading...</span>;
        if (error) return <span className="italic text-red-500" title={error.message}>Error</span>;
        if (entity?.title) return <span className="font-semibold" title={pk}>{entity.title}</span>;
        return <span className="italic text-gray-500" title={pk}>Unknown</span>; // Fallback if title is missing
    };


    return (
        // Use white background, rounded corners, subtle shadow, and hover effect
        <li className="p-3 border border-gray-200 rounded-md bg-white shadow-sm hover:shadow-md transition-shadow duration-150 ease-in-out">
            <div className="flex justify-between items-center mb-1.5"> {/* Increased margin-bottom */}
                {/* Entity Comparison with Types and Fetched Titles */}
                <span
                    className="font-normal text-gray-800 text-sm truncate" // Changed default weight
                    title={`${vote.left_entity_pk_namespace}:${vote.left_entity_pk} vs ${vote.right_entity_pk_namespace}:${vote.right_entity_pk}`} // Tooltip for full info
                >
                    <span className="text-gray-500 text-xs capitalize">({leftType})</span> {renderEntityName(leftEntity, leftEntityLoading, leftEntityError, vote.left_entity_pk)}
                    <span className="mx-1.5 text-gray-400 font-light">vs</span> {/* Adjusted spacing and weight */}
                    <span className="text-gray-500 text-xs capitalize">({rightType})</span> {renderEntityName(rightEntity, rightEntityLoading, rightEntityError, vote.right_entity_pk)}
                </span>

                {/* Magnitude Badge - Rounded pill shape, bolder */}
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${magnitudeClass} flex-shrink-0 ml-2`}> {/* Added flex-shrink-0 and margin */}
                    {magnitudeValue}
                </span>
            </div>
            {/* Metadata line */}
            <div className="text-xs text-gray-500 flex justify-between items-center">
                 {/* Attribute and User Info */}
                 <span className="truncate"> {/* Added truncate */}
                    Attr: <span className="font-medium text-gray-600">{vote.attribute_id}</span>
                    <span className="mx-1.5 text-gray-400">|</span> {/* Separator */}
                    User: <span className="font-medium text-gray-600" title={vote.user_id}>{userIdShort}...</span>
                 </span>
                 {/* Timestamp */}
                 <span className="flex-shrink-0 ml-2" title={new Date(vote.created_at).toISOString()}> {/* Add full ISO date title */}
                    {voteDate}
                 </span>
            </div>
             {/* Optional: Display entity fetch errors more explicitly if needed */}
             {(leftEntityError || rightEntityError) && (
                <div className="text-xs text-red-500 mt-1 border-t pt-1">
                    {leftEntityError && <p>Error loading left item: {leftEntityError.status === 404 ? 'Not Found' : 'Fetch Failed'}</p>}
                    {rightEntityError && <p>Error loading right item: {rightEntityError.status === 404 ? 'Not Found' : 'Fetch Failed'}</p>}
                </div>
            )}
        </li>
    );
}

// --- Main Vote History Page Component ---
function VoteHistoryPage() {
    const [searchParams] = useSearchParams();
    // Assuming the parent entity is passed via URL params, similar to VotePage
    const pk_namespace = searchParams.get('pk_namespace');
    const pk = searchParams.get('pk');

    const queryOptions = {
        staleTime: 5 * 60 * 1000, // Cache for 5 minutes
        retry: 1,
    };

    // Query for Previous Votes (filtered by parent)
    const votesQuery = useQuery({
        queryKey: ['votes', pk_namespace, pk], // Include parent in query key
        queryFn: () => fetchVotesFn(pk_namespace, pk),
        enabled: !!pk_namespace && !!pk, // Only run if parent info exists
        ...queryOptions
    });

    const previousVotes = votesQuery.data || []; // Default to empty array

    // TODO: Add fetch for the parent entity details to display its title?

    return (
        <div className="min-h-screen bg-gray-50/60 flex flex-col items-center pt-10 pb-10 px-4">
            <div className="w-full max-w-4xl">

                {/* --- Previous Votes Section (Moved from VotePage) --- */}
                 {(!pk_namespace || !pk) && (
                     <div className="text-center text-gray-500 py-10">
                         Please provide parent entity identifiers (pk_namespace, pk) in the URL to see vote history.
                    </div>
                 )}
                 {pk_namespace && pk && (
                    <div className="w-full max-w-4xl mt-8 p-4 bg-white rounded-lg shadow">
                        {/* TODO: Display Parent Entity Title Here */}
                        <h3 className="text-lg font-semibold mb-3 text-gray-700 border-b pb-2">
                            Vote History for <span className="font-mono text-sm">{pk_namespace}/{pk}</span>
                        </h3>
                        {votesQuery.isLoading && <p className="text-gray-500">Loading votes...</p>}
                        {votesQuery.isError && (
                             <div className="text-center text-red-600 bg-red-50 border border-red-200 p-4 rounded-md shadow-sm mb-4">
                                <p>Error loading previous votes: {votesQuery.error?.message || 'Unknown error'}</p>
                            </div>
                        )}
                        {votesQuery.isSuccess && previousVotes.length === 0 && (
                            <p className="text-gray-500">No votes found for this parent yet.</p>
                        )}
                        {votesQuery.isSuccess && previousVotes.length > 0 && (
                            <ul className="space-y-2 text-sm">
                                {previousVotes.map((vote, index) => (
                                    // Use the new component here
                                    <PreviousVoteItem key={vote.id || index} vote={vote} /> // Use vote.id if available and unique
                                ))}
                            </ul>
                        )}
                    </div>
                 )}
                 {/* Optional Debug Info */}
                {/* <pre className="mt-4 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
                    {JSON.stringify({ pk_namespace, pk, votesQueryStatus: votesQuery.status, voteCount: previousVotes.length }, null, 2)}
                </pre> */}
            </div>
        </div>
    );
}

export default VoteHistoryPage;
