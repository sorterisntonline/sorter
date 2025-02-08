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
