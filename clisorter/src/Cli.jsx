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
  input: "",
  csvData: [],
  results: null,
  magnitude: 50,
  items_by_id: {},
  parseError: false,
  tagData: null,
  setTagData: (data) => set({ tagData: data }),
  setInput: (input) => set({ input }),
  setCsvData: (csvData) => set({ csvData }),
  setResults: (results) => {
    const items_by_id = {};
    console.log('Setting results:', results);
    if (results) {
      // Index unsorted items
      if (results.unsorted) {
        results.unsorted.forEach(item => {
          items_by_id[item.id] = item;
        });
      }
      // Index sorted items
      if (results.sorted) {
        results.sorted.forEach(item => {
          items_by_id[item.id] = item;
        });
      }
    }
    set({ results, items_by_id });
  },
  setMagnitude: (magnitude) => set({ magnitude }),
  setPinnedLeft: (item) => set({ pinned_left: item }),
  setPinnedRight: (item) => set({ pinned_right: item }),
  fetchResults: async () => {
    console.log('Fetching results...');
    const params = new URLSearchParams(window.location.search);
    if (!params.has('t')) {  // If no tags parameter exists
      console.log('No tags parameter, setting results to null');
      set({ results: null });
      return;
    }
    
    try {
      console.log('Fetching with params:', params.toString());
      const response = await fetch(`/api/tag/page2?${params.toString()}`);
      const data = await response.json();
      console.log('Received data:', data);
      get().setResults(data);
    } catch (error) {
      console.error('Failed to fetch results:', error);
      get().setResults(null);
    }
  },
  parseInput: (value) => {
    console.log('Parsing input:', value);
    try {
      const match = grammar.match(value);
      const parseSucceeded = match.succeeded();
      
      set({ parseError: !parseSucceeded });

      if (parseSucceeded) {
        const parsedData = semantics(match).toArray();
        console.log('Parsed data:', parsedData);
        
        // Get current store state
        const currentState = get();
        
        // Compare with previous csvData
        const hasMeaningfulChange = !currentState.csvData.length || 
          parsedData.length !== currentState.csvData.length ||
          !parsedData.every((item, i) => 
            item.type === currentState.csvData[i]?.type && 
            item.value === currentState.csvData[i]?.value &&
            item.itemId === currentState.csvData[i]?.itemId
          );

        if (hasMeaningfulChange) {
          set({ csvData: parsedData });
          
          // Build query params
          const tags = parsedData
            .filter(item => item.type === 'hashtag')
            .map(item => item.value)
            .join('.');
          const mentions = parsedData
            .filter(item => item.type === 'mention')
            .map(item => item.value)
            .join('.');
          const actions = parsedData
            .filter(item => item.type === 'action')
            .map(item => item.itemId 
              ? `${item.value}${item.itemId}`
              : item.value
            )
            .join('.');

          console.log('Updated params:', { tags, mentions, actions });

          // Update URL params
          const params = new URLSearchParams(window.location.search);
          if (tags.length) params.set('t', tags);
          else params.delete('t');
          if (mentions.length) params.set('u', mentions);
          else params.delete('u');
          if (actions.length) params.set('a', actions);
          else params.delete('a');

          // Update URL without page reload
          window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
          
          // Fetch results if all tags exist
          if (currentState.tagData) {
            const allTagsExist = parsedData
              .filter(item => item.type === 'hashtag')
              .every(tag => currentState.tagData.public.some(publicTag => publicTag.slug === tag.value));

            console.log('All tags exist:', allTagsExist);
            if (allTagsExist) {
              currentState.fetchResults();
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to parse input:', error);
      set({ parseError: true });
    }
  },
  parsedDataToString: (parsedData) => {
    return parsedData.map(item => {
      if (item.type === 'hashtag') return '#' + item.value;
      if (item.type === 'mention') return '@' + item.value;
      if (item.type === 'action') {
        return item.itemId ? `!${item.value}(${item.itemId})` : `!${item.value}`;
      }
      return '';
    }).join(' ');
  },
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

const grammarSource = String.raw`
  Input {
    input = (tag | mention | command | space)*
    tag = "#" tagContent?
    mention = "@" tagContent
    command = "!" commandName argList?
    commandName = (alnum)+
    argList = "(" argContent ")"
    argContent = (alnum | " ")+
    tagContent = (alnum | "-" | "_")+
  }
`;

const grammar = ohm.grammar(grammarSource);
const semantics = grammar.createSemantics();

semantics.addOperation('toArray', {
  input: (elements) => elements.children.map(e => e.toArray()).filter(e => e !== null),
  tag: (hash, content) => ({ type: 'hashtag', value: content.sourceString }),
  mention: (at, content) => ({ type: 'mention', value: content.sourceString }),
  command: (bang, name, args) => {
    const argArray = args.children.length ? args.toArray() : [];
    const [itemId, addValue] = argArray.length ? argArray : [undefined, undefined];
    return {
      type: 'action',
      value: name.sourceString,
      itemId: itemId ? itemId.trim() : undefined,
      addValue: addValue ? addValue.trim() : undefined
    };
  },
  argList: (leftParen, content, rightParen) => content.sourceString,
  tagContent: (chars) => chars.sourceString,
  space: (_) => null,
  _terminal: () => null,
  _iter: (...children) => children.map(c => c.toArray()),
});

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
    const { setInput, parseInput, csvData, parsedDataToString } = useStore.getState();
    
    const existingItem = csvData.find(item => 
        item.type === 'action' && 
        item.value === 'item' && 
        item.itemId === itemId.toString()
    );
    
    if (existingItem) {
        const newCsvData = csvData.filter(item => 
            !(item.type === 'action' && item.value === 'item')
        );
        const newInput = parsedDataToString(newCsvData);
        setInput(newInput);
        parseInput(newInput);
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
    
    const newInput = parsedDataToString(newCsvData);
    setInput(newInput);
    parseInput(newInput);
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

const TextInput = () => {
  const { input, csvData, setInput, setCsvData, fetchResults, results } = useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { data: tagData } = useSWR("/api/tag", fetcher);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [parseError, setParseError] = useState(false);

  useEffect(() => {
    if (!tagData) return;
    
    const tags = searchParams.get('t')?.split('.').map(tag => '#' + tag) || [];
    const mentions = searchParams.get('u')?.split('.').map(mention => '@' + mention) || [];
    const actions = searchParams.get('a')?.split('.').map(action => {
      // Match action followed by optional numbers
      const match = action.match(/^([a-zA-Z]+)(\d+)?$/);
      if (match) {
        const [_, command, itemId] = match;
        return itemId ? `!${command}(${itemId})` : `!${command}`;
      }
      return '!' + action;
    }) || [];
    
    const initialInput = [...tags, ...mentions, ...actions].join(' ');

    // Only set initial input if it's not already set
    if (initialInput && !input) {
      setInput(initialInput);
      const match = grammar.match(initialInput);
      if (match.succeeded()) {
        const parsedData = semantics(match).toArray();
        setCsvData(parsedData);
        
        if (parsedData.filter(item => item.type === 'hashtag')
            .every(tag => tagData.public.some(publicTag => publicTag.slug === tag.value))) {
          fetchResults();
        }
      }
    }
  }, [tagData, searchParams, input, setInput, setCsvData, fetchResults]);

  const handleKeyDown = (e) => {
    // Get current suggestions from HashtagItem components
    const lastTag = input.split(' ').pop();
    if (!lastTag?.startsWith('#') || !tagData) return;
    
    const suggestions = tagData.public
      .filter(tag => tag.slug.startsWith(lastTag.slice(1)))
      .map(tag => tag.slug);

    if (suggestions.length === 0) return;

    if (e.key === 'Tab') {
      e.preventDefault();
      
      // Calculate next suggestion index
      const nextIndex = selectedSuggestionIndex === -1 ? 0 : 
        (selectedSuggestionIndex + 1) % suggestions.length;
      setSelectedSuggestionIndex(nextIndex);

      // Replace the last tag with the selected suggestion and add a space
      const inputParts = input.split(' ');
      inputParts[inputParts.length - 1] = '#' + suggestions[nextIndex] + ' ';
      const newInput = inputParts.join(' ');
      setInput(newInput);

      // Trigger handleChange with synthetic event to run parsing and network query
      handleChange({ target: { value: newInput } });
    }
  };

  const handleChange = (e) => {
    setSelectedSuggestionIndex(-1);
    const newValue = e.target.value;
    setInput(newValue);

    // If the input is empty, clear csvData, reset parseError, and update URL
    if (newValue.trim() === "") {
      setCsvData([]);
      setParseError(false);
      setSearchParams(new URLSearchParams()); // Clear URL parameters
      return;
    }

    try {
      const match = grammar.match(newValue);
      const parseSucceeded = match.succeeded();
      setParseError(!parseSucceeded);

      if (parseSucceeded) {
        const parsedData = semantics(match).toArray();
        
        // Compare with previous csvData to see if anything meaningful changed
        const hasMeaningfulChange = !csvData.length || 
          parsedData.length !== csvData.length ||
          !parsedData.every((item, i) => 
            item.type === csvData[i]?.type && 
            item.value === csvData[i]?.value
          );

        if (hasMeaningfulChange) {
          setCsvData(parsedData);

          // Build query params
          const tags = parsedData
            .filter(item => item.type === 'hashtag')
            .map(item => item.value)
            .join('.');
          const mentions = parsedData
            .filter(item => item.type === 'mention')
            .map(item => item.value)
            .join('.');
          const actions = parsedData
            .filter(item => item.type === 'action')
            .map(item => item.itemId 
              ? `${item.value}${item.itemId}`
              : item.value
            )
            .join('.');

          // Create new search params
          const newParams = new URLSearchParams();
          if (tags.length) newParams.set('t', tags);
          if (mentions.length) newParams.set('u', mentions);
          if (actions.length) newParams.set('a', actions);

          setSearchParams(newParams);
          
          if (tagData) {
            const allTagsExist = parsedData
              .filter(item => item.type === 'hashtag')
              .every(tag => tagData.public.some(publicTag => publicTag.slug === tag.value));

            if (allTagsExist) {
              fetchResults();
            }
          }
        }
      } else {
        // Clear URL parameters if parsing fails
        setSearchParams(new URLSearchParams());
      }
    } catch (error) {
      console.error('Failed to parse CSV:', error);
      setParseError(true);
      // Clear URL parameters on error
      setSearchParams(new URLSearchParams());
    }
  };

  return (
    <div className="flex flex-col items-center">
      <input
        type="text"
        className={`font-serif p-2 mt-4 text-lg w-[600px] border focus:outline-none ${
          parseError 
            ? 'border-red-300 bg-red-50 focus:border-red-500' 
            : 'border-gray-300 focus:border-gray-500'
        }`}
        placeholder="#kendrick-lamar #songs @me"
        value={input}
        autoFocus
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck="false"
        autoComplete="off"
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />
      <div className="w-[600px]">
        <div className="flex flex-wrap gap-2">
          {csvData.map((item, i) => (
            item.type === 'hashtag' 
              ? <HashtagItem key={i} value={item.value} />
              : item.type === 'mention'
                ? <MentionItem key={i} value={item.value} />
                : null
          ))}
        </div>
      </div>
      <GrammarDisplay />
    </div>
  );
};

export const Cli = () => {
  const [isTutorialVisible, setIsTutorialVisible] = useState(true);

  // Load visibility state from localStorage on component mount
  useEffect(() => {
    const stored = localStorage.getItem('tutorialVisible');
    if (stored !== null) {
      setIsTutorialVisible(stored === 'true');
    }
  }, []);

  // Save visibility state to localStorage whenever it changes
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
            Find what you want to rank using hashtags. Type #songs #kendrick-lamar or click the tags below to narrow down your focus.
            <br/>
            <br/>
            Type or click !vote to see two items at a time and pick your favorite. Each choice helps build the rankings.
            <br/>
            <br/>
            Type @me to see your rankings, @username to find others' taste, or @all to see what everyone thinks.
          </p>
        )}
      </div>
      <div className="flex flex-col md:flex-row max-w-[200px] md:max-w-none gap-0 justify-center">
        <TagCategories />
      </div>
      <TextInput />
    </div>
  );
}
