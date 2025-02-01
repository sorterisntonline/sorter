import * as ohm from 'ohm-js';
import useSWR from "swr";
import { create } from "zustand";
import { useState, useEffect } from 'react';
import { VotePanel } from "./VotePanel";
import { useSearchParams, useNavigate } from 'react-router-dom';
import { VotesPanel } from './VotesPanel';
import { ItemPanel } from './ItemPanel';

// TODO make /item command pop up when you click on an item

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
  }
}));

// New hook to parse URL into structured data
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
    
    // Clear existing params
    ['t', 'u', 'a', 'item'].forEach(param => newParams.delete(param));
    
    // Group and set new params
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

const TagCategories = () => {
  const { queryState, updateQueryState } = useQueryState();
  const [isExpanded, setIsExpanded] = useState(false);
  const { data, error, isLoading } = useSWR("/api/tag", fetcher);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const { fetchResults } = useStore();

 // Add this useEffect for initial fetch
 useEffect(() => {
    if (hasInitialized) {
      fetchResults();
    }
  }, [hasInitialized]);

  // Modified useEffect to only set default tags on first mount
  useEffect(() => {
    console.log('queryState', queryState);
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
  }, []);  // Only run on mount

  // Get currently selected tags from queryState
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
    
    // If it's a special tag, replace any existing special tags
    if (specialTags.includes(tagValue)) {
      const newState = queryState.filter(item => 
        !(item.type === 'hashtag' && specialTags.includes(item.value))
      );
      updateQueryState([...newState, { type: 'hashtag', value: tagValue }]);
      fetchResults();
      return;
    }
    
    // For non-special tags, try adding to existing tags
    const hasTag = queryState.some(item => 
      item.type === 'hashtag' && item.value === tagValue
    );
    
    if (!hasTag) {
      const newState = [...queryState, { type: 'hashtag', value: tagValue }];
      
      // Update URL and fetch results
      updateQueryState(newState);
      const results = await fetchResults();
      
      // If no results, make this tag the only selected tag
      if (!results?.sorted?.length && !results?.unsorted?.length) {
        updateQueryState([{ type: 'hashtag', value: tagValue }]);
        fetchResults();
      }
    }
  };

  const handleVoteClick = () => {
    const hasVote = queryState.some(item => 
      item.type === 'action' && item.value === 'vote'
    );
    
    if (hasVote) {
      const newState = queryState.filter(item => 
        !(item.type === 'action' && item.value === 'vote')
      );
      updateQueryState(newState);
      return;
    }
    
    updateQueryState([...queryState, { type: 'action', value: 'vote' }]);
  };

  const handleVotesClick = () => {
    const hasVotes = queryState.some(item => 
      item.type === 'action' && item.value === 'votes'
    );
    
    if (hasVotes) {
      const newState = queryState.filter(item => 
        !(item.type === 'action' && item.value === 'votes')
      );
      updateQueryState(newState);
      return;
    }
    
    updateQueryState([...queryState, { type: 'action', value: 'votes' }]);
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

  // Add new function to handle search
  const handleSearch = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    if (value) {
      setIsExpanded(true);
    } else {
      setIsExpanded(false);
    }
  };

  if (isLoading) return <div>Loading tags...</div>;
  if (error) return <div>Error loading tags</div>;

  // Flatten tags and add namespace prefix
  const flattenedTags = data?.public.map(tag => ({
    ...tag,
    displaySlug: tag.ns ? `${tag.ns}/${tag.slug}` : tag.slug
  }))
  .sort((a, b) => (b.item_count || 0) - (a.item_count || 0)) || [];

  // Filter tags based on search term
  const filteredTags = flattenedTags?.filter(tag => 
    tag.displaySlug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
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

      {/* Middle panel - All Tags */}
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
            placeholder=""
            className="flex-1 p-2 bg-red-200 focus:outline-none focus:border-red-500"
          />
          {isExpanded && (
            <button
              onClick={() => {
                setIsExpanded(false);
                setSearchTerm('');
              }}
              className="p-2 font-serif text-lg text-gray-600 hover:underline cursor-pointer"
            >
              less...
            </button>
          )}
        </div>
        <div className="space-y-2 overflow-y-auto p-4">
          {isExpanded ? (
            <div className="grid grid-cols-2 gap-2">
              {filteredTags.map(tag => (
                <div
                  key={tag.id}
                  onClick={() => handleTagClick('#' + tag.slug)}
                  className="font-serif text-md text-left hover:underline cursor-pointer"
                >
                  #{tag.displaySlug}
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
}

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

    // Check if this item is already selected
    const hasItem = queryState.some(q => 
      q.type === 'item' && q.value === itemId.toString()
    );

    if (hasItem) {
      // Remove the item if it exists
      const newState = queryState.filter(q => q.type !== 'item');
      updateQueryState(newState);
    } else {
      // Add or replace item
      const newState = queryState.filter(q => q.type !== 'item');
      updateQueryState([...newState, {
        type: 'item',
        value: itemId.toString()
      }]);
    }
  };

  // Get selected item from query state
  const selectedItemId = queryState.find(q => q.type === 'item')?.value;
  const selectedItem = selectedItemId ? items_by_id[parseInt(selectedItemId)] : null;

  // Get active commands (vote/votes)
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

  useEffect(() => {
    const stored = localStorage.getItem('tutorialVisible');
    if (stored !== null) {
      setIsTutorialVisible(stored === 'true');
    }
  }, []);

  const toggleTutorial = () => {
    const newValue = !isTutorialVisible;
    setIsTutorialVisible(newValue);
    localStorage.setItem('tutorialVisible', newValue);
  };

  return (
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
            Click the tags below to find what you want to rank. oairestn aoirestn aoirestn aorisetn aroisetn arosietn aorstien 
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
  );
}
