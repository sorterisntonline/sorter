import useSWR from "swr";
import { create } from "zustand";
import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import debounce from 'lodash/debounce';  // For debouncing
import { useQuery } from '@tanstack/react-query';
import { format } from 'timeago.js';

import { ItemPanel } from './ItemPanel';
import { current_session, useSession, isLoggedIn } from "./session";
import { initiateOAuth } from './oauth/useOAuth';
import { SessionProvider } from './session';

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
  advancedMode: false,
  selectedItem: null,

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

      // If results are empty and there are multiple tags, remove the leftmost one
      if ((!data?.sorted?.length && !data?.unsorted?.length) && params.toString()) {
        const searchParams = new URLSearchParams(window.location.search);
        const currentTags = [];
        
        // Collect all current tags
        ['t', 'u'].forEach(param => {
          const values = searchParams.get(param)?.split('+') || [];
          const namespaces = searchParams.get(param === 't' ? 'ns' : 'uns')?.split('+') || [];
          values.forEach((value, i) => {
            currentTags.push({
              type: param === 't' ? 'hashtag' : 'mention',
              value,
              namespace: namespaces[i] || null
            });
          });
        });

        // Add actions and items
        const actions = searchParams.get('a')?.split('+').map(action => {
          const match = action.match(/^(\w+)(\d+)?$/);
          return { type: 'action', value: match[1], itemId: match[2] };
        }) || [];
        const item = searchParams.get('item') ? [{ type: 'item', value: searchParams.get('item') }] : [];
        currentTags.push(...actions, ...item);

        // If we have multiple tags, remove the leftmost one
        if (currentTags.length > 1) {
          const newTags = currentTags.slice(1);
          // Use the existing updateQueryState function from the closest useQueryState
          window.dispatchEvent(new CustomEvent('updateQueryState', { detail: newTags }));
        }
      }

      return data;
    } catch (error) {
      console.error('Failed to fetch results:', error);
      get().setResults(null);
      return null;
    }
  },

  setSpotifyConnected: (connected) => set({ spotifyConnected: connected }),
  setActivePanel: (panel) => set({ activePanel: panel }),
  setAdvancedMode: (enabled) => set({ advancedMode: enabled }),
  setSelectedItem: (item) => set({ selectedItem: item }),
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
    // Fetch results after updating the URL
    fetchResults();
  };

  // Keep only the mount effect
  useEffect(() => {
    fetchResults();
  }, []);

  return {
    queryState: parseParams(),
    updateQueryState: updateParams
  };
};

// New shared header component
const HeaderWithPillbox = ({ searchQuery, setSearchQuery, queryState }) => {
  const { queryState: state, updateQueryState } = queryState;

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
          {state.map((item, index) => {
            const display = formatTagDisplay(item);
            if (!display) return null;
            
            return (
              <span
                key={`${item.type}-${item.value}-${index}`}
                className="px-3 py-1 bg-red-100 dark:bg-red-900 rounded-full text-red-800 dark:text-red-200 flex items-center"
              >
                {display}
                <button
                  className="ml-2 text-red-600 hover:text-red-800 dark:text-red-300 dark:hover:text-red-100"
                  onClick={() => {
                    const newQueryState = state.filter((_, idx) => idx !== index);
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
            : 'bg-red-500 hover:bg-red-600 text-white cursor-pointer'
        }`}
      >
        {text}
      </button>
    </div>
  </div>
);

// Update VoteComparisonView to use useSession
const VoteComparisonView = ({ queryState }) => {
  const { queryState: state, updateQueryState } = queryState;
  const results = useStore(state => state.results);
  const items_by_id = useStore(state => state.items_by_id);
  const [sliderValue, setSliderValue] = useState(50);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const { session } = useSession();
  const isLoggedIn = Boolean(session?.user_name);

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
                className="vote-slider flex-grow"
              />
              <span className="text-sm font-medium">Right</span>
            </div>
            
            <button
              onClick={() => {
                if (!isLoggedIn) {
                  // Encode the current URL state to return here after login
                  const currentPath = window.location.pathname + window.location.search;
                  const nonActionTags = state.filter(tag => 
                    tag.type !== 'action' || 
                    (tag.value !== 'vote' && tag.value !== 'login')
                  );
                  const loginAction = { type: 'action', value: 'login' };
                  updateQueryState([...nonActionTags, loginAction]);
                  // Redirect to Spotify auth with return path
                  window.location.href = `/api/spotify/auth?redirect=${encodeURIComponent(currentPath)}`;
                } else {
                  handleVote();
                }
              }}
              disabled={isSubmitting}
              className={`flex items-center gap-2 px-6 py-2 bg-red-500 text-white rounded-lg transition-colors ${
                isSubmitting 
                  ? 'opacity-50 cursor-not-allowed' 
                  : 'hover:bg-red-600'
              }`}
            >
              {isSubmitting ? (
                'Submitting...'
              ) : !isLoggedIn ? (
                <>
                  <SpotifyIcon />
                  Login with Spotify to Vote
                </>
              ) : (
                'Submit Vote'
              )}
            </button>
          </div>
        </div>

        {/* Vote History Section with vote count */}
        <div className="mt-12 mb-8">
          <h3 className="text-xl font-bold mb-6 text-gray-800">
            Vote History {votes.length > 0 && `(${votes.length} votes)`}
          </h3>
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
                              className="h-full bg-red-500 rounded-full transition-all duration-200"
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

const VotingPanel = ({ queryState }) => {
  const { queryState: state, updateQueryState } = queryState;
  const results = useStore(state => state.results);

  // Calculate min and max ELO for color scaling
  const getEloColor = (elo, minElo, maxElo) => {
    // Normalize ELO to 0-1 range
    const normalized = (elo - minElo) / (maxElo - minElo);
    // Use a gradient from light red to dark red
    const hue = 0; // Red hue
    const saturation = 90;
    const lightness = 95 - (normalized * 20); // Lighter red (95%) to darker red (75%)
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  };

  // Check if we're in voting mode
  const isVoting = state.some(tag => tag.type === 'action' && tag.value === 'vote');

  // If we're in voting mode, don't render the panel
  if (isVoting) {
    return null;
  }

  const getVoteStatus = () => {
    const allItems = [...(results?.sorted || []), ...(results?.unsorted || [])];
    const voteCount = results?.votes?.length || 0;  // Get the vote count
    
    if (!allItems || allItems.length === 0) {
      return { canVote: false, reason: "No items to vote on", voteCount };
    }
    if (allItems.length < 2) {
      return { canVote: false, reason: "Need at least 2 items to compare", voteCount };
    }
    if (!allItems.every((item, _, arr) => item.domain_pk_namespace === arr[0].domain_pk_namespace)) {
      return { canVote: false, reason: "Items must be of the same type to compare", voteCount };
    }
    return { canVote: true, reason: null, voteCount };
  };

  const { canVote, reason, voteCount } = getVoteStatus();

  // Calculate min and max ELO scores
  const sortedItems = results?.sorted || [];
  const minElo = Math.min(...sortedItems.map(item => item.elo));
  const maxElo = Math.max(...sortedItems.map(item => item.elo));

  const handleItemClick = (item) => {
    // Replace existing state with just the item tag
    const nonItemTags = state.filter(tag => tag.type !== 'item');
    const itemTag = { type: 'item', value: item.id };
    updateQueryState([...nonItemTags, itemTag]);
  };

  return (
    <div>
      <ActionButton 
        text={canVote 
          ? `Vote on these items${voteCount ? ` (${voteCount} votes)` : ''}`
          : reason}
        onClick={() => {
          if (canVote) {
            const nonItemTags = state.filter(tag => tag.type !== 'item');
            const voteAction = { type: 'action', value: 'vote' };
            updateQueryState([...nonItemTags, voteAction]);
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
                    className="p-2 rounded flex justify-between items-center cursor-pointer hover:bg-gray-300"
                    style={{ backgroundColor: getEloColor(item.elo, minElo, maxElo) }}
                    onClick={() => handleItemClick(item)}
                  >
                    <span>{item.title}</span>
                    <span className="text-sm text-gray-600">
                      {item.elo.toFixed(2)}
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
                  onClick={() => handleItemClick(item)}
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

// Remove standalone ModeToggle component and combine with UserMenu
const UserMenu = () => {
  const { session, isLoading } = useSession();
  const advancedMode = useStore(state => state.advancedMode);
  const setAdvancedMode = useStore(state => state.setAdvancedMode);
  
  return (
    <div className="absolute top-4 right-4 flex items-center gap-6">
      <label className="flex items-center cursor-pointer">
        <input
          type="checkbox"
          checked={advancedMode}
          onChange={(e) => setAdvancedMode(e.target.checked)}
          className="sr-only peer"
        />
        <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
        <span className="ml-3 text-sm font-medium">Advanced Mode</span>
      </label>
      
      {!isLoading && session?.user_name && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">
            {session.user_name}
          </span>
          <LogoutButton />
        </div>
      )}
    </div>
  );
};

// Add LogoutButton component
const LogoutButton = () => {
  const { refetchSession } = useSession();

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/logout', {
        method: 'POST',
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Logout failed');
      }
      
      // Refresh session state after logout
      await refetchSession();
      
      // Refresh the page to clear any cached state
      window.location.reload();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <button
      onClick={handleLogout}
      className="text-gray-600 hover:text-gray-800"
    >
      Logout
    </button>
  );
};

// Updated Main Componet
export const Cli = () => {
  return (
    <SessionProvider>
      <CliContent />
    </SessionProvider>
  );
};

// Update CliContent to add padding at the top
const CliContent = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const queryState = useQueryState();
  const advancedMode = useStore(state => state.advancedMode);
  const selectedItem = useStore(state => state.selectedItem);
  const setSelectedItem = useStore(state => state.setSelectedItem);
  const items_by_id = useStore(state => state.items_by_id);
  
  const isVoting = queryState.queryState.some(tag => tag.type === 'action' && tag.value === 'vote');
  const isLoggingIn = queryState.queryState.some(tag => tag.type === 'action' && tag.value === 'login');

  // Effect to handle item parameter in URL
  useEffect(() => {
    const itemId = queryState.queryState.find(tag => tag.type === 'item')?.value;
    if (itemId && items_by_id[itemId]) {
      setSelectedItem(items_by_id[itemId]);
    } else {
      setSelectedItem(null);
    }
  }, [queryState.queryState, items_by_id]);

  // Add login view rendering
  if (isLoggingIn) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-6">Login Required</h2>
          <div className="flex flex-col items-center gap-4">
            <button
              onClick={() => initiateOAuth('spotify')}
              className="flex items-center gap-2 px-8 py-3 bg-[#1DB954] text-white font-semibold rounded-full hover:bg-[#1ed760] transition-colors"
            >
              <img
                src={SPOTIFY_LOGO_URL}
                alt="Spotify"
                className="w-6 h-6"
              />
              Continue with Spotify
            </button>
            <button
              onClick={() => {
                const newQueryState = queryState.queryState.filter(tag => 
                  tag.type !== 'action' || tag.value !== 'login'
                );
                queryState.updateQueryState(newQueryState);
              }}
              className="text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative">
      <UserMenu />
      <div className="grid grid-cols-2 gap-4 pt-16">
        {/* Left panel */}
        <div className="p-4">
          <HeaderWithPillbox 
            searchQuery={searchQuery} 
            setSearchQuery={setSearchQuery}
            queryState={queryState}
          />
          {selectedItem ? (
            <div>
              <ActionButton 
                text="← Back to search"
                onClick={() => {
                  const newQueryState = queryState.queryState.filter(tag => tag.type !== 'item');
                  queryState.updateQueryState(newQueryState);
                }}
              />
              <ItemPanel item={selectedItem} />
            </div>
          ) : (
            !isVoting && (
              <div className="mt-4">
                <div className="flex items-center bg-gray-200 rounded p-2">
                  <span className="mr-2">🔍</span>
                  <input
                    type="text"
                    placeholder={advancedMode ? "search spotify tracks/artists/albums/tags" : "search spotify albums"}
                    className="bg-transparent w-full outline-none"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <SearchResults searchQuery={searchQuery} queryState={queryState} />
              </div>
            )
          )}
        </div>

        {/* Right panel */}
        <div>
          {isVoting ? (
            <ActionButton 
              onClick={() => {
                const newQueryState = queryState.queryState.filter(item => 
                  item.type !== 'action' || item.value !== 'vote'
                );
                queryState.updateQueryState(newQueryState);
              }}
              text="← Back to sorted list"
            />
          ) : (
            <VotingPanel queryState={queryState} />
          )}
        </div>
      </div>

      {/* Voting comparison view */}
      {isVoting && (
        <div className="mt-4">
          <VoteComparisonView queryState={queryState} />
        </div>
      )}
    </div>
  );
};

// Split SearchPanel into SearchResults component
const SearchResults = ({ searchQuery, queryState }) => {
  const { queryState: state, updateQueryState } = queryState;
  const setActivePanel = useStore(state => state.setActivePanel);
  const advancedMode = useStore(state => state.advancedMode);

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
    ...(advancedMode ? (suggestions.artists || []).map(item => ({
      ...item,
      domain_pk_namespace: 'spotify.artist',
      tag: item.name,
      image: item.images?.[0]?.url,
      id: item.id
    })) : []),
    ...(suggestions.albums || []).map(item => ({
      ...item,
      domain_pk_namespace: 'spotify.album',
      tag: item.name,
      image: item.images?.[0]?.url,
      id: item.id
    })),
    ...(advancedMode ? (suggestions.tracks || []).map(item => ({
      ...item,
      domain_pk_namespace: 'spotify.track',
      tag: item.name,
      image: item.album?.images?.[0]?.url,
      id: item.id
    })) : [])
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

    // In non-advanced mode, replace all query params when clicking an album
    if (!advancedMode && tag.domain_pk_namespace === 'spotify.album') {
      updateQueryState([newTag]);
    } else {
      // Check for duplicates before adding
      const isDuplicate = state.some(existingTag => 
        existingTag.type === newTag.type && 
        existingTag.value === newTag.value &&
        existingTag.namespace === newTag.namespace &&
        existingTag.domain_pk === newTag.domain_pk &&
        existingTag.domain_pk_namespace === newTag.domain_pk_namespace
      );

      if (!isDuplicate) {
        updateQueryState([...state, newTag]);
      }
    }
    setActivePanel(2);
  };

  return (
    <>
      {advancedMode && (
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
      )}

      <div>
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
