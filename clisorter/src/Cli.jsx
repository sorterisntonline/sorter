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
  csvData: [],
  results: null,
  magnitude: 50,
  items_by_id: {},
  tagData: null,
  setTagData: (data) => set({ tagData: data }),
  setCsvData: (csvData) => set({ csvData }),
  setResults: (results) => {
    const items_by_id = {};
    if (results) {
      if (results.unsorted) {
        results.unsorted.forEach(item => {
          items_by_id[item.id] = item;
        });
      }
      if (results.sorted) {
        results.sorted.forEach(item => {
          items_by_id[item.id] = item;
        });
      }
    }
    set({ results, items_by_id });
  },
  setMagnitude: (magnitude) => set({ magnitude }),
  fetchResults: async () => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('t')) {
      set({ results: null });
      return;
    }
    
    try {
      const response = await fetch(`/api/tag/page2?${params.toString()}`);
      const data = await response.json();
      get().setResults(data);
    } catch (error) {
      console.error('Failed to fetch results:', error);
      get().setResults(null);
    }
  },
  updateURL: (csvData) => {
    // Build query params from csvData
    const tags = csvData
      .filter(item => item.type === 'hashtag')
      .map(item => item.value)
      .join('.');
    const mentions = csvData
      .filter(item => item.type === 'mention')
      .map(item => item.value)
      .join('.');
    const actions = csvData
      .filter(item => item.type === 'action')
      .map(item => item.itemId 
        ? `${item.value}${item.itemId}`
        : item.value
      )
      .join('.');

    // Update URL params
    const params = new URLSearchParams();
    if (tags.length) params.set('t', tags);
    if (mentions.length) params.set('u', mentions);
    if (actions.length) params.set('a', actions);

    // Update URL without page reload
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
  }
}));

const TagCategories = () => {
  const { input, setInput, parseInput, csvData, parsedDataToString } = useStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const { data, error, isLoading } = useSWR("/api/tag", fetcher);

  useEffect(() => {
    if (data) {
      useStore.getState().setTagData(data);
    }
  }, [data]);

  const handleTagClick = (tag) => {
    const tagValue = tag.startsWith('#') ? tag.slice(1) : tag;
    
    if (csvData.length) {
      const existingHashtags = csvData.filter(item => item.type === 'hashtag');
      
      if (existingHashtags.length > 0) {
        const newCsvData = csvData.map(item => {
          if (item === existingHashtags[existingHashtags.length - 1]) {
            return { type: 'hashtag', value: tagValue };
          }
          return item;
        });
        
        const newInput = parsedDataToString(newCsvData);
        setInput(newInput);
        parseInput(newInput);
        return;
      }
    }
    
    const newInput = '#' + tagValue;
    setInput(newInput);
    parseInput(newInput);
  };

  const handleVoteClick = () => {
    if (csvData.length) {
      // Check if !vote already exists
      const hasVote = csvData.some(item => 
        item.type === 'action' && item.value === 'vote'
      );
      
      if (hasVote) {
        // Remove !vote if it exists
        const newCsvData = csvData.filter(item => 
          !(item.type === 'action' && item.value === 'vote')
        );
        const newInput = parsedDataToString(newCsvData);
        setInput(newInput);
        parseInput(newInput);
        return;
      }
    }
    
    // Add !vote if it doesn't exist
    const newCsvData = [...csvData, { type: 'action', value: 'vote' }];
    const newInput = parsedDataToString(newCsvData);
    setInput(newInput);
    parseInput(newInput);
  };

  const handleVotesClick = () => {
    if (csvData.length) {
      // Check if !votes already exists
      const hasVotes = csvData.some(item => 
        item.type === 'action' && item.value === 'votes'
      );
      
      if (hasVotes) {
        // Remove !votes if it exists
        const newCsvData = csvData.filter(item => 
          !(item.type === 'action' && item.value === 'votes')
        );
        const newInput = parsedDataToString(newCsvData);
        setInput(newInput);
        parseInput(newInput);
        return;
      }
    }
    
    // Add !votes if it doesn't exist
    const newCsvData = [...csvData, { type: 'action', value: 'votes' }];
    const newInput = parsedDataToString(newCsvData);
    setInput(newInput);
    parseInput(newInput);
  };

  const handleMentionClick = (mention) => {
    // Remove @ from the mention if present
    const mentionValue = mention.startsWith('@') ? mention.slice(1) : mention;
    
    if (csvData.length) {
      // Check if @mention already exists
      const existingMentions = csvData.filter(item => item.type === 'mention');
      
      if (existingMentions.length > 0) {
        // Replace the last mention
        const newCsvData = csvData.map(item => {
          if (item === existingMentions[existingMentions.length - 1]) {
            return { type: 'mention', value: mentionValue };
          }
          return item;
        });
        
        const newInput = parsedDataToString(newCsvData);
        setInput(newInput);
        parseInput(newInput);
        return;
      }
    }
    
    // Add new mention if none exists
    const newCsvData = [...csvData, { type: 'mention', value: mentionValue }];
    const newInput = parsedDataToString(newCsvData);
    setInput(newInput);
    parseInput(newInput);
  };

  if (isLoading) return <div>Loading tags...</div>;
  if (error) return <div>Error loading tags</div>;

  // Flatten tags and add namespace prefix
  const flattenedTags = data?.public.map(tag => ({
    ...tag,
    displaySlug: tag.ns ? `${tag.ns}/${tag.slug}` : tag.slug
  }))
  // Sort by vote count (descending)
  .sort((a, b) => (b.item_count || 0) - (a.item_count || 0)) || [];

  return (
    <>
      <div className="flex flex-col md:flex-row max-w-[200px] md:max-w-none gap-0 justify-start">
        <div className={`${
          isExpanded 
            ? 'w-[600px] h-[400px] overflow-y-auto' 
            : 'w-[200px] h-[200px]'
          } bg-gray-200 p-4 flex flex-col transition-all duration-300`}>
          <div className="space-y-2">
            {!isExpanded ? (
              // Collapsed view with hardcoded tags
              <>
                <div 
                  onClick={() => handleTagClick('#songs')} 
                  className="font-serif text-lg text-left hover:underline cursor-pointer"
                >#songs</div>
                <div 
                  onClick={() => handleTagClick('#albums')} 
                  className="font-serif text-lg text-left hover:underline cursor-pointer"
                >#albums</div>
                <div 
                  onClick={() => handleTagClick('#artists')} 
                  className="font-serif text-lg text-left hover:underline cursor-pointer"
                >#artists</div>
              </>
            ) : (
              // Expanded view with all tags
              <div className="grid grid-cols-2 gap-2">
                {flattenedTags.map(tag => (
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
            )}
            <div 
              onClick={() => setIsExpanded(!isExpanded)} 
              className="font-serif text-lg text-gray-500 text-left hover:underline cursor-pointer"
            >
              {isExpanded ? 'less...' : 'more...'}
            </div>
          </div>
        </div>

        {/* Only show these panels when not expanded */}
        {!isExpanded && (
          <>
            {/* Commands Square */}
            <div className="w-[200px] h-[200px] bg-red-200 p-4 flex flex-col">
              <div className="space-y-2">
                <div 
                  onClick={handleVoteClick}
                  className="font-serif text-lg text-left hover:underline cursor-pointer"
                >!vote</div>
                <div 
                  onClick={handleVotesClick}
                  className="font-serif text-lg text-left hover:underline cursor-pointer"
                >!votes</div>
              </div>
            </div>

            {/* Mentions Square */}
            <div className="w-[200px] h-[200px] bg-red-400 p-4 flex flex-col">
              <div className="space-y-2">
                <div 
                  onClick={() => handleMentionClick('@me')}
                  className="font-serif text-lg text-left hover:underline cursor-pointer"
                >@me</div>
                <div 
                  onClick={() => handleMentionClick('@you')}
                  className="font-serif text-lg text-left hover:underline cursor-pointer"
                >@you</div>
                <div 
                  onClick={() => handleMentionClick('@all')}
                  className="font-serif text-lg text-left hover:underline cursor-pointer"
                >@all</div>
              </div>
            </div>
          </>
        )}
      </div>
      <br/>
    </>
  );
};

const fetcher = (url) => fetch(url).then(res => res.json());

const HashtagItem = ({ value }) => {
  const { data, error, isLoading } = useSWR("/api/tag", fetcher);
  const { input, setInput, parseInput } = useStore();
  
  if (isLoading) return <h1> loading... </h1>;
  if (error) return <h1> error </h1>;

  const filtered = data.public.filter(tag => tag.slug.startsWith(value));
  if (filtered.length === 0) {
    return (
      <div 
        className="bg-yellow-100 w-full h-[100px] p-2 rounded flex items-center justify-center cursor-pointer"
        onClick={() => {
          const newInput = '!add(' + value + ')';
          setInput(newInput);
          parseInput(newInput);
        }}
      >
        <span>Missing tag? Click to import new song/album/artist</span>
      </div>
    );
  }
  if (filtered.length === 1 && filtered[0].slug === value) return null;
  // render filtered as a table
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
  const { csvData, results, fetchResults, items_by_id } = useStore();

  const handleItemClick = (itemId) => {
    const { setCsvData, csvData } = useStore.getState();
    
    const existingItem = csvData.find(item => 
        item.type === 'action' && 
        item.value === 'item' && 
        item.itemId === itemId.toString()
    );
    
    if (existingItem) {
        const newCsvData = csvData.filter(item => 
            !(item.type === 'action' && item.value === 'item')
        );
        setCsvData(newCsvData);
        useStore.getState().updateURL(newCsvData);
        return;
    }
    
    const filteredData = csvData.filter(item => 
        !(item.type === 'action' && item.value === 'item')
    );
    
    const newCsvData = [...filteredData, { 
        type: 'action', 
        value: 'item',
        itemId: itemId.toString()
    }];
    
    setCsvData(newCsvData);
    useStore.getState().updateURL(newCsvData);
  };

  // Always calculate these regardless of whether we have results
  const activeCommands = csvData
    .filter(item => item.type === 'action')
    .map(item => ({
      command: item.value,
      itemId: item.itemId,
      addValue: item.addValue
    }));

  const itemCommand = activeCommands.find(cmd => cmd.command === 'item');
  const voteCommand = activeCommands.find(cmd => cmd.command === 'vote');
  const votesCommand = activeCommands.find(cmd => cmd.command === 'votes');
  const addCommand = activeCommands.find(cmd => cmd.command === 'add');
  const selectedItem = itemCommand ? items_by_id?.[parseInt(itemCommand.itemId)] : null;

  if (!csvData.length) {
    return null;
  }

  return (
    <div className="mt-4">
      {/* Show VotePanel if vote command is active */}
      {voteCommand && (
        <div className="w-[800px] bg-purple-100 m-4">
          <VotePanel mutate={fetchResults} />
        </div>
      )}

      {/* Show VotesPanel if votes command is active */}
      {votesCommand && (
        <div className="w-[800px] bg-purple-100 m-4">
          <VotesPanel votes={results?.votes} mutate={fetchResults} />
        </div>
      )}

      {/* Show ItemPanel if item command is active and item exists */}
      {selectedItem && (
        <div className="w-[800px] bg-red-100 m-4">
          <ItemPanel item={selectedItem} mutate={fetchResults} />
        </div>
      )}

      {/* Show AddPanel if add command is active */}
      {addCommand && (
        <div className="w-[800px] bg-green-100 m-4">
          <AddPanel addValue={addCommand.addValue} mutate={fetchResults} />
        </div>
      )}

      {/* Only render item lists if we have results */}
      {results && (
        <>
          {/* Render unsorted items */}
          {results.unsorted?.length > 0 && (
            <ItemList items={results.unsorted} onItemClick={handleItemClick} isSorted={false} />
          )}

          {/* Render sorted items */}
          {results.sorted?.length > 0 && (
            <ItemList items={results.sorted} onItemClick={handleItemClick} isSorted={true} />
          )}
        </>
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
