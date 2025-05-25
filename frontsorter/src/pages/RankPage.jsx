import React, { useState, useEffect } from 'react';
import useLocalStorageState from 'use-local-storage-state'

const defaultPrompt = `Between A and B, which do you prefer?

<A>
{{A}}
</A>
<B>
{{B}}
</B>

if -50 is strongly prefer A, and 50 is strongly prefer B, then your answer should be a number between -50 and 50.
respond with some reasoning and your score. Your score will be read by this regex: /SCORE: (-?\\d+)/
`

function RankPage() {
  const [prompt, setPrompt] = useLocalStorageState('prompt', {
    defaultValue: defaultPrompt
  });
  const [items, setItems] = useLocalStorageState('items', {
    defaultValue: []
  });
  const [currentItem, setCurrentItem] = useState('');
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const savedData = localStorage.getItem('rankingData');
    if (savedData) {
      const { prompt, items } = JSON.parse(savedData);
      setPrompt(prompt || defaultPrompt);
      setItems(items || []);
    }
    setHasLoaded(true);
  }, []);

  // Save to localStorage whenever data changes
  useEffect(() => {
    if (hasLoaded) {
      localStorage.setItem('rankingData', JSON.stringify({ prompt, items }));
    }
  }, [prompt, items, hasLoaded]);

  const rankItems = async (itemsToRank) => {
    // Mock AI ranking for now - in production, this would call your AI service
    const rankedItems = [...itemsToRank].sort((a, b) => {
      // Simulate AI ranking logic
      const scoreA = a.text.length + (a.text.match(/[.!?]/g) || []).length * 10 + Math.random() * 20;
      const scoreB = b.text.length + (b.text.match(/[.!?]/g) || []).length * 10 + Math.random() * 20;
      return scoreB - scoreA;
    });

    // Add mock AI explanations and scores
    return rankedItems.map((item, index) => ({
      ...item,
      score: Math.floor(95 - index * 8 - Math.random() * 5),
      explanation: getExplanation(item.text, index)
    }));
  };

  const getExplanation = (text, index) => {
    const explanations = [
      'Clear narrative hook, establishes stakes',
      'Personal but lacks broader context',
      'Strong opening, needs more specificity',
      'Compelling angle, could be more concise',
      'Interesting perspective, missing key context'
    ];
    return explanations[index % explanations.length];
  };

  const handleAddItem = async () => {
    if (!currentItem.trim()) return;

    const newItem = {
      id: Date.now(),
      text: currentItem,
      explanation: '',
      score: 0
    };

    const newItems = [...items, newItem];
    const rankedItems = await rankItems(newItems);
    
    setItems(rankedItems);
    setCurrentItem('');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && e.shiftKey) {
      // Allow shift+enter for new lines
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddItem();
    }
  };

  return (
    <div className="sorter-page">
      <div className="content">
        <section>
          <h2>Add new item:</h2>
          <textarea
            value={currentItem}
            onChange={(e) => setCurrentItem(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="Type or paste your text here..."
            className="item-textarea"
            rows="4"
          />
          <button
            className="submit-button"
            onClick={handleAddItem}
            onMouseDown={(e) => e.target.classList.add('pressed')}
            onMouseUp={(e) => e.target.classList.remove('pressed')}
            onMouseLeave={(e) => e.target.classList.remove('pressed')}
          >
            Submit
          </button>
          <h2>Prompt:</h2>
          <textarea
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="topic-input"
            rows="13"
          />



        </section>
      </div>
      
      <div className="sidebar">
        {/* TODO unsorted/sorted split */}
        {items.length > 0 && (
          <>
            <h2 style={{color: "black"}}>Ranked items:</h2>
            <ol className="ranked-list">
              {items.map((item, index) => (
                <li key={item.id} className="ranked-item">
                  <p>{item.text}</p>
                  <div className="item-meta">
                    <a
                      href="#"
                      className={hoveredIndex === index ? 'visited' : ''}
                      onClick={(e) => {
                        e.preventDefault();
                        setHoveredIndex(hoveredIndex === index ? null : index);
                      }}
                    >
                      [Why?]
                    </a>
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        const newItems = items.filter(i => i.id !== item.id);
                        setItems(newItems);
                      }}
                    >
                      [Delete]
                    </a>
                  </div>
                  {hoveredIndex === index && (
                    <p className="explanation">
                      {/* TODO: vote matchup matrix with reasoning */}
                      {item.explanation}
                    </p>
                  )}
                </li>
              ))}
            </ol>

            <hr />
          </>
        )}
      </div>
    </div>
  );
}

export default RankPage; 