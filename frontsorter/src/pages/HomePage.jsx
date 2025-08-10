import { useState, useEffect, useCallback } from "react";
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from "framer-motion";
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { 
  WS_URL, 
  createUpdateQueryCommand, 
  handleWebSocketMessage 
} from "../services/wsAPI.js";
import UIView from "../components/UIView.jsx";
import useUIStore, { ViewTypes } from "../store/uiStore.js";

const HomePage = () => {
  const [inputValue, setInputValue] = useState("");
  
  // Get state and actions from the store
  const { 
    handleUIResponse,
    setLoading,
    setError,
    getViewData,
  } = useUIStore();

  // WebSocket connection using react-use-websocket (handles StrictMode automatically)
  const { sendJsonMessage, lastMessage, readyState } = useWebSocket(WS_URL, {
    onOpen: () => {
      console.log('WebSocket connected');
      setLoading(false);
    },
    onClose: () => {
      console.log('WebSocket disconnected');
    },
    onError: (error) => {
      console.error('WebSocket error:', error);
      setError('WebSocket connection error');
    },
    shouldReconnect: () => true, // Automatically reconnect
    reconnectAttempts: 5,
    reconnectInterval: (attemptNumber) => Math.min(Math.pow(2, attemptNumber) * 1000, 10000),
  });

  // Connection state derived from readyState
  const isConnected = readyState === ReadyState.OPEN;

  // Get suggestion data if present
  const suggestion = getViewData(ViewTypes.SUGGESTIONS)?.suggestion;
  const scrollingSuggestions = getViewData(ViewTypes.SCROLLING_SUGGESTIONS);
  
  // State for scrolling suggestions
  const [currentScrollingSuggestion, setCurrentScrollingSuggestion] = useState(null);

  // Handle incoming WebSocket messages
  useEffect(() => {
    if (lastMessage !== null) {
      handleWebSocketMessage(
        lastMessage.data,
        (uiResponse) => {
          console.log('Received UI update:', uiResponse);
          handleUIResponse(uiResponse);
        },
        (errorMessage) => {
          console.error('WebSocket error:', errorMessage);
          setError(errorMessage);
        }
      );
    }
  }, [lastMessage, handleUIResponse, setError]);

  // Initialize from URL on first load
  useEffect(() => {
    const qParam = new URLSearchParams(window.location.search).get("q");
    if (qParam && isConnected) {
      const decodedValue = decodeURIComponent(qParam);
      setInputValue(decodedValue);
      sendJsonMessage(createUpdateQueryCommand(decodedValue));
    }
  }, [isConnected, sendJsonMessage]);

  // Handle scrolling suggestions animation
  useEffect(() => {
    if (!scrollingSuggestions?.suggestions?.length) {
      setCurrentScrollingSuggestion(null);
      return;
    }

    const suggestions = scrollingSuggestions.suggestions;
    const interval = scrollingSuggestions.animation_interval_ms || 1000;
    const loopThrough = scrollingSuggestions.loop_through !== false;

    // Set initial suggestion
    setCurrentScrollingSuggestion(suggestions[0]);

    let currentIndex = 0;
    const scrollInterval = setInterval(() => {
      currentIndex = loopThrough 
        ? (currentIndex + 1) % suggestions.length
        : Math.min(currentIndex + 1, suggestions.length - 1);
      
      setCurrentScrollingSuggestion(suggestions[currentIndex]);
    }, interval);

    return () => clearInterval(scrollInterval);
  }, [scrollingSuggestions]);

  // Function to send query updates to the backend immediately
  const updateQuery = useCallback((value) => {
    if (!isConnected) return;
    sendJsonMessage(createUpdateQueryCommand(value));

    // Also update the URL in the background
    const newSearchParams = new URLSearchParams(window.location.search);
    if (value.trim()) {
        newSearchParams.set("q", encodeURIComponent(value));
    } else {
        newSearchParams.delete("q");
    }
    // Use replace to avoid polluting browser history on every keystroke
    const newUrl = value.trim() ? `?${newSearchParams.toString()}` : window.location.pathname;
    window.history.replaceState({}, '', newUrl);
  }, [isConnected, sendJsonMessage]);

  // Handle input change
  const handleInputChange = (e) => {
    const value = e.target.value;
    setInputValue(value);
    updateQuery(value);
  };

  const handleKeyDown = (e) => {
    // Priority: regular suggestion over scrolling suggestion
    const activeSuggestion = suggestion || currentScrollingSuggestion;
    
    if (e.key === 'Tab' && activeSuggestion) {
      e.preventDefault();
      const completion = activeSuggestion.completion;
      setInputValue(completion);
      
      // Send the completed query to the backend immediately
      sendJsonMessage(createUpdateQueryCommand(completion));

      // Update URL
      const newSearchParams = new URLSearchParams();
      newSearchParams.set("q", encodeURIComponent(completion));
      window.history.pushState({}, '', `?${newSearchParams.toString()}`);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Space for future voting pairs */}
      <div className="h-64"></div>
      
      {/* Google-style search interface */}
      <div className="flex flex-col items-center px-4">
        <div className="flex items-center gap-3 mb-8">
          <span className="text-4xl font-serif text-gray-800">sorter</span>
          <div className="relative">
            <input 
              type="text" 
              placeholder="Enter a URL" 
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={!isConnected}
              className="w-96 px-4 py-2 text-base border border-gray-300 focus:border-blue-500 focus:outline-none hover:shadow-sm transition-shadow bg-transparent" 
              style={{ position: 'relative', zIndex: 2 }}
            />
            {/* Regular suggestion takes priority, then scrolling suggestion */}
            <AnimatePresence mode="popLayout">
              {(() => {
                const activeSuggestion = suggestion || currentScrollingSuggestion;
                const isScrolling = !suggestion && currentScrollingSuggestion;
                
                if (activeSuggestion && inputValue && activeSuggestion.completion.startsWith(inputValue)) {
                  return (
                    <motion.div
                      key={activeSuggestion.completion}
                      initial={{ 
                        opacity: 0,
                        y: isScrolling ? 8 : 0
                      }}
                      animate={{ 
                        opacity: 1,
                        y: 0,
                        transition: {
                          duration: isScrolling ? 0.3 : 0.1,
                          ease: "easeOut",
                          delay: isScrolling ? 0.1 : 0
                        }
                      }}
                      exit={{ 
                        opacity: 0,
                        y: isScrolling ? -8 : 0,
                        transition: {
                          duration: isScrolling ? 0.2 : 0.1,
                          ease: "easeIn"
                        }
                      }}
                      className="absolute top-0 left-0 w-96 px-4 py-2 text-base text-gray-400 pointer-events-none"
                      style={{ zIndex: 1 }}
                    >
                      <span className="text-transparent">{inputValue}</span>
                      {activeSuggestion.completion.substring(inputValue.length)}
                    </motion.div>
                  );
                }
                return null;
              })()}
            </AnimatePresence>
            {/* Connection status indicator */}
            <div className={`absolute right-2 top-1/2 transform -translate-y-1/2 w-2 h-2 rounded-full ${
              isConnected ? 'bg-green-500' : 'bg-red-500'
            }`} title={isConnected ? 'Connected' : 'Disconnected'} style={{ zIndex: 3 }} />
          </div>
        </div>

        {/* Connection status */}
        {!isConnected && (
          <div className="mb-4 text-sm text-orange-600 bg-orange-50 px-4 py-2 rounded-lg border border-orange-200">
            Connecting to server...
          </div>
        )}

        {/* UI View - renders based on global state */}
        <UIView 
          onCompletionSelect={(completion) => {
            setInputValue(completion);
            // Send the query to backend
            sendJsonMessage(createUpdateQueryCommand(completion));
            // Update URL
            const newSearchParams = new URLSearchParams();
            newSearchParams.set("q", encodeURIComponent(completion));
            window.history.pushState({}, '', `?${newSearchParams.toString()}`);
          }}
        />
      </div>
    </div>
  );
};

export default HomePage;