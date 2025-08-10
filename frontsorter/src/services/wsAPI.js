// Simple WebSocket API using react-use-websocket
// This replaces the complex custom implementation

export const WS_URL = 'ws://localhost:8081/api/ws';

// Command builders - these create the JSON messages to send
export const createUpdateQueryCommand = (query) => ({
  type: 'UpdateQuery',
  data: { query }
});

export const createVoteCommand = (itemAId, itemBId, preference) => ({
  type: 'Vote',
  data: {
    item_a_id: itemAId,
    item_b_id: itemBId,
    preference
  }
});

export const createNavigateToEntityCommand = (entityId) => ({
  type: 'NavigateToEntity',
  data: { entity_id: entityId }
});

export const createFetchVotingPairsCommand = (context) => ({
  type: 'FetchVotingPairs',
  data: { context }
});

export const createPingCommand = () => ({
  type: 'Ping'
});

// Helper: send a fully-formed command object (continuation)
export const sendCommand = (sendJsonMessage, commandObject) => {
  try {
    sendJsonMessage(commandObject);
  } catch (e) {
    console.error('Failed to send command', e);
  }
};

// Message handler - processes incoming messages
export const handleWebSocketMessage = (message, onUIUpdate, onError) => {
  try {
    const parsedMessage = typeof message === 'string' ? JSON.parse(message) : message;
    const { type, data } = parsedMessage;
    
    if (type === 'UIUpdate') {
      onUIUpdate(data);
    } else if (type === 'Error') {
      console.error('Server error:', data.message);
      onError(data.message);
    }
  } catch (error) {
    console.error('Failed to parse WebSocket message:', error);
    onError('Failed to parse server message');
  }
};
