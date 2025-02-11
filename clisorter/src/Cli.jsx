import * as ohm from 'ohm-js';
import useSWR from "swr";
import { create } from "zustand";
import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import debounce from 'lodash/debounce';  // For debouncing
import { useQuery } from '@tanstack/react-query';

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

const SearchPanel = ({ searchQuery, setSearchQuery }) => {
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
      setSearchQuery(''); // Clear the search input
      setActivePanel(2);
    }
  };

  const formatTagDisplay = (item) => {
    // Don't display action tags in the pillbox
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
            if (!display) return null; // Skip rendering if formatTagDisplay returns null
            
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
      
      <div className="mb-4">
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
      </div>

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

      {/* Updated search results section */}
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
    </div>
  );
};

const RankingPanel = () => {
  const { queryState, updateQueryState } = useQueryState();

  const formatTagDisplay = (item) => {
    switch (item.type) {
      case 'hashtag':
        return `#${item.value}`;
      case 'mention':
        return `@${item.value}`;
      case 'action':
        return `${item.value}${item.itemId ? ` ${item.itemId}` : ''}`;
      case 'item':
        return `item:${item.value}`;
      default:
        return item.value;
    }
  };

  const handleRemoveTag = (indexToRemove) => {
    const newQueryState = queryState.filter((_, index) => index !== indexToRemove);
    updateQueryState(newQueryState);
  };

  return (
    <div className="panel-content p-6 bg-white dark:bg-gray-800">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h3 className="text-sm uppercase text-gray-500 dark:text-gray-400 mb-2">Selected Tags</h3>
          <div className="flex flex-wrap gap-2">
            {queryState.map((item, index) => (
              <span
                key={`${item.type}-${item.value}-${index}`}
                className="px-3 py-1 bg-blue-100 dark:bg-blue-900 rounded-full text-blue-800 dark:text-blue-200 flex items-center"
              >
                {formatTagDisplay(item)}
                <button
                  className="ml-2 hover:text-blue-600"
                  onClick={() => handleRemoveTag(index)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm uppercase text-gray-500 dark:text-gray-400 mb-3">Current Rankings</h3>
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="p-3 border rounded-lg flex items-center">
                  <span className="mr-3 text-gray-400">{i}.</span>
                  <span>Item {i}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm uppercase text-gray-500 dark:text-gray-400 mb-3">Suggested Tags</h3>
            <div className="flex flex-wrap gap-2">
              {['#west-coast', '#conscious', '#grammy-winner'].map(tag => (
                <span key={tag} className="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-sm cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const VotingPanel = () => {
  const results = useStore(state => state.results);
  const { queryState, updateQueryState } = useQueryState();

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

  const handleVoteClick = () => {
    console.log('Transitioning to voting panel...');
    const voteAction = { type: 'action', value: 'vote' };
    updateQueryState([...queryState, voteAction]);
  };

  return (
    <div className="p-4">
      <button
        onClick={handleVoteClick}
        disabled={!canVote}
        className={`w-full mb-6 py-3 px-6 font-semibold rounded-lg transition-colors
          ${canVote 
            ? 'bg-blue-500 hover:bg-blue-600 text-white cursor-pointer' 
            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
      >
        {canVote ? 'Vote on these items' : reason}
      </button>

      {results?.sorted?.length > 0 && (
        <>
          <div className="text-xl font-bold mb-4">
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
  );
};

// New ItemView Component
const ItemView = ({ itemId }) => {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Item Details: {itemId}</h1>
      <div className="bg-gray-100 p-4 rounded">
        <p>Placeholder for item-specific content</p>
      </div>
    </div>
  );
};

// New VoteComparisonView component
const VoteComparisonView = () => {
  const { queryState, updateQueryState } = useQueryState();

  const handleBack = () => {
    const newQueryState = queryState.filter(tag => !(tag.type === 'action' && tag.value === 'vote'));
    updateQueryState(newQueryState);
  };

  return (
    <div className="min-h-screen">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SearchPanel searchQuery="" setSearchQuery={() => {}} />
        <div className="p-4">
          <button 
            onClick={handleBack}
            className="w-full mb-6 py-3 px-6 font-semibold rounded-lg transition-colors bg-blue-500 hover:bg-blue-600 text-white cursor-pointer"
          >
            ← Back to list
          </button>

          <div className="mt-8">
            <h2 className="text-xl font-bold mb-4">Which is better?</h2>
            <div className="grid grid-cols-2 gap-4">
              <button className="p-8 bg-gray-100 rounded-lg hover:bg-gray-200">
                Item 1
              </button>
              <button className="p-8 bg-gray-100 rounded-lg hover:bg-gray-200">
                Item 2
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Updated Main Component
export const Cli = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const { queryState } = useQueryState();
  
  // Check if we're in voting mode
  const isVoting = queryState.some(tag => tag.type === 'action' && tag.value === 'vote');
  // Check if we have an item in the query state
  const itemTag = queryState.find(tag => tag.type === 'item');

  if (isVoting) {
    return <VoteComparisonView />;
  }

  if (itemTag) {
    return <ItemView itemId={itemTag.value} />;
  }

  return (
    <div className="min-h-screen">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SearchPanel searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
        <VotingPanel />
      </div>
    </div>
  );
};

export default Cli;
