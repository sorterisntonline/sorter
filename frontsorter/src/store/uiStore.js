import { create } from 'zustand';

const useUIStore = create((set, get) => ({
  // Core state - single view with discriminated union
  view: { type: 'HomePage', data: null },
  isLoading: false,
  
  // Main handler that updates the view based on response type
  handleUIResponse: (response) => {
    if (!response || !response.type) return;
    
    // Set loading to false since we got a response
    set({ isLoading: false });
    
    // For Multiple responses, we keep the same structure
    // The view itself contains the multiple responses
    if (response.type === 'Multiple') {
      set({ 
        view: {
          type: 'Multiple',
          data: response.data
        }
      });
      return;
    }
    
    // For all other response types, directly map to view
    set({
      view: {
        type: response.type,
        data: response.data
      }
    });
  },
  
  // Utility actions
  setLoading: (loading) => set({ isLoading: loading }),
  
  setError: (error) => set({ 
    view: {
      type: 'ErrorPage',
      data: error ? { message: error } : null
    },
    isLoading: false
  }),
  
  clearView: () => set({
    view: { type: 'HomePage', data: null },
    isLoading: false
  }),
  
  // Helper to navigate to a specific view type
  navigateTo: (viewType, data = null) => set({
    view: {
      type: viewType,
      data: data
    },
    isLoading: false
  }),
  
  // Computed getters for common view checks
  isHomePage: () => get().view.type === 'HomePage',
  isError: () => get().view.type === 'ErrorPage',
  isMultiple: () => get().view.type === 'Multiple',
  
  // Get specific view data if current view matches type
  getViewData: (type) => {
    const { view } = get();
    if (view.type === type) {
      return view.data;
    }
    // For Multiple views, check if any sub-view matches
    if (view.type === 'Multiple' && view.data?.responses) {
      const match = view.data.responses.find(r => r.type === type);
      return match?.data;
    }
    return null;
  },
  
  // Check if a specific view type is active (including within Multiple)
  hasViewType: (type) => {
    const { view } = get();
    if (view.type === type) return true;
    if (view.type === 'Multiple' && view.data?.responses) {
      return view.data.responses.some(r => r.type === type);
    }
    return false;
  }
}));

export default useUIStore;

// Export view type constants for consistency
export const ViewTypes = {
  SUGGESTIONS: 'Suggestions',
  SCROLLING_SUGGESTIONS: 'ScrollingSuggestions',
  GUIDE: 'Guide',
  SELECTION: 'Selection',
  SEARCH_RESULTS: 'SearchResults',
  VOTING_PAIRS: 'VotingPairs',
  ENTITY_VIEW: 'EntityView',
  ERROR_PAGE: 'ErrorPage',
  NOT_YET_IMPLEMENTED: 'NotYetImplemented',
  HOME_PAGE: 'HomePage',
  MULTIPLE: 'Multiple'
};