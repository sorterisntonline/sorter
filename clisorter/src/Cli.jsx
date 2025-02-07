import * as ohm from 'ohm-js';
import useSWR from "swr";
import { create } from "zustand";
import { useState, useEffect, useRef } from 'react';
import { VotePanel } from "./VotePanel";
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { VotesPanel } from './VotesPanel';
import { ItemPanel } from './ItemPanel';
import { current_session, fetchSession } from "./session";
import { redirectToLogin, redirectToRegister } from './authUtils';
import WarningPopup from './WarningPopup';
import { initiateOAuth } from './oauth/useOAuth';
import { SpotifyAuthButton } from './oauth/OAuthButton';

const SpotifyIcon = () => (
  <img
    width="18"
    className="m-1"
    src="https://upload.wikimedia.org/wikipedia/commons/1/19/Spotify_logo_without_text.svg"
    alt="Spotify"
  />
);

export const useStore = create((set, get) => ({
  results: null,
  magnitude: 50,
  items_by_id: {},
  tagData: null,
  setTagData: (data) => set({ tagData: data }),
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
  setMagnitude: (magnitude) => set({ magnitude }),
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
  spotifyConnected: false,
  setSpotifyConnected: (connected) => set({ spotifyConnected: connected }),
}));

const useQueryState = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  
  const parseParams = () => {
    const tags = searchParams.get('t')?.split('.').map(tag => ({ 
      type: 'hashtag', 
      value: tag 
    })) || [];
    const mentions = searchParams.get('u')?.split('.').map(mention => ({ 
      type: 'mention', 
      value: mention 
    })) || [];
    const actions = searchParams.get('a')?.split('.').map(action => {
      const match = action.match(/^(\w+)(\d+)?$/);
      return {
        type: 'action',
        value: match[1],
        itemId: match[2]
      };
    }) || [];
    const item = searchParams.get('item') ? [{
      type: 'item',
      value: searchParams.get('item')
    }] : [];

    return [...tags, ...mentions, ...actions, ...item];
  };

  const updateParams = (updates) => {
    const newParams = new URLSearchParams(searchParams);
    
    ['t', 'u', 'a', 'item'].forEach(param => newParams.delete(param));
    
    const tags = updates.filter(item => item.type === 'hashtag')
      .map(item => item.value).join('.');
    const mentions = updates.filter(item => item.type === 'mention')
      .map(item => item.value).join('.');
    const actions = updates.filter(item => item.type === 'action')
      .map(item => item.itemId ? `${item.value}${item.itemId}` : item.value)
      .join('.');
    const item = updates.find(item => item.type === 'item')?.value;

    if (tags) newParams.set('t', tags);
    if (mentions) newParams.set('u', mentions);
    if (actions) newParams.set('a', actions);
    if (item) newParams.set('item', item);

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

const TagSuggestion = ({ suggestion, onSelect }) => {
  const getIcon = () => {
    switch (suggestion.domain_pk_namespace) {
      case 'spotify.artist':
      case 'spotify.album':
      case 'spotify.track':
        return <SpotifyIcon />;
      default:
        return null;
    }
  };

  return (
    <div
      onClick={() => onSelect(suggestion)}
      className="flex items-center p-2 cursor-pointer hover:bg-red-400 transition-colors"
    >
      {getIcon()}
      <span className="ml-2 font-serif">#{suggestion.tag}</span>
      <span className="ml-2 text-sm text-gray-600">
        ({suggestion.domain_pk_namespace?.split('.')[1]})
      </span>
    </div>
  );
};

const TagCategories = () => {
  const { queryState, updateQueryState } = useQueryState();
  const [isExpanded, setIsExpanded] = useState(false);
  const { data, error, isLoading } = useSWR("/api/tag", fetcher);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const searchTimeoutRef = useRef(null);
  const { fetchResults } = useStore();
  const [showSpotifyPrompt, setShowSpotifyPrompt] = useState(false);
  const { isConnected: spotifyConnected, mutate: refreshSpotifyStatus } = useSpotifyStatus();

  useEffect(() => {
    if (hasInitialized) {
      fetchResults();
    }
  }, [hasInitialized]);

  useEffect(() => {
    if (!hasInitialized && !queryState.length && window.location.search === '') {
      const defaultTags = [
        { type: 'hashtag', value: 'kendrick-lamar' },
        { type: 'hashtag', value: 'albums' }
      ];
      updateQueryState(defaultTags);
      setHasInitialized(true);
    } else if (!hasInitialized) {
      setHasInitialized(true);
    }
  }, []);

  useEffect(() => {
    // Check if user has Spotify connected on component mount
    const checkSpotifyConnection = async () => {
      try {
        const response = await fetch('/api/spotify/status');
        const { connected } = await response.json();
        useStore.getState().setSpotifyConnected(connected);
      } catch (error) {
        console.error('Failed to check Spotify status:', error);
      }
    };
    checkSpotifyConnection();
  }, []);

  const selectedTags = queryState.filter(item => item.type === 'hashtag');

  const handleRemoveTag = (tagToRemove) => {
    const newState = queryState.filter(item => 
      !(item.type === 'hashtag' && item.value === tagToRemove)
    );
    updateQueryState(newState);
  };

  const handleTagClick = async (tag) => {
    const tagValue = tag.startsWith('#') ? tag.slice(1) : tag;
    const specialTags = ['songs', 'albums', 'artists'];
    
    if (specialTags.includes(tagValue)) {
      const newState = queryState.filter(item => 
        !(item.type === 'hashtag' && specialTags.includes(item.value))
      );
      updateQueryState([...newState, { type: 'hashtag', value: tagValue }]);
      fetchResults();
      return;
    }
    
    const hasTag = queryState.some(item => 
      item.type === 'hashtag' && item.value === tagValue
    );
    
    if (!hasTag) {
      const newState = [...queryState, { type: 'hashtag', value: tagValue }];
      updateQueryState(newState);
      const results = await fetchResults();
      
      if (!results?.sorted?.length && !results?.unsorted?.length) {
        updateQueryState([{ type: 'hashtag', value: tagValue }]);
        fetchResults();
      }
    }
  };

  const handleSearch = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    
    if (value.trim()) {
      setIsExpanded(true);
      
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      searchTimeoutRef.current = setTimeout(async () => {
        if (value.trim().length < 3) {  // Require at least 3 characters
          setSuggestions([]);
          setIsLoadingSuggestions(false);
          return;
        }

        setIsLoadingSuggestions(true);
        try {
          console.log('Fetching suggestions for:', value);
          const response = await fetch(`/api/tags/suggest?query=${encodeURIComponent(value)}`);
          
          if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
          }
          
          const data = await response.json();
          console.log('Suggestions response:', data);
          setSuggestions(data.suggestions || []);
        } catch (error) {
          console.error('Suggestion error:', error);
          setSuggestions([]);
        } finally {
          setIsLoadingSuggestions(false);
        }
      }, 800);  // Increased from 300ms to 800ms
    } else {
      setIsExpanded(false);
      setSuggestions([]);
      setIsLoadingSuggestions(false);
    }
  };

  const handleSuggestionSelect = (suggestion) => {
    handleTagClick(suggestion.tag);
    setSearchTerm('');
    setSuggestions([]);
    setIsLoadingSuggestions(false);
  };

  const handleMentionClick = (mention) => {
    const mentionValue = mention.startsWith('@') ? mention.slice(1) : mention;
    const existingMentions = queryState.filter(item => item.type === 'mention');
    
    if (existingMentions.length > 0) {
      const newState = queryState.map(item => {
        if (item === existingMentions[existingMentions.length - 1]) {
          return { type: 'mention', value: mentionValue };
        }
        return item;
      });
      updateQueryState(newState);
      return;
    }
    
    updateQueryState([...queryState, { type: 'mention', value: mentionValue }]);
  };

  const handleTagSearch = async (searchTerm) => {
    if (searchTerm.length < 2) {
      setSuggestions([]);
      return;
    }

    setIsLoadingSuggestions(true);
    try {
      const response = await fetch(`/api/tags/suggest?query=${encodeURIComponent(searchTerm)}`);
      if (response.status === 401) {
        if (!spotifyConnected) {
          setShowSpotifyPrompt(true);
          return;
        }
        // If we get 401 but we thought we were connected, refresh the status
        await refreshSpotifyStatus();
        return;
      }
      const data = await response.json();
      setSuggestions(data.suggestions);
    } catch (error) {
      console.error('Failed to fetch suggestions:', error);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  if (isLoading) return <div>Loading tags...</div>;
  if (error) return <div>Error loading tags</div>;

  return (
    <div className="flex flex-col gap-0">
      {/* Spotify Link - Now above the squares */}
      {current_session.value?.user_name && !spotifyConnected && (
        <div 
          onClick={() => initiateOAuth('spotify')}
          className="font-serif text-sm text-right text-gray-600 italic hover:underline cursor-pointer mb-2 mr-1"
        >
          link spotify account
        </div>
      )}
      
      {/* Squares Container */}
      <div className="flex flex-col md:flex-row max-w-[200px] md:max-w-none gap-0 justify-start">
        {/* Left panel - Selected Tags */}
        <div className="w-[200px] h-[200px] bg-gray-200 p-4 flex flex-col">
          <div className="space-y-2">
            {selectedTags.length === 0 ? (
              <div className="text-gray-500 italic">No tags selected</div>
            ) : (
              selectedTags.map((tag, index) => (
                <div 
                  key={index}
                  className="flex justify-between items-center"
                >
                  <div className="flex justify-start w-full">
                    <span className="font-serif text-lg text-left">#{tag.value}</span>
                    <button
                      onClick={() => handleRemoveTag(tag.value)}
                      className="text-gray-500 hover:text-red-500 ml-2"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Middle panel - Search and Suggestions */}
        <div className={`${
          isExpanded 
            ? 'w-[600px] h-[400px]' 
            : 'w-[200px] h-[200px]'
          } bg-red-300 p-0 flex flex-col transition-all duration-300`}>
          <div className="flex items-center bg-red-200">
            <input
              type="text"
              value={searchTerm}
              onChange={handleSearch}
              placeholder="Search or type to get suggestions..."
              className="flex-1 p-2 bg-red-200 focus:outline-none focus:border-red-500"
            />
            {isExpanded && (
              <button
                onClick={() => {
                  setIsExpanded(false);
                  setSearchTerm('');
                  setSuggestions([]);
                }}
                className="p-2 font-serif text-lg text-gray-600 hover:underline cursor-pointer"
              >
                less...
              </button>
            )}
          </div>
          <div className="space-y-2 overflow-y-auto p-4">
            {isLoadingSuggestions ? (
              <div className="text-center p-4 text-gray-600">Loading suggestions...</div>
            ) : suggestions.length > 0 ? (
              <div className="flex flex-col gap-2">
                {suggestions.map((suggestion, index) => (
                  <TagSuggestion
                    key={index}
                    suggestion={suggestion}
                    onSelect={handleSuggestionSelect}
                  />
                ))}
              </div>
            ) : isExpanded ? (
              <div className="grid grid-cols-2 gap-2">
                {data.public.map(tag => (
                  <div
                    key={tag.id}
                    onClick={() => handleTagClick('#' + tag.slug)}
                    className="font-serif text-md text-left hover:underline cursor-pointer"
                  >
                    #{tag.ns ? `${tag.ns}/${tag.slug}` : tag.slug}
                    <span className="text-sm text-gray-500 ml-2">
                      ({tag.item_count || 0})
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div
                  onClick={() => handleTagClick('songs')}
                  className="font-serif text-lg text-left hover:underline cursor-pointer"
                >
                  #songs
                </div>
                <div
                  onClick={() => handleTagClick('albums')}
                  className="font-serif text-lg text-left hover:underline cursor-pointer"
                >
                  #albums
                </div>
                <div
                  onClick={() => handleTagClick('artists')}
                  className="font-serif text-lg text-left hover:underline cursor-pointer"
                >
                  #artists
                </div>
                <button
                  onClick={() => {
                    setIsExpanded(!isExpanded);
                    setSearchTerm('');
                  }}
                  className="font-serif text-lg text-left hover:underline cursor-pointer text-gray-600"
                >
                  {isExpanded ? 'less...' : 'more...'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right panel - Commands */}
        {!isExpanded && (
          <div className="w-[200px] h-[200px] bg-red-400 p-4 flex flex-col">
            <div className="space-y-2">
              <div 
                onClick={() => handleMentionClick('@me')}
                className="font-serif text-lg text-left hover:underline cursor-pointer"
              >@me</div>
              <div 
                onClick={() => handleMentionClick('@all')}
                className="font-serif text-lg text-left hover:underline cursor-pointer"
              >@all</div>
            </div>
          </div>
        )}
      </div>

      {showSpotifyPrompt && !spotifyConnected && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl max-w-md">
            <h2 className="text-xl font-bold mb-4">Connect Spotify</h2>
            <p className="mb-6">
              To get music suggestions and create playlists, you'll need to connect your Spotify account.
            </p>
            <div className="flex justify-end gap-4">
              <button
                onClick={() => setShowSpotifyPrompt(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <SpotifyAuthButton />
            </div>
          </div>
        </div>
      )}

      {/* Add Spotify auth button if user is logged in but not connected */}
      {current_session.value?.user_name && (
        <SpotifyAuthButton className="absolute bottom-0 left-0 right-0 text-center p-2 bg-black bg-opacity-80 text-white hover:bg-opacity-90" />
      )}
    </div>
  );
};

const fetcher = (url) => fetch(url).then(res => res.json());

const HashtagItem = ({ value }) => {
  const { data, error, isLoading } = useSWR("/api/tag", fetcher);
  const { queryState, updateQueryState } = useQueryState();
  
  if (isLoading) return <h1> loading... </h1>;
  if (error) return <h1> error </h1>;

  const filtered = data.public.filter(tag => tag.slug.startsWith(value));
  if (filtered.length === 0) {
    return (
      <div 
        className="bg-yellow-100 w-full h-[100px] p-2 rounded flex items-center justify-center cursor-pointer"
        onClick={() => {
          updateQueryState([...queryState, { 
            type: 'action', 
            value: 'add',
            addValue: value 
          }]);
        }}
      >
        <span>Missing tag? Click to import new song/album/artist</span>
      </div>
    );
  }
  if (filtered.length === 1 && filtered[0].slug === value) return null;
  
  return (
    <table>
      <tbody className="flex flex-col">
        {filtered.map(tag => <tr key={tag.slug}><td>#{tag.slug}</td></tr>)}
      </tbody>
    </table>
  );
};

const MentionItem = ({ value }) => (
  <span className="px-2 py-1 rounded bg-green-100">
    {value}
  </span>
);

const ItemList = ({ items, onItemClick, isSorted }) => (
  <div className="mb-4 min-w-[600px]">
    <ol className={isSorted ? "list-decimal ml-4" : "list-disc ml-4"}>
      {items.map(item => (
        <li 
          key={item.id} 
          className="cursor-pointer text-left border-b border-dashed border-gray-200 dark:border-gray-800"
          onClick={() => onItemClick(item.id)}
          style={isSorted ? { backgroundColor: `rgba(255, 0, 0, ${item.elo ? item.elo / 8.0 : 0})` } : {}}
        >
          <div className="flex justify-between">
            <div>
              {isSorted && item.elo !== undefined && (
                <span className="px-4">{Math.round(item.elo * 100) / 100}</span>
              )}
              {item.title}
            </div>
            {item.vote_count && (
              <div className="text-gray-500">
                {item.num_comments > 0 && `${item.num_comments} comments `}
                {item.vote_count} votes
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  </div>
);

const GrammarDisplay = () => {
  const { queryState, updateQueryState } = useQueryState();
  const { results, fetchResults, items_by_id } = useStore();

  const handleItemClick = (itemId) => {
    const item = items_by_id[itemId];
    if (!item) return;

    const hasItem = queryState.some(q => 
      q.type === 'item' && q.value === itemId.toString()
    );

    if (hasItem) {
      const newState = queryState.filter(q => q.type !== 'item');
      updateQueryState(newState);
    } else {
      const newState = queryState.filter(q => q.type !== 'item');
      updateQueryState([...newState, {
        type: 'item',
        value: itemId.toString()
      }]);
    }
  };

  const selectedItemId = queryState.find(q => q.type === 'item')?.value;
  const selectedItem = selectedItemId ? items_by_id[parseInt(selectedItemId)] : null;
  const addCommand = queryState.some(q => q.type === 'action' && q.value === 'add');

  if (!queryState.length) {
    return null;
  }

  return (
    <div className="mt-4 flex flex-col items-center">
      {results && (
        <>
          <div className="w-[800px] bg-purple-100 m-4">
            <VotePanel mutate={fetchResults} />
          </div>
          <div className="w-[800px] bg-purple-100 m-4">
            <VotesPanel votes={results?.votes} mutate={fetchResults} />
          </div>
        </>
      )}

      <div className="w-[800px] m-4 flex">
        {selectedItem && (
          <div className="w-[400px] bg-red-100">
            <ItemPanel item={selectedItem} mutate={fetchResults} />
          </div>
        )}
        {results && (
          <div className={selectedItem ? 'ml-6' : 'w-[800px]'}>
            {results.unsorted?.length > 0 && (
              <div className="mb-8">
                <ItemList 
                  items={results.unsorted}
                  onItemClick={handleItemClick}
                  isSorted={false}
                />
              </div>
            )}

            {results.sorted?.length > 0 && (
              <div>
                <ItemList 
                  items={results.sorted}
                  onItemClick={handleItemClick}
                  isSorted={true}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {addCommand && (
        <div className="w-[800px] bg-green-100 m-4">
          <AddPanel addValue={addCommand.addValue} mutate={fetchResults} />
        </div>
      )}
    </div>
  );
};

export const Cli = () => {
  const [isTutorialVisible, setIsTutorialVisible] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('tutorialVisible');
    if (stored !== null) {
      setIsTutorialVisible(stored === 'true');
    }
  }, []);

  useEffect(() => {
    fetchSession();
  }, []);

  const toggleTutorial = () => {
    const newValue = !isTutorialVisible;
    setIsTutorialVisible(newValue);
    localStorage.setItem('tutorialVisible', newValue);
  };

  const handleError = (error) => {
    if (error.status === 401) {  // unauthorized
      setErrorMessage(error.message);
      setIsModalOpen(true);
    }
  };

  const AuthSection = () => {
    if (current_session.value && current_session.value.user_name) {
      return (
        <div
          className="fixed top-0 right-0 p-2 dark:text-white z-50 bg-white dark:bg-black bg-opacity-90"
        >
          logged in as {current_session.value.user_name}{" "}
          <button
            className="border-2 cursor-pointer px-2 hover:bg-gray-200 dark:hover:bg-gray-700"
            onClick={async () => {
              await fetch("/api/logout", {
                method: "POST",
                credentials: "include",
              });
              await fetchSession();
            }}
          >
            logout
          </button>
        </div>
      );
    }

    return (
      <div className="fixed top-0 right-0 p-2 space-x-2 z-50 bg-white dark:bg-black bg-opacity-90">
        <button
          className="border-2 cursor-pointer px-2 hover:bg-gray-200 dark:hover:bg-gray-700 dark:text-white"
          onClick={() => redirectToLogin()}
        >
          login
        </button>
        <button
          className="border-2 cursor-pointer px-2 hover:bg-gray-200 dark:hover:bg-gray-700 dark:text-white"
          onClick={() => redirectToRegister()}
        >
          register
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col">
      <AuthSection />
      <div className="font-serif">
        <div className="flex flex-col items-center mb-8">
          <p 
            className="text-left text-4xl max-w-[600px] min-w-[600px] font-bold mb-4 cursor-pointer hover:text-gray-700"
            onClick={toggleTutorial}
          >
            :) sorter
          </p>
          {isTutorialVisible && (
            <p 
              className="text-left max-w-[600px] text-gray-700 hover:text-gray-500 cursor-pointer transition-colors duration-100"
              onClick={toggleTutorial}
            >
              Type in the search box to get smart suggestions for music content. Click tags to find what you want to rank.
              <br/><br/>
              Click !vote to see two items at a time and pick your favorite.
              <br/><br/>
              Click @me to see your rankings, or @all to see what everyone thinks.
            </p>
          )}
        </div>
        <div className="flex flex-col md:flex-row max-w-[200px] md:max-w-none gap-0 justify-center">
          <TagCategories />
        </div>
        <GrammarDisplay />
      </div>
      <WarningPopup isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
        <div className="p-4">
          <h2 className="text-lg font-bold">login required</h2>
          <p>{errorMessage}</p>
        </div>
      </WarningPopup>
    </div>
  );
};
