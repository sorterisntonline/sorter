import React, { createContext, useContext } from 'react';
import { useWebSocketLibrary } from '../hooks/useWebSocketLibrary';

const WebSocketContext = createContext(null);

export function WebSocketProvider({ children }) {
  const websocket = useWebSocketLibrary();

  return (
    <WebSocketContext.Provider value={websocket}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
} 