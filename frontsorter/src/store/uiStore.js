import { create } from 'zustand';

const useUIStore = create((set, get) => ({
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
        // Handle multiple responses by processing each one additively
        if (response.data && response.data.responses) {
          // Process all responses additively (don't clear between them)
          response.data.responses.forEach(subResponse => {
            get().handleUIResponseAdditive(subResponse);
          });
        }
        break;
        
      default:
        console.warn('Unknown UI response type:', response.type);
    }
    
    set({ isLoading: false });
  },
  
  // Additive version that doesn't clear other state
  handleUIResponseAdditive: (response) => {
    if (!response || !response.type) return;
    
    // Only update the specific field for this response type
    switch (response.type) {
      case 'Suggestions':
        set({ suggestion: response.data.suggestion });
        break;
        
      case 'Guide':
        set({ guide: response.data });
        break;
        
      case 'Selection':
        set({ selection: response.data });
        break;
        
      case 'SearchResults':
        set({ searchResults: response.data });
        break;
        
      case 'VotingPairs':
        set({ votingPairs: response.data });
        break;
        
      case 'EntityView':
        set({ entityView: response.data });
        break;
        
      case 'ErrorPage':
        set({ error: response.data });
        break;
        
      case 'NotYetImplemented':
        set({ notYetImplemented: response.data });
        break;
        
      case 'Multiple':
        // Recursively handle nested Multiple responses
        if (response.data && response.data.responses) {
          response.data.responses.forEach(subResponse => {
            get().handleUIResponseAdditive(subResponse);
          });
        }
        break;
    }
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