import { useCallback, useEffect, useState } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';

const WS_URL = 'ws://localhost:8081/api/ws';

export function useWebSocketLibrary() {
  const [lastMessage, setLastMessage] = useState(null);
  
  const {
    sendMessage,
    lastJsonMessage,
    readyState,
  } = useWebSocket(WS_URL, {
    shouldReconnect: () => true,
    reconnectAttempts: 10,
    reconnectInterval: (attemptNumber) => Math.min(Math.pow(2, attemptNumber) * 1000, 10000),
    onOpen: () => console.log('WebSocket connected'),
    onClose: () => console.log('WebSocket disconnected'),
    onError: (error) => console.error('WebSocket error:', error),
  });

  // Update lastMessage when we receive a new message
  useEffect(() => {
    if (lastJsonMessage) {
      console.log('WebSocket message received:', lastJsonMessage);
      setLastMessage(lastJsonMessage);
    }
  }, [lastJsonMessage]);

  const sendCommand = useCallback((command) => {
    if (readyState === ReadyState.OPEN) {
      try {
        sendMessage(JSON.stringify(command));
        console.log('Sent command:', command);
        return true;
      } catch (err) {
        console.error('Failed to send command:', err);
        return false;
      }
    } else {
      console.error('WebSocket is not connected');
      return false;
    }
  }, [readyState, sendMessage]);

  const connectionStatus = {
    [ReadyState.CONNECTING]: 'Connecting',
    [ReadyState.OPEN]: 'Connected',
    [ReadyState.CLOSING]: 'Closing',
    [ReadyState.CLOSED]: 'Disconnected',
    [ReadyState.UNINSTANTIATED]: 'Uninstantiated',
  }[readyState];

  return {
    isConnected: readyState === ReadyState.OPEN,
    lastMessage,
    error: readyState === ReadyState.CLOSED ? 'Connection closed' : null,
    sendCommand,
    connectionStatus,
    readyState,
  };
} 