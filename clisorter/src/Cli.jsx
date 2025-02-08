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
  items_by_id: {},
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

const PanelNav = ({ activePanel, setActivePanel }) => {
  return (
    <nav className="p-4 flex justify-center items-center">
      <div className="flex w-64 h-5 bg-gray-300">
        {[1, 2, 3].map(panel => (
          <button 
            key={panel}
            onClick={() => setActivePanel(panel)}
            className={`flex-1 h-full transition-colors duration-200 ${
              activePanel === panel 
                ? 'bg-blue-500' 
                : 'bg-gray-300 hover:bg-gray-400'
            }`}
          />
        ))}
      </div>
    </nav>
  );
};

const SearchPanel = ({ searchQuery, setSearchQuery }) => {
  return (
    <div className="panel-content p-6 bg-white dark:bg-gray-800">
      <div className="max-w-2xl mx-auto">
        <input
          type="text"
          placeholder="Search for music, artists, or tags..."
          className="w-full p-4 text-lg border rounded-lg mb-6 dark:bg-gray-700 dark:text-white"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        
        <div className="space-y-4">
          <div className="border-b pb-2 dark:border-gray-600">
            <h3 className="text-sm uppercase text-gray-500 dark:text-gray-400">Popular Tags</h3>
            <div className="flex flex-wrap gap-2 mt-2">
              {['#hip-hop', '#2023', '#indie', '#rock', '#electronic'].map(tag => (
                <span key={tag} className="px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-sm cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm uppercase text-gray-500 dark:text-gray-400">Suggested Results</h3>
            <div className="space-y-2 mt-2">
              {['Kendrick Lamar', 'The Beatles', 'Taylor Swift'].map(result => (
                <div key={result} className="p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                  {result}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const RankingPanel = () => {
  return (
    <div className="panel-content p-6 bg-white dark:bg-gray-800">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h3 className="text-sm uppercase text-gray-500 dark:text-gray-400 mb-2">Selected Tags</h3>
          <div className="flex flex-wrap gap-2">
            {['#hip-hop', '#2020s'].map(tag => (
              <span key={tag} className="px-4 py-2 bg-blue-100 dark:bg-blue-900 rounded-full text-blue-800 dark:text-blue-200">
                {tag} ×
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
  return (
    <div className="panel-content p-6 bg-white dark:bg-gray-800">
      <div className="max-w-4xl mx-auto">
        <div className="grid md:grid-cols-2 gap-8">
          <div className="border rounded-lg p-4">
            <div className="aspect-square bg-gray-100 dark:bg-gray-700 rounded-lg mb-4"></div>
            <h3 className="text-lg font-semibold mb-2">Item A</h3>
            <p className="text-gray-600 dark:text-gray-400">Description for Item A</p>
          </div>

          <div className="border rounded-lg p-4">
            <div className="aspect-square bg-gray-100 dark:bg-gray-700 rounded-lg mb-4"></div>
            <h3 className="text-lg font-semibold mb-2">Item B</h3>
            <p className="text-gray-600 dark:text-gray-400">Description for Item B</p>
          </div>
        </div>

        <div className="mt-8 flex justify-center items-center space-x-4">
          <button className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
            Vote for A
          </button>
          <button className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">
            Skip
          </button>
          <button className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
            Vote for B
          </button>
        </div>
      </div>
    </div>
  );
};

export const Cli = () => {
  const [activePanel, setActivePanel] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
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

  const renderPanel = () => {
    switch (activePanel) {
      case 1:
        return <SearchPanel searchQuery={searchQuery} setSearchQuery={setSearchQuery} />;
      case 2:
        return <RankingPanel />;
      case 3:
        return <VotingPanel />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col dark:bg-gray-900 dark:text-white">
      <AuthSection />
      <PanelNav activePanel={activePanel} setActivePanel={setActivePanel} />
      <WarningPopup isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
        <div className="p-4">
          <h2 className="text-lg font-bold">login required</h2>
          <p>{errorMessage}</p>
        </div>
      </WarningPopup>
      <main className="flex-grow p-4">
        <div className="max-w-7xl mx-auto">
          {renderPanel()}
        </div>
      </main>
    </div>
  );
};

export default Cli;
