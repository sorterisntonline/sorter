import { useState, useEffect, useRef, useMemo } from 'react';
// Import React Router hooks
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
// Import React Query hooks
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
// Import CSSTransition for potential future animations (optional here)
import { CSSTransition, SwitchTransition } from 'react-transition-group';


// --- API Fetching Functions (Copied from old App.jsx) ---
const fetchEntityDetailsFn = async (pk_namespace, pk) => {
    if (!pk_namespace || !pk) {
        throw new Error("pk_namespace and pk are required to fetch details.");
    }
    const detailsApiUrl = `/api/entity/${encodeURIComponent(pk_namespace)}/${encodeURIComponent(pk)}?parents=true&children=true`;
    console.log("Fetching details from:", detailsApiUrl);
    const response = await fetch(detailsApiUrl);

    if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`HTTP error! status: ${response.status} for ${detailsApiUrl}. ${errorText}`);
        error.status = response.status;
        throw error;
    }
    const data = await response.json();
    return data;
};

const ensureEntityFn = async ({ pk_namespace, pk, title, metadata }) => {
    const isSpotifyEntity = pk_namespace.startsWith('spotify.');
    if (!isSpotifyEntity) {
        console.log(`Skipping ensure for non-Spotify entity: ${pk_namespace}/${pk}`);
        return { skipped: true };
    }

    console.log(`Ensuring Spotify entity: ${pk_namespace}/${pk}`);
    const response = await fetch(`/api/spotify/ensure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pk_namespace, pk, title, metadata }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to ensure entity ${pk_namespace}/${pk}: ${response.status} ${errorText}`);
        throw new Error(`Ensure failed for ${pk_namespace}/${pk}: ${response.status} ${errorText}`, { cause: { status: response.status } });
    }

    console.log(`Ensure successful or entity already existed for: ${pk_namespace}/${pk}`);
    return await response.json();
};

const fetchRankedChildrenFn = async (childrenIdentifiers) => {
    if (!childrenIdentifiers || childrenIdentifiers.length === 0) {
        return { sorted: [], unsorted: [] };
    }
    console.log("Fetching ranks for children subset:", childrenIdentifiers);
    const response = await fetch(`/api/rank`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(childrenIdentifiers),
    });

    if (!response.ok) {
        const errorText = await response.text();
        const error = new Error(`HTTP error fetching ranks! status: ${response.status}. ${errorText}`);
        error.status = response.status;
        console.error("Rank fetching failed:", error);
        throw error;
    }
    const rankedData = await response.json();
    const result = {
         sorted: rankedData?.sorted ?? [],
         unsorted: rankedData?.unsorted ?? []
    };
    console.log("Received ranked data subset:", result);
    return result;
};

// --- Child List Item Component ---
function ChildListItem({ child, onItemClick, score, isRanked }) {
    const displayScore = score !== undefined && score !== null ? score * 10000 : null;

    return (
        <div
            className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-smd cursor-pointer hover:bg-gray-100 transition-colors duration-100 ease-in-out group ${!isRanked ? 'opacity-70 hover:opacity-100' : ''}`}
            onClick={(e) => onItemClick(e, child.pk_namespace, child.pk)} // Use passed handler
        >
            <div className="flex items-center gap-2 flex-1 min-w-0">
                {child.profile_picture_url ? (
                    <img src={child.profile_picture_url} alt={child.title || 'Child item image'} className="w-7 h-7 rounded-smd object-cover flex-shrink-0" />
                ) : (
                    <div className="w-7 h-7 bg-gray-100 border border-gray-200 inline-flex items-center justify-center text-gray-400 text-lg flex-shrink-0 rounded-smd">?</div>
                )}
                <span className="truncate">{child.title}</span>
            </div>
            {isRanked && displayScore !== null && (
                 <span className="text-xs font-medium text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded-smd flex-shrink-0">
                     {displayScore.toFixed(0)}
                 </span>
            )}
            {!isRanked && (
                 <span className="text-xs font-medium text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded-smd flex-shrink-0 italic">
                     Unranked
                 </span>
            )}
        </div>
    );
}

// --- RankedChildList Component ---
function RankedChildList({ parentNamespace, parentPk, childType, childrenOfType, onItemClick }) {
    const identifiersForType = useMemo(() => childrenOfType.map(c => ({
        pk_namespace: c.pk_namespace,
        pk: c.pk
    })), [childrenOfType]);

    const rankQuery = useQuery({
        queryKey: ['entityRanks', parentNamespace, parentPk, childType],
        queryFn: () => fetchRankedChildrenFn(identifiersForType),
        enabled: !!parentNamespace && !!parentPk && identifiersForType.length > 0,
        staleTime: 5 * 60 * 1000,
        placeholderData: { sorted: [], unsorted: [] },
        refetchOnWindowFocus: false,
    });

    const childrenToRender = useMemo(() => {
        const sortedRankedChildren = rankQuery.data?.sorted || [];
        const unsortedUnrankedIdentifiers = rankQuery.data?.unsorted || [];
        const unrankedSetForType = new Set(unsortedUnrankedIdentifiers.map(item => `${item.pk_namespace}:${item.pk}`));

        const displaySorted = sortedRankedChildren.map(rankedItem => ({
             ...rankedItem.identifier,
             score: rankedItem.score,
             ...(childrenOfType.find(c => c.pk_namespace === rankedItem.identifier.pk_namespace && c.pk === rankedItem.identifier.pk) || {}),
             isRanked: true,
        }));

        const displayUnsorted = childrenOfType
            .filter(child => unrankedSetForType.has(`${child.pk_namespace}:${child.pk}`))
            .map(child => ({ ...child, isRanked: false, score: undefined }));

        return [...displaySorted, ...displayUnsorted];

    }, [rankQuery.data, childrenOfType]);

    return (
        <div className="text-sm text-gray-700 space-y-1">
            {rankQuery.isLoading && <div className="text-xs text-gray-400 italic px-2">Loading ranks...</div>}
            {rankQuery.isError && <div className="text-xs text-red-500 italic px-2">Error loading ranks.</div>}

            {childrenToRender.map((child) => (
                <ChildListItem
                    key={`${child.pk_namespace}-${child.pk}`}
                    child={child}
                    onItemClick={onItemClick} // Pass handler down
                    score={child.score}
                    isRanked={child.isRanked}
                />
            ))}
            {!rankQuery.isLoading && childrenToRender.length === 0 && (
                 <div className="text-xs text-gray-400 italic px-2">No items of this type.</div>
            )}
        </div>
    );
}

// --- Item Pair Preview Link Component ---
function ItemPairPreviewLink({ parentNamespace, parentPk, childType, item1, item2}) {
    // Link generation remains the same
    const voteLink = `/vote?pk_namespace=${encodeURIComponent(parentNamespace)}&pk=${encodeURIComponent(parentPk)}&type=${encodeURIComponent(childType)}&left_ns=${encodeURIComponent(item1.pk_namespace)}&left_pk=${encodeURIComponent(item1.pk)}&right_ns=${encodeURIComponent(item2.pk_namespace)}&right_pk=${encodeURIComponent(item2.pk)}`;

    const renderItemPreview = (item) => (
        <div className="text-center flex flex-col items-center w-1/3">
            {item.profile_picture_url && <img src={item.profile_picture_url} alt={item.title} className="w-12 h-12 object-cover rounded-smd mb-1 shadow"/>}
            {!item.profile_picture_url && <div className="w-12 h-12 bg-gray-200 rounded-smd mb-1 flex items-center justify-center text-gray-400 text-xl shadow">?</div>}
            <span className="text-xs text-gray-700 truncate w-full px-1">{item.title}</span>
        </div>
    );

    return (
        <div>
            <Link className={`cursor-pointer p-3 border border-black-200 rounded-smd bg-brand-50/40 flex items-center justify-around gap-2 relative group no-underline transition transform hover:-translate-y-0.5`}
            to={voteLink} // Use react-router Link
            >
                {renderItemPreview(item1)}
                {renderItemPreview(item2)}
            </Link>
            {/* Commented section removed for brevity */}
        </div>
    );
}

// --- (Optional) Spotify Player Component Placeholder ---
// If you have a SpotifyPlayer component, include it here or import it
function SpotifyPlayer({ uri }) {
    if (!uri) return null;
    const embedUrl = `https://open.spotify.com/embed/${uri.replace('spotify:', '').replace(':', '/')}`;
    return (
        <iframe
            style={{ borderRadius: '12px' }}
            src={embedUrl}
            width="100%"
            height="152" // Or desired height
            frameBorder="0"
            allowFullScreen=""
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            title="Spotify Embed Player"
        ></iframe>
    );
}


// --- EntityDetailsDisplay Component (Receives props) ---
function EntityDetailsDisplay({ entityDetails, onNavigate, onEnsureManually, isEnsuring }) {
    const { entity, parents, children } = entityDetails || {};
    const { title, pk_namespace, pk, metadata } = entity || {};
    const entityType = pk_namespace?.split('.')[1];

    const groupedChildrenByType = useMemo(() => {
        // Grouping logic remains the same
        const groups = {};
        if (!children || children.length === 0) return groups;
        children.forEach(child => {
            const childType = child.pk_namespace;
            if (!groups[childType]) groups[childType] = [];
            groups[childType].push(child);
        });
        return groups;
    }, [children]);

    // --- Early return MUST be after all hooks ---
    if (!entityDetails || !entity) {
        // This condition might be handled by the parent EntityPage component's loading/error state
        return <div className="text-gray-500">No details available.</div>;
    }

    const spotifyUri = `spotify:${entityType}:${pk}`;

    const handleManualEnsure = () => {
        if (onEnsureManually && !isEnsuring) {
            console.log(`Manually ensuring ${pk_namespace}/${pk}`);
            onEnsureManually({ pk_namespace, pk, title, metadata }); // Use passed handler
        }
    };

    // --- Click handler using onNavigate prop ---
    const handleLinkClick = (e, pk_ns, pk) => {
        e.preventDefault(); // Prevent default link behavior
        onNavigate(pk_ns, pk); // Use the navigation handler passed via props
    };

    // Basic info section (including manual ensure button)
    let basicInfo = (
         <h3 className="text-2xl font-semibold flex items-center gap-2 mb-2">
             <span>{title}</span>
             <span className="text-sm font-normal text-gray-500">[{entityType}]</span>
             {pk_namespace?.startsWith('spotify.') && onEnsureManually && (
                 <button
                     onClick={handleManualEnsure}
                     disabled={isEnsuring}
                     className={`text-xs cursor-pointer px-2 py-0.5 rounded ${isEnsuring ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-brand-100 text-brand-700 hover:bg-brand-200'}`}
                     title={`Manually trigger backend sync for ${title}`}
                 >
                     {isEnsuring ? 'Syncing...' : 'Sync'}
                 </button>
             )}
         </h3>
    );

    let imageElement = null;
    if (entity.profile_picture_url) {
        const imageUrl = entity.profile_picture_url;
        if (imageUrl) {
             imageElement = <img src={imageUrl} alt={`Cover for ${title}`} className="w-40 h-40 object-cover rounded-smd shadow" />;
        }
    } else {
        imageElement = <div className="w-40 h-40 bg-gray-200 rounded-smd shadow flex items-center justify-center text-gray-400 text-4xl flex-shrink-0">?</div>;
    }

    const sortedChildTypes = Object.keys(groupedChildrenByType).sort();
    const trackPlayer = entityType === 'track' ? <SpotifyPlayer uri={spotifyUri} /> : null;

    return (
        // Structure remains largely the same, ensure handleLinkClick is used for parent/child links
        <div className="bg-white rounded-smd p-5 flex flex-col gap-5 shadow-card">
            {/* Render Parents */}
            {parents && parents.length > 0 && (
                <div className="text-xs text-gray-600">
                    <span className="font-semibold text-gray-700 mr-1">Part of:</span>
                    {parents.map((parent, index) => {
                        const parentType = parent.pk_namespace.split('.')[1];
                        return (
                            <span key={`${parent.pk_namespace}-${parent.pk}`}>
                                {/* Use onClick with handleLinkClick */}
                                <a href={`/entity?pk_namespace=${parent.pk_namespace}&pk=${parent.pk}`} 
                                    onClick={(e) => handleLinkClick(e, parent.pk_namespace, parent.pk)}
                                    className="text-brand-600 hover:underline cursor-pointer">
                                        {parent.title} <span className="text-gray-500 capitalize">[{parentType}]</span>
                                </a>
                                {index < parents.length - 1 && ', '}
                            </span>
                        );
                    })}
                </div>
            )}
            <div className="flex gap-5">
                {imageElement || <div className="w-40 h-40 bg-gray-100 border border-gray-200 rounded-smd shadow flex items-center justify-center text-gray-400 text-4xl flex-shrink-0">?</div>}
                <div className="flex-1">
                    {basicInfo}
                    {trackPlayer}
                </div>
            </div>
            {/* Render Children */}
            {sortedChildTypes.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                    {sortedChildTypes.map((childType) => {
                        const childrenOfType = groupedChildrenByType[childType];
                        let item1, item2;
                        if (childrenOfType && childrenOfType.length >= 2) {
                            let index1 = Math.floor(Math.random() * childrenOfType.length);
                            let index2;
                            do { index2 = Math.floor(Math.random() * childrenOfType.length); } while (index1 === index2);
                            item1 = childrenOfType[index1];
                            item2 = childrenOfType[index2];
                        }
                        return (
                            <div key={childType} className="mb-4">
                                <h5 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                                    {childType.replace(/^spotify\./, '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                </h5>
                                {/* Item Pair Preview */}
                                {item1 && item2 && (
                                    <ItemPairPreviewLink
                                        parentNamespace={pk_namespace}
                                        parentPk={pk}
                                        childType={childType}
                                        item1={item1}
                                        item2={item2}
                                    />
                                )}
                                {/* Ranked Child List */}
                                <RankedChildList
                                    parentNamespace={pk_namespace}
                                    parentPk={pk}
                                    childType={childType}
                                    childrenOfType={childrenOfType}
                                    onItemClick={handleLinkClick} // Pass navigation handler
                                />
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// --- Main Entity Page Component ---
function EntityPage() {
    const [searchParams, setSearchParams] = useSearchParams(); // Get params from URL
    const urlPkNamespace = searchParams.get('pk_namespace');
    const urlPk = searchParams.get('pk');
    console.log("urlPkNamespace:", urlPkNamespace);
    console.log("urlPk:", urlPk);
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const entityDetailsNodeRef = useRef(null); // For transition animations

    // --- Ensure Mutation ---
    const ensureMutation = useMutation({
        mutationFn: ensureEntityFn,
        onSuccess: (data, variables) => {
            console.log("Ensure mutation successful:", data);
            // Invalidate details query to refetch after ensure
            queryClient.invalidateQueries({ queryKey: ['entityDetails', variables.pk_namespace, variables.pk] });
        },
        onError: (error, variables) => {
            console.error(`Ensure mutation failed for ${variables.pk_namespace}/${variables.pk}:`, error);
            // Potentially show an error message to the user
        },
    });

    // --- Details Query ---
    const detailsQuery = useQuery({
        queryKey: ['entityDetails', urlPkNamespace, urlPk],
        queryFn: () => fetchEntityDetailsFn(urlPkNamespace, urlPk),
        enabled: !!urlPkNamespace && !!urlPk, // Only run if params exist
        staleTime: 10 * 60 * 1000, // Example: 10 minutes
        retry: (failureCount, error) => {
            // Retry logic for 404 + ensure
            if (error.status === 404 && urlPkNamespace?.startsWith('spotify.')) {
                return false; // Don't retry 404, trigger ensure instead
            }
            return failureCount < 3; // Default retry for other errors
        },
        onError: (error) => {
             console.error(`Failed to fetch entity details for ${urlPkNamespace}/${urlPk}:`, error.message);
             if (error.status === 404 && urlPkNamespace?.startsWith('spotify.') && !ensureMutation.isLoading) {
                 console.log(`Details fetch failed with 404 for ${urlPkNamespace}/${urlPk}. Triggering ensure.`);
                 // Attempt ensure with minimal data (title/metadata might be missing if loaded directly via URL)
                 ensureMutation.mutate({
                     pk_namespace: urlPkNamespace,
                     pk: urlPk,
                     title: `Entity ${urlPk}`, // Placeholder
                     metadata: { source: 'frontend_url_retry' },
                 });
             }
        },
         onSuccess: (data) => {
             console.log(`Details query succeeded for URL item: ${urlPkNamespace}/${urlPk}`, data?.entity?.title);
             // Trigger rank prefetch/fetch PER TYPE when details load
             const childrenByType = {};
             if (data?.children) {
                 data.children.forEach(child => {
                    const type = child.pk_namespace;
                    if (!childrenByType[type]) childrenByType[type] = [];
                    childrenByType[type].push({ pk_namespace: child.pk_namespace, pk: child.pk });
                 });
             }
             Object.entries(childrenByType).forEach(([childType, identifiers]) => {
                 if (identifiers.length > 0) {
                     console.log(`Prefetching/fetching ranks for type ${childType} after details success.`);
                     queryClient.prefetchQuery({
                         queryKey: ['entityRanks', urlPkNamespace, urlPk, childType],
                         queryFn: () => fetchRankedChildrenFn(identifiers),
                         staleTime: 5 * 60 * 1000,
                     });
                 }
             });
         },
    });

    // --- Navigation Handler ---
    const handleNavigate = (pk_ns, pk) => {
        console.log("Navigating from Entity Page to:", pk_ns, pk);
        navigate(`/entity?pk_namespace=${encodeURIComponent(pk_ns)}&pk=${encodeURIComponent(pk)}`);
    };

    // --- Determine Display State ---
    const displayState = (() => {
        // If ensure is running due to a 404 retry, show loading
        if (urlPkNamespace === null || urlPk === null) return 'none_selected';
        if (ensureMutation.isLoading && detailsQuery.status === 'error' && detailsQuery.error?.status === 404) return 'loading';
        if (detailsQuery.isLoading) return 'loading';
        if (ensureMutation.isError) return 'error_ensure'; // Ensure failed directly
        if (detailsQuery.isError) return 'error_details'; // Details failed (and ensure didn't run or also failed)
        if (detailsQuery.isSuccess) return 'success';
        return 'loading'; // Default/initial state
    })();

    return (
        <div className="w-full max-w-2xl mx-auto"> {/* Optional: Center content */}
             {/* Optional: Add a title or breadcrumbs */}
             {/* <h1 className="text-2xl font-semibold mb-4">Entity Details</h1> */}

             {/* Display Area based on state */}
             <SwitchTransition mode="out-in">
                 <CSSTransition
                     key={`${displayState}-${urlPkNamespace}-${urlPk}`} // Key triggers transition
                     nodeRef={entityDetailsNodeRef}
                     timeout={180}
                     classNames="fade" // Use your CSS transition classes
                     unmountOnExit
                 >
                     <div ref={entityDetailsNodeRef}>
                        {displayState === 'none_selected' && (
                            <div className="p-5 border border-gray-200 rounded-smd bg-white shadow-card text-gray-500 text-center">
                                No entity selected
                            </div>
                        )}
                         {/* Loading state */}
                         {displayState === 'loading' && (
                             <div className="p-5 border border-gray-200 rounded-smd bg-white shadow-card text-gray-500 text-center">
                                 Loading details... {ensureMutation.isLoading ? '(Ensuring entity...)' : ''}
                             </div>
                         )}
                         {/* Error states */}
                         {displayState === 'error_ensure' && (
                             <div className="p-5 border border-red-300 rounded-smd bg-red-50 shadow-card text-red-700">
                                 Error ensuring entity: {ensureMutation.error?.message || 'Unknown error'}
                             </div>
                         )}
                         {/* Separate check for details error only if ensure didn't error */}
                         {displayState === 'error_details' && !ensureMutation.isError && (
                             <div className="p-5 border border-red-300 rounded-smd bg-red-50 shadow-card text-red-700">
                                 Error loading details: {detailsQuery.error?.message || 'Unknown error'}
                                 {detailsQuery.error?.status === 404 && urlPkNamespace?.startsWith('spotify.') && ' (Could not find or ensure the Spotify entity)'}
                             </div>
                         )}
                         {/* Success state */}
                         {displayState === 'success' && detailsQuery.data && (
                             <EntityDetailsDisplay
                                 entityDetails={detailsQuery.data}
                                 onNavigate={handleNavigate} // Pass navigation handler
                                 onEnsureManually={ensureMutation.mutate} // Pass ensure handler
                                 isEnsuring={ensureMutation.isLoading} // Pass ensure loading state
                             />
                         )}
                          {/* Placeholder state (If needed, though usually covered by loading/error) */}
                         {/* {displayState === 'placeholder' && ( ... )} */}
                     </div>
                 </CSSTransition>
             </SwitchTransition>
        </div>
    );
}

export default EntityPage;
