import { create } from 'zustand';

const useUIStore = create((set) => ({
  // State
  suggestion: null,
  guide: null,
  selection: null,
  searchResults: null,
  votingPairs: null,
  entityView: null,
  error: null,
  notYetImplemented: null,
  isLoading: false,
  
  // Actions/Mutations for each UI response type
  handleUIResponse: (response) => {
    if (!response || !response.type) return;
    
    switch (response.type) {
      case 'Suggestions':
        set({ 
          suggestion: response.data.suggestion,
          // Clear other views when showing just suggestions
          guide: null,
          selection: null,
          searchResults: null,
          votingPairs: null,
          entityView: null,
          error: null,
          notYetImplemented: null,
        });
        break;
        
      case 'Guide':
        set({ 
          guide: response.data,
          // Keep suggestion visible with guide
          selection: null,
          searchResults: null,
          votingPairs: null,
          entityView: null,
          error: null,
          notYetImplemented: null,
        });
        break;
        
      case 'Selection':
        set({ 
          selection: response.data,
          // Keep suggestion visible with selection
          guide: null,
          searchResults: null,
          votingPairs: null,
          entityView: null,
          error: null,
          notYetImplemented: null,
        });
        break;
        
      case 'SearchResults':
        set({ 
          searchResults: response.data,
          suggestion: null,
          guide: null,
          selection: null,
          votingPairs: null,
          entityView: null,
          error: null,
          notYetImplemented: null,
        });
        break;
        
      case 'VotingPairs':
        set({ 
          votingPairs: response.data,
          suggestion: null,
          guide: null,
          selection: null,
          searchResults: null,
          entityView: null,
          error: null,
          notYetImplemented: null,
        });
        break;
        
      case 'EntityView':
        set({ 
          entityView: response.data,
          suggestion: null,
          guide: null,
          selection: null,
          searchResults: null,
          votingPairs: null,
          error: null,
          notYetImplemented: null,
        });
        break;
        
      case 'ErrorPage':
        set({ 
          error: response.data,
          suggestion: null,
          guide: null,
          selection: null,
          searchResults: null,
          votingPairs: null,
          entityView: null,
          notYetImplemented: null,
        });
        break;
        
      case 'NotYetImplemented':
        set({ 
          notYetImplemented: response.data,
          suggestion: null,
          guide: null,
          selection: null,
          searchResults: null,
          votingPairs: null,
          entityView: null,
          error: null,
        });
        break;
        
      case 'HomePage':
        set({ 
          // HomePage might set suggestions
          suggestion: null,
          guide: null,
          selection: null,
          searchResults: null,
          votingPairs: null,
          entityView: null,
          error: null,
          notYetImplemented: null,
        });
        break;
        
      case 'Multiple':
        // Handle multiple responses by processing each one
        if (response.data && response.data.responses) {
          response.data.responses.forEach(subResponse => {
            // Recursively handle each response
            // Note: We need to be careful about state overwrites here
            set((state) => {
              const newState = { ...state };
              
              // Process each response type but don't clear other states
              switch (subResponse.type) {
                case 'Suggestions':
                  newState.suggestion = subResponse.data.suggestion;
                  break;
                case 'Guide':
                  newState.guide = subResponse.data;
                  break;
                case 'Selection':
                  newState.selection = subResponse.data;
                  break;
                // ... other types as needed
              }
              
              return newState;
            });
          });
        }
        break;
        
      default:
        console.warn('Unknown UI response type:', response.type);
    }
    
    set({ isLoading: false });
  },
  
  // Utility actions
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error: error ? { message: error } : null }),
  clearAll: () => set({
    suggestion: null,
    guide: null,
    selection: null,
    searchResults: null,
    votingPairs: null,
    entityView: null,
    error: null,
    notYetImplemented: null,
    isLoading: false,
  }),
}));

export default useUIStore;