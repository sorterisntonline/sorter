import * as ohm from 'ohm-js';
import useSWR from "swr";
import { create } from "zustand";
import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import debounce from 'lodash/debounce';  // For debouncing
import { useQuery } from '@tanstack/react-query';
import { format } from 'timeago.js';

import { VotePanel } from "./VotePanel";
import { VotesPanel } from './VotesPanel';
import { ItemPanel } from './ItemPanel';
import { current_session, fetchSession } from "./session";
import { redirectToLogin, redirectToRegister } from './authUtils';
import WarningPopup from './WarningPopup';
import { initiateOAuth } from './oauth/useOAuth';
import { SpotifyAuthButton } from './oauth/OAuthButton';

// Constants
const SPOTIFY_LOGO_URL = "https://upload.wikimedia.org/wikipedia/commons/1/19/Spotify_logo_without_text.svg";

// Functional Components
const SpotifyIcon = () => (
  <img
    width="18"
    className="m-1"
    src={SPOTIFY_LOGO_URL}
    alt="Spotify"
  />
);

// Zustand Store
export const useStore = create((set, get) => ({
  results: null,
  items_by_id: {},
  spotifyConnected: false,
  activePanel: 1,

  setResults: (results) => {
    const items_by_id = {};
    if (results) {
      ['unsorted', 'sorted'].forEach(key => {
        results[key]?.forEach(item => {
          items_by_id[item.id] = item;
        });
      });
    }
    set({ results, items_by_id });
  },

  fetchResults: async () => {
    const params = new URLSearchParams(window.location.search);
    try {
      const response = await fetch(`/api/tag/page2?${params.toString()}`);
      const data = await response.json();
      get().setResults(data);
      return data;
    } catch (error) {
      console.error('Failed to fetch results:', error);
      get().setResults(null);
      return null;
    }
  },

  setSpotifyConnected: (connected) => set({ spotifyConnected: connected }),
  setActivePanel: (panel) => set({ activePanel: panel }),
}));

// Custom Hooks
const useQueryState = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const fetchResults = useStore(state => state.fetchResults);

  const parseParams = () => {
    const parseType = (param, type, namespaceParam) => {
      const values = searchParams.get(param)?.split('+') || [];
      const namespaces = searchParams.get(namespaceParam)?.split('+') || [];
      return values.map((value, i) => ({
        type,
        value,
        namespace: namespaces[i] || null
      }));
    };
    
    const parseActions = () => searchParams.get('a')?.split('+').map(action => {
      const match = action.match(/^(\w+)(\d+)?$/);
      return { type: 'action', value: match[1], itemId: match[2] };
    }) || [];
    
    const parseItem = () => searchParams.get('item') ? [{ type: 'item', value: searchParams.get('item') }] : [];

    return [
      ...parseType('t', 'hashtag', 'ns'),
      ...parseType('u', 'mention', 'uns'),
      ...parseActions(),
      ...parseItem()
    ];
  };

  const updateParams = (updates) => {
    const newParams = new URLSearchParams();

    const serializeTypeWithNamespace = (type, param, namespaceParam) => {
      const items = updates.filter(item => item.type === type);
      if (items.length) {
        newParams.set(param, items.map(item => item.value).join('+'));
        const namespaces = items.map(item => item.namespace).filter(Boolean);
        if (namespaces.length) {
          newParams.set(namespaceParam, namespaces.join('+'));
        }
      }
    };

    serializeTypeWithNamespace('hashtag', 't', 'ns');
    serializeTypeWithNamespace('mention', 'u', 'uns');

    const actions = updates.filter(item => item.type === 'action')
      .map(item => item.itemId ? `${item.value}${item.itemId}` : item.value)
      .join('+');
    if (actions) newParams.set('a', actions);

    const item = updates.find(item => item.type === 'item')?.value;
    if (item) newParams.set('item', item);

    setSearchParams(newParams, { replace: true });
    // Trigger fetch after updating params
    fetchResults();
  };

  // Add effect to fetch on mount and URL changes
  useEffect(() => {
    fetchResults();
  }, [searchParams]);

  return {
    queryState: parseParams(),
    updateQueryState: updateParams
  };
};

const useSpotifyStatus = () => {
  const { data, error, mutate } = useSWR('/api/spotify/status', async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch Spotify status');
    return res.json();
  });

  return {
    isConnected: data?.connected ?? false,
    isLoading: !error && !data,
    error,
    mutate
  };
};

// UI Components
const PanelNav = ({ activePanel, setActivePanel }) => (
  <nav className="p-4 flex justify-center items-center">
    <div className="flex w-64 h-5 bg-gray-300">
      {[1, 2, 3].map(panel => (
        <button
          key={panel}
          onClick={() => setActivePanel(panel)}
          className={`flex-1 h-full transition-colors duration-200 ${activePanel === panel ? 'bg-blue-500' : 'bg-gray-300 hover:bg-gray-400'
            }`}
        />
      ))}
    </div>
  </nav>
);

// New shared header component
const HeaderWithPillbox = ({ searchQuery, setSearchQuery }) => {
  const { queryState, updateQueryState } = useQueryState();

  const formatTagDisplay = (item) => {
    if (item.type === 'action') return null;
    switch (item.type) {
      case 'hashtag':
        return `#${item.value}`;
      case 'mention':
        return `@${item.value}`;
      case 'item':
        return `item:${item.value}`;
      default:
        return item.value;
    }
  };

  return (
    <div className="p-4">
      <div className="mb-4">
        <div className="flex flex-wrap gap-2">
          {queryState.map((item, index) => {
            const display = formatTagDisplay(item);
            if (!display) return null;
            
            return (
              <span
                key={`${item.type}-${item.value}-${index}`}
                className="px-3 py-1 bg-blue-100 dark:bg-blue-900 rounded-full text-blue-800 dark:text-blue-200 flex items-center"
              >
                {display}
                <button
                  className="ml-2 text-blue-600 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-100"
                  onClick={() => {
                    const newQueryState = queryState.filter((_, idx) => idx !== index);
                    updateQueryState(newQueryState);
                  }}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// Update SearchPanel to use shared header

// Single source of truth for the button, with fixed width matching search bar
const ActionButton = ({ onClick, text, disabled }) => (
  <div className="p-4 md:col-span-1">
    <div className="flex items-center rounded p-2">
      <button 
        onClick={onClick}
        disabled={disabled}
        className={`w-full py-3 px-6 font-semibold rounded-lg transition-colors ${
          disabled 
            ? 'bg-gray-400 cursor-not-allowed text-gray-200' 
            : 'bg-blue-500 hover:bg-blue-600 text-white cursor-pointer'
        }`}
      >
        {text}
      </button>
    </div>
  </div>
);

// Update VoteComparisonView to use shared header
const VoteComparisonView = () => {
  const { queryState, updateQueryState } = useQueryState();
  const results = useStore(state => state.results);
  const items_by_id = useStore(state => state.items_by_id);  // Get items from store
  const [sliderValue, setSliderValue] = useState(50);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pair = results?.pair || [];
  const votes = results?.votes || [];

  // Format timestamp to readable date
  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return format(date);
  };

  if (pair.length !== 2) {
    return (
      <div className="min-h-screen p-4">
        <div className="text-center mt-8">
          <h2 className="text-xl font-bold mb-4">No more items to compare</h2>
        </div>
      </div>
    );
  }

  const [leftItem, rightItem] = pair;

  const renderItem = (item) => {
    if (item.domain_pk_namespace === "spotify.track") {
      return (
        <div className="flex justify-center">
          <iframe
            src={`https://open.spotify.com/embed/track/${item.domain_pk}`}
            width="300"
            height="380"
            allowtransparency="true"
            allow="encrypted-media"
          />
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center">
        <span className="text-lg font-medium">{item.title}</span>
        {item.body && (
          <div className="markdown-body">
            <MarkdownRenderer content={item.body} />
          </div>
        )}
      </div>
    );
  };

  const handleVote = async () => {
    setIsSubmitting(true);
    try {
      // Debug logging
      const results = useStore.getState().results;
      console.log('Current results:', results);
      console.log('Selected attribute:', results?.selected_attribute);
      
      const selectedAttributeId = results?.selected_attribute?.id;
      console.log('Selected attribute ID:', selectedAttributeId);
      
      if (selectedAttributeId === undefined || selectedAttributeId === null) {
        throw new Error('No attribute selected');
      }

      const response = await fetch('/api/vote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          left_item_id: leftItem.id,
          right_item_id: rightItem.id,
          magnitude: sliderValue,
          attribute: {
            id: selectedAttributeId
          }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to submit vote');
      }

      // Refresh the results to get the next pair
      const fetchResults = useStore.getState().fetchResults;
      await fetchResults();

      // Reset slider to middle position
      setSliderValue(50);
    } catch (error) {
      console.error('Error submitting vote:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4">
        <div className="mt-8">
          <h2 className="text-xl font-bold mb-8 text-center">Which is better?</h2>
          <div className="grid grid-cols-2 gap-8">
            <div>{renderItem(leftItem)}</div>
            <div>{renderItem(rightItem)}</div>
          </div>

          <div className="mt-8 flex flex-col items-center gap-4">
            <div className="w-full max-w-md flex items-center gap-4">
              <span className="text-sm font-medium">Left</span>
              <input
                type="range"
                min="0"
                max="100"
                value={sliderValue}
                onChange={(e) => setSliderValue(parseInt(e.target.value))}
                className="flex-grow h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-sm font-medium">Right</span>
            </div>
            
            <button
              onClick={handleVote}
              disabled={isSubmitting}
              className={`px-6 py-2 bg-blue-500 text-white rounded-lg transition-colors ${
                isSubmitting 
                  ? 'opacity-50 cursor-not-allowed' 
                  : 'hover:bg-blue-600'
              }`}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Vote'}
            </button>
          </div>
        </div>

        {/* Vote History Section with enhanced styling */}
        <div className="mt-12 mb-8">
          <h3 className="text-xl font-bold mb-6 text-gray-800">Vote History</h3>
          <div className="overflow-x-auto rounded-lg shadow">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Voter</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Left Item</th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Magnitude</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Right Item</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {votes.map((vote, index) => {
                  const leftItem = items_by_id[vote.left_item_id];
                  const rightItem = items_by_id[vote.right_item_id];
                  
                  return (
                    <tr key={index} className="hover:bg-gray-50 transition-colors duration-150">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(vote.edited_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {vote.owner}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {leftItem?.title || vote.left_item_id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                        <div className="flex items-center justify-center">
                          <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-blue-500 rounded-full transition-all duration-200"
                              style={{ width: `${vote.magnitude}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {rightItem?.title || vote.right_item_id}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

const VotingPanel = () => {
  const results = useStore(state => state.results);
  const { queryState, updateQueryState } = useQueryState();

  // Check if we're in voting mode
  const isVoting = queryState.some(tag => tag.type === 'action' && tag.value === 'vote');

  // If we're in voting mode, don't render the panel
  if (isVoting) {
    return null;
  }

  const getVoteStatus = () => {
    const allItems = [...(results?.sorted || []), ...(results?.unsorted || [])];
    
    if (!allItems || allItems.length === 0) {
      return { canVote: false, reason: "No items to vote on" };
    }
    if (allItems.length < 2) {
      return { canVote: false, reason: "Need at least 2 items to compare" };
    }
    if (!allItems.every((item, _, arr) => item.domain_pk_namespace === arr[0].domain_pk_namespace)) {
      return { canVote: false, reason: "Items must be of the same type to compare" };
    }
    return { canVote: true, reason: null };
  };

  const { canVote, reason } = getVoteStatus();

  return (
    <div>
      <ActionButton 
        text={canVote ? "Vote on these items" : reason}
        onClick={() => {
          if (canVote) {
            const voteAction = { type: 'action', value: 'vote' };
            updateQueryState([...queryState, voteAction]);
          }
        }}
        disabled={!canVote}
      />

      <div className="p-4">
        {results?.sorted?.length > 0 && (
          <>
            <div className="text-xl font-bold mb-4 mt-6">
              Sorted Items
            </div>
            <div className="space-y-2 mb-6">
              {results.sorted
                .sort((a, b) => b.elo - a.elo)
                .map(item => (
                  <div
                    key={item.id}
                    className="p-2 bg-gray-100 rounded flex justify-between items-center"
                  >
                    <span>{item.title}</span>
                    <span className="text-sm text-gray-500">
                      {Math.round(item.elo)}
                    </span>
                  </div>
                ))}
            </div>
          </>
        )}

        {results?.unsorted?.length > 0 && (
          <>
            <div className="text-xl font-bold mb-4">
              Unsorted Items
            </div>
            <div className="space-y-2">
              {results.unsorted.map(item => (
                <div
                  key={item.id}
                  className="p-2 bg-gray-200 rounded cursor-pointer hover:bg-gray-300"
                >
                  {item.title}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// Updated Main Component
export const Cli = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const { queryState, updateQueryState } = useQueryState();
  
  const isVoting = queryState.some(tag => tag.type === 'action' && tag.value === 'vote');

  return (
    <div className="min-h-screen">
      <div className="grid grid-cols-2 gap-4">
        {/* Top row */}
        <div className="p-4">
          <HeaderWithPillbox searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
          {!isVoting && (
            <div className="mt-4">
              <div className="flex items-center bg-gray-200 rounded p-2">
                <span className="mr-2">🔍</span>
                <input
                  type="text"
                  placeholder="search spotify/tags"
                  className="bg-transparent w-full outline-none"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <SearchResults searchQuery={searchQuery} />
            </div>
          )}
        </div>

        {/* Top right - Action buttons and voting panel */}
        <div className="p-4">
          {isVoting ? (
            <ActionButton 
              onClick={() => {
                const newQueryState = queryState.filter(item => item.type !== 'action' || item.value !== 'vote');
                updateQueryState(newQueryState);
              }}
              text="← Back to sorted list"
            />
          ) : (
            <VotingPanel />
          )}
        </div>
      </div>

      {/* Voting comparison view appears below when voting */}
      {isVoting && (
        <div className="mt-4">
          <VoteComparisonView />
        </div>
      )}
    </div>
  );
};

// Split SearchPanel into SearchResults component
const SearchResults = ({ searchQuery }) => {
  const { queryState, updateQueryState } = useQueryState();
  const setActivePanel = useStore(state => state.setActivePanel);

  const debouncedQuery = useRef(
    debounce((query) => {
      refetch();
    }, 300)
  ).current;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['search', searchQuery],
    queryFn: async () => {
      if (!searchQuery.trim()) return { suggestions: [] };
      const response = await fetch(`/api/spotify/search?q=${encodeURIComponent(searchQuery)}`);
      if (!response.ok) throw new Error('Failed to fetch search results');
      return response.json();
    },
    enabled: false,
    staleTime: 30000,
    cacheTime: 3600000,
  });

  const suggestions = data?.['search-results'] || {};
  const allResults = [
    ...(suggestions.artists || []).map(item => ({
      ...item,
      domain_pk_namespace: 'spotify.artist',
      tag: item.name,
      image: item.images?.[0]?.url,
      id: item.id
    })),
    ...(suggestions.albums || []).map(item => ({
      ...item,
      domain_pk_namespace: 'spotify.album',
      tag: item.name,
      image: item.images?.[0]?.url,
      id: item.id
    })),
    ...(suggestions.tracks || []).map(item => ({
      ...item,
      domain_pk_namespace: 'spotify.track',
      tag: item.name,
      image: item.album?.images?.[0]?.url,
      id: item.id
    }))
  ];

  useEffect(() => {
    debouncedQuery(searchQuery);
    return () => {
      debouncedQuery.cancel();
    };
  }, [searchQuery, debouncedQuery]);

  const handleTagClick = async (tag) => {
    const resolveSpotifyItem = async (tag) => {
      try {
        const response = await fetch('/api/spotify/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tag)
        });

        if (!response.ok) throw new Error('Failed to resolve Spotify item');
        const data = await response.json();
        return data;
      } catch (error) {
        console.error('Error resolving Spotify item:', error);
        return null;
      }
    };

    let newTag = tag;

    if (typeof tag !== 'string') {
      const resolvedItem = await resolveSpotifyItem(tag);
      if (!resolvedItem) return;

      if (resolvedItem['item-id']) {
        newTag = {
          type: 'item',
          value: resolvedItem['item-id'].toString()
        };
      } else {
        newTag = {
          type: tag.domain_pk_namespace.startsWith('spotify.') ? 'hashtag' : 'item',
          value: resolvedItem.slug || resolvedItem.tag,
          tagId: resolvedItem['tag-id'],
          namespace: tag.domain_pk_namespace,
          domain_pk: tag.domain_pk,
          domain_pk_namespace: tag.domain_pk_namespace
        };
      }
    } else {
      newTag = {
        type: 'hashtag',
        value: tag.replace('#', '')
      };
    }

    // Check for duplicates before adding
    const isDuplicate = queryState.some(existingTag => 
      existingTag.type === newTag.type && 
      existingTag.value === newTag.value &&
      existingTag.namespace === newTag.namespace &&
      existingTag.domain_pk === newTag.domain_pk &&
      existingTag.domain_pk_namespace === newTag.domain_pk_namespace
    );

    if (!isDuplicate) {
      updateQueryState([...queryState, newTag]);
      setActivePanel(2);
    }
  };

  return (
    <>
      <div className="mb-4">
        <div className="font-bold mb-2">tags that narrow this down:</div>
        <div className="space-y-1">
          {['hiphop', '2010s'].map(tag => (
            <div 
              key={tag}
              className="cursor-pointer hover:bg-gray-100 p-1"
              onClick={() => handleTagClick(tag)}
            >
              #{tag}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="font-bold mb-2">Search Results:</div>
        {isLoading ? (
          <div className="text-gray-500">Loading...</div>
        ) : (
          <div className="space-y-2">
            {allResults.map((result) => (
              <div
                key={result.id}
                className="cursor-pointer hover:bg-gray-100 p-2 rounded flex items-center"
                onClick={() => handleTagClick({
                  ...result,
                  domain_pk: result.id
                })}
              >
                {result.image && (
                  <img src={result.image} alt="" className="w-8 h-8 mr-2 rounded" />
                )}
                <span>{result.tag}</span>
                <span className="ml-2 text-sm text-gray-500">
                  ({result.domain_pk_namespace.split('.')[1]})
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default Cli;
