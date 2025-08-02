const WS_URL = 'ws://localhost:8081/api/ws';

class WebSocketAPI {
  constructor() {
    this.ws = null;
    this.messageHandlers = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
  }

  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(WS_URL);
        
        this.ws.onopen = () => {
          console.log('WebSocket connected');
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        };

        this.ws.onclose = () => {
          console.log('WebSocket disconnected');
          this.attemptReconnect();
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      setTimeout(() => {
        this.connect().catch(console.error);
      }, this.reconnectDelay * this.reconnectAttempts);
    }
  }

  handleMessage(message) {
    const { type, data } = message;
    
    if (type === 'UIUpdate') {
      // Notify all UI update handlers
      this.messageHandlers.forEach((handler, key) => {
        if (key === 'ui_update') {
          handler(data);
        }
      });
    } else if (type === 'Error') {
      console.error('Server error:', data.message);
      // Notify error handlers
      this.messageHandlers.forEach((handler, key) => {
        if (key === 'error') {
          handler(data.message);
        }
      });
    }
  }

  onUIUpdate(handler) {
    this.messageHandlers.set('ui_update', handler);
  }

  onError(handler) {
    this.messageHandlers.set('error', handler);
  }

  sendCommand(command) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(command));
    } else {
      console.error('WebSocket not connected');
    }
  }

  search(query) {
    this.sendCommand({
      type: 'Search',
      data: { query }
    });
  }

  vote(itemAId, itemBId, preference) {
    this.sendCommand({
      type: 'Vote',
      data: {
        item_a_id: itemAId,
        item_b_id: itemBId,
        preference
      }
    });
  }

  navigateToEntity(entityId) {
    this.sendCommand({
      type: 'NavigateToEntity',
      data: { entity_id: entityId }
    });
  }

  fetchVotingPairs(context) {
    this.sendCommand({
      type: 'FetchVotingPairs',
      data: { context }
    });
  }

  ping() {
    this.sendCommand({
      type: 'Ping'
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.messageHandlers.clear();
  }
}

// Create singleton instance
export const wsAPI = new WebSocketAPI();

// Legacy API for backward compatibility (now deprecated)
export const searchAPI = {
  search: async () => {
    console.warn('HTTP search API is deprecated, use WebSocket API instead');
    throw new Error('Please use WebSocket API');
  }
};