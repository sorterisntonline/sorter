import { useState } from 'react';
import './App.css'

// Dummy data for tags (could be fetched from an API later)
const availableTags = ['react', 'javascript', 'tailwind', 'css', 'html', 'vite', 'node'];

function App() {
    const [inputValue, setInputValue] = useState('');
    const [selectedTags, setSelectedTags] = useState(['react', 'tailwind']); // Start with some tags

    const handleInputChange = (event) => {
        setInputValue(event.target.value);
    };

    const handleKeyDown = (event) => {
        if (event.key === 'Enter' && inputValue.trim() !== '') {
            const newTag = inputValue.trim().toLowerCase();
            // Add tag if it exists in availableTags (optional) and isn't already selected
            // For this example, let's allow any tag to be added if not already present
            if (!selectedTags.includes(newTag)) {
                setSelectedTags([...selectedTags, newTag]);
            }
            setInputValue(''); // Clear input
            event.preventDefault(); // Prevent form submission if applicable
        }
        // Optional: Handle Backspace to remove the last tag if input is empty
        if (event.key === 'Backspace' && inputValue === '' && selectedTags.length > 0) {
           removeTag(selectedTags[selectedTags.length - 1]);
        }
    };

    const removeTag = (tagToRemove) => {
        setSelectedTags(selectedTags.filter(tag => tag !== tagToRemove));
    };

    return (
        // Centering the content vertically and horizontally
        <div className="app-container flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
          {/* Container for the multi-tag input */}
          <div className="w-full max-w-lg">
            {/* The input area */}
            <div className="flex flex-wrap items-center border border-gray-300 rounded-md p-2 bg-white shadow-sm">
              {/* Display selected tags */}
              {selectedTags.map((tag) => (
                <span key={tag} className="flex items-center bg-blue-500 text-white text-sm font-medium mr-2 mb-1 px-2.5 py-0.5 rounded-full">
                  {tag}
                  <button
                    type="button"
                    className="ml-1.5 flex-shrink-0 text-blue-100 hover:text-white focus:outline-none"
                    onClick={() => removeTag(tag)}
                  >
                    &times; {/* Multiplication sign as close icon */}
                  </button>
                </span>
              ))}
              {/* The actual input field */}
              <input
                id="tag-input"
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={selectedTags.length > 0 ? "" : "Type and press Enter..."}
                className="flex-grow p-1 outline-none text-sm" // flex-grow allows it to take remaining space
              />
            </div>
             {/* Optional: Display available/suggested tags */}
             {/* <div className="mt-2 flex flex-wrap gap-1">
                 {availableTags
                    .filter(tag => !selectedTags.includes(tag) && tag.startsWith(inputValue.toLowerCase()))
                    .map(tag => (
                        <button
                            key={tag}
                            onClick={() => {
                                setSelectedTags([...selectedTags, tag]);
                                setInputValue('');
                            }}
                            className="bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded hover:bg-gray-300"
                        >
                            {tag}
                        </button>
                    ))
                 }
             </div> */}
          </div>
        </div>
    )
}

export default App
