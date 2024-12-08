import * as ohm from 'ohm-js';
import useSWR from "swr";
import { create } from "zustand";
import { useState, useEffect } from 'react';
import { VotePanel } from "./VotePanel";
import { useSearchParams, useNavigate } from 'react-router-dom';
import { VotesPanel } from './VotesPanel';

// TODO make /item command pop up when you click on an item

export const useStore = create((set, get) => ({
  input: "",
  csvData: [],
  results: null,
  magnitude: 50,
  pinned_left: null,
  pinned_right: null,
  items_by_id: {},
  setInput: (input) => set({ input }),
  setCsvData: (csvData) => set({ csvData }),
  setResults: (results) => {
    const items_by_id = {};
    console.log('results', results);
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
    const params = new URLSearchParams(window.location.search);
    if (!params.has('t')) {  // If no tags parameter exists
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
  parseInput: (value) => {
    try {
      const match = grammar.match(value);
      if (match.succeeded()) {
        const parsedData = semantics(match).toArray();
        
        // Get current store state
        const currentState = useStore.getState();
        
        // Compare with previous csvData to see if anything meaningful changed
        const hasMeaningfulChange = !currentState.csvData.length || 
          parsedData.length !== currentState.csvData.length ||
          !parsedData.every((item, i) => 
            item.type === currentState.csvData[i]?.type && 
            item.value === currentState.csvData[i]?.value
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
            .map(item => item.value)
            .join('.');

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

            if (allTagsExist) {
              currentState.fetchResults();
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to parse input:', error);
    }
  },
}));

const TagCategories = () => {
  const { input, setInput, parseInput } = useStore();

  const handleTagClick = (tag) => {
    const newInput = input + (input.endsWith(' ') || input === '' ? '' : ' ') + tag + ' ';
    setInput(newInput);
    parseInput(newInput);
  };

  const handleVoteClick = () => {
    if (!input.includes('!vote')) {
      const newInput = input + (input.endsWith(' ') || input === '' ? '' : ' ') + '!vote ';
      setInput(newInput);
      parseInput(newInput);
    }
  };

  const handleVotesClick = () => {
    if (!input.includes('!votes')) {
      const newInput = input + (input.endsWith(' ') || input === '' ? '' : ' ') + '!votes ';
      setInput(newInput);
      parseInput(newInput);
    }
  };

  return (
    <>
      <div className="flex flex-col md:flex-row max-w-[200px] md:max-w-none gap-0 justify-start">
        {/* Hashtags Square */}
        <div className="w-[200px] h-[200px] bg-gray-200 p-4 flex flex-col">
          <div className="space-y-2">
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
          </div>
        </div>

        {/* Commands Square */}
        <div className="w-[200px] h-[200px] bg-purple-200 p-4 flex flex-col">
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
        <div className="w-[200px] h-[200px] bg-purple-400 p-4 flex flex-col">
          <div className="space-y-2">
            <div className="font-serif text-lg text-left hover:underline cursor-pointer">@me</div>
            <div className="font-serif text-lg text-left hover:underline cursor-pointer">@you</div>
            <div className="font-serif text-lg text-left hover:underline cursor-pointer">@all</div>
          </div>
        </div>
      </div>
      <br/>
    </>
  );
};

const grammarSource = String.raw`
  Input {
    input = (tag | mention | command | itemCommand | space)*
    tag = "#" tagContent?
    mention = "@" tagContent
    command = "!" commandContent
    itemCommand = "!" "item" "(" number ")"
    tagContent = (alnum | "-" | "_")+
    commandContent = (alnum)+
    number = digit+
  }
`;

const grammar = ohm.grammar(grammarSource);
const semantics = grammar.createSemantics();

semantics.addOperation('toArray', {
  input: (elements) => elements.children.map(e => e.toArray()).filter(e => e !== null),
  tag: (hash, content) => ({ type: 'hashtag', value: content.sourceString }),
  mention: (at, content) => ({ type: 'mention', value: content.sourceString }),
  command: (bang, content) => ({ type: 'action', value: content.sourceString }),
  itemCommand: (bang, item, leftParen, num, rightParen) => ({ 
    type: 'action', 
    value: 'item', 
    itemId: num.sourceString 
  }),
  tagContent: (chars) => chars.sourceString,
  commandContent: (chars) => chars.sourceString,
  space: (_) => null,
  _terminal: () => null,
  number: (digits) => digits.sourceString,
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
          const newInput = '!add "' + value + '" ';
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

const GrammarDisplay = () => {
  const { csvData, results, fetchResults } = useStore();

  // Get active commands and their parameters from csvData
  const activeCommands = csvData
    .filter(item => item.type === 'action')
    .map(item => ({
      command: item.value,
      itemId: item.itemId
    }));

  if (!csvData.length) return null;
  if (!results) return null;

  // Find the item and vote commands
  const itemCommand = activeCommands.find(cmd => cmd.command === 'item');
  const voteCommand = activeCommands.find(cmd => cmd.command === 'vote');
  const votesCommand = activeCommands.find(cmd => cmd.command === 'votes');
  const selectedItem = itemCommand ? results.items_by_id?.[itemCommand.itemId] : null;

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
          <VotesPanel votes={results.votes} mutate={fetchResults} />
        </div>
      )}

      {/* Show ItemPanel if item command is active and item exists */}
      {selectedItem && (
        <div className="w-[800px] bg-purple-100 m-4">
          <ItemPanel item={selectedItem} mutate={fetchResults} />
        </div>
      )}

      {/* Update the item click handlers to modify input */}
      {results.unsorted?.length > 0 && (
        <div className="mb-4 w-[600px]">
          <ol className="list-disc ml-4">
            {results.unsorted.map(item => (
              <li 
                key={item.id} 
                className="cursor-pointer text-left border-b border-dashed border-gray-200 dark:border-gray-800"
                onClick={() => {
                  const { setInput, parseInput } = useStore.getState();
                  const newInput = `!item(${item.id})`;
                  setInput(newInput);
                  parseInput(newInput);
                }}
              >
                <div className="flex justify-between">
                  <div>{item.title}</div>
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
      )}

      {/* Same update for sorted items */}
      {results.sorted?.length > 0 && (
        <div className="mb-4">
          <ol className="list-decimal ml-4">
            {results.sorted.map(item => (
              <li 
                key={item.id} 
                className="cursor-pointer text-left border-b border-dashed border-gray-200 dark:border-gray-800"
                onClick={() => {
                  const { setInput, parseInput } = useStore.getState();
                  const newInput = `!item(${item.id})`;
                  setInput(newInput);
                  parseInput(newInput);
                }}
                style={{ backgroundColor: `rgba(255, 0, 0, ${item.elo ? item.elo / 8.0 : 0})` }}
              >
                <div className="flex justify-between">
                  <div>
                    {item.elo !== undefined && (
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
  const [isValidInput, setIsValidInput] = useState(true);

  useEffect(() => {
    if (!tagData) return;
    
    const tags = searchParams.get('t')?.split('.').map(tag => '#' + tag) || [];
    const mentions = searchParams.get('u')?.split('.').map(mention => '@' + mention) || [];
    const actions = searchParams.get('a')?.split('.').map(action => '!' + action) || [];
    
    const initialInput = [...tags, ...mentions, ...actions].join(' ');
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
    setInput(e.target.value);
    
    try {
      const match = grammar.match(e.target.value);
      setIsValidInput(match.succeeded());
      if (match.succeeded()) {
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
            .map(item => item.value)
            .join('.');

          // Create new search params
          const newParams = new URLSearchParams(searchParams);
          if (tags.length) newParams.set('t', tags);
          else newParams.delete('t');
          if (mentions.length) newParams.set('u', mentions);
          else newParams.delete('u');
          if (actions.length) newParams.set('a', actions);
          else newParams.delete('a');

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
      }
    } catch (error) {
      console.error('Failed to parse CSV:', error);
      setIsValidInput(false);
    }
  };

  return (
    <div className="flex flex-col items-center">
      <input
        type="text"
        className={`font-serif p-2 mt-4 text-lg w-[600px] border focus:outline-none ${
          isValidInput 
            ? 'border-gray-300 focus:border-gray-500' 
            : 'border-red-300 focus:border-red-500 bg-red-50'
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
            Type !vote or click vote to see two items at a time and pick your favorite. Each choice helps build the rankings.
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
