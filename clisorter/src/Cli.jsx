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
    if (!params.has('t')) {
      set({ results: null });
      return null;
    }

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

  const parseParams = () => {
    const parseType = (param, type) => searchParams.get(param)?.split('.').map(value => ({ type, value })) || [];
    const parseActions = () => searchParams.get('a')?.split('.').map(action => {
      const match = action.match(/^(\w+)(\d+)?$/);
      return { type: 'action', value: match[1], itemId: match[2] };
    }) || [];
    const parseItem = () => searchParams.get('item') ? [{ type: 'item', value: searchParams.get('item') }] : [];

    return [
      ...parseType('t', 'hashtag'),
      ...parseType('u', 'mention'),
      ...parseActions(),
      ...parseItem()
    ];
  };

  const updateParams = (updates) => {
    const newParams = new URLSearchParams();

    const serializeType = (type) => updates.filter(item => item.type === type).map(item => item.value).join('.');
    const serializeActions = () => updates.filter(item => item.type === 'action').map(item => item.itemId ? `${item.value}${item.itemId}` : item.value).join('.');
    const serializeItem = () => updates.find(item => item.type === 'item')?.value;

    const params = {
      't': serializeType('hashtag'),
      'u': serializeType('mention'),
      'a': serializeActions(),
      'item': serializeItem()
    };

    Object.entries(params).forEach(([key, value]) => {
      if (value) newParams.set(key, value);
    });

    setSearchParams(newParams, { replace: true });
  };

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
          body: JSON.stringify({
            domain_pk: tag.domain_pk,
            domain_pk_namespace: tag.domain_pk_namespace,
            metadata: { name: tag.tag, image: tag.image }
          })
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

      newTag = {
        type: tag.domain_pk_namespace.startsWith('spotify.') ? 'hashtag' : 'item',
        value: resolvedItem.tag,
        domain_pk: tag.domain_pk,
        domain_pk_namespace: tag.domain_pk_namespace
      };
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

  return (
    <div className="p-4">
      <div className="mb-4">
        <div className="flex flex-wrap gap-2">
          {queryState.map((item, index) => (
            <span
              key={`${item.type}-${item.value}-${index}`}
              className="px-3 py-1 bg-blue-100 dark:bg-blue-900 rounded-full text-blue-800 dark:text-blue-200 flex items-center"
            >
              {formatTagDisplay(item)}
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
          ))}
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

const VotingPanel = () => (
  <div className="p-4">
    <div className="text-xl font-bold mb-4">
      press here to vote
    </div>
    
    <div className="space-y-2">
      {[
        'HUMBLE.',
        'Not Like Us',
        'euphoria',
        "Fuckin' Problems",
        'm.A.A.d city',
        'Swimming Pools (Drank)'
      ].map(song => (
        <div
          key={song}
          className="p-2 bg-gray-200 rounded cursor-pointer hover:bg-gray-300"
        >
          {song}
        </div>
      ))}
    </div>
  </div>
);

// Main Component
export const Cli = () => {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="min-h-screen">
      <div className="grid grid-cols-2 gap-4">
        <SearchPanel searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
        <VotingPanel />
      </div>
    </div>
  );
};

export default Cli;
