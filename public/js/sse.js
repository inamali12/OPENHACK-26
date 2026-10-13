/**
 * SHERM - Server-Sent Events (SSE) Client Manager
 */
const SSEManager = {
  eventSource: null,
  reconnectAttempts: 0,
  maxReconnectAttempts: 10,
  reconnectDelay: 2000,
  listeners: {},

  init() {
    this.connect();
  },

  connect() {
    if (this.eventSource) {
      this.eventSource.close();
    }

    const indicator = document.getElementById('sse-indicator');
    const statusText = document.getElementById('sse-status-text');

    try {
      this.eventSource = new EventSource('/api/dashboard/stream');

      this.eventSource.onopen = () => {
        this.reconnectAttempts = 0;
        if (indicator) {
          indicator.classList.remove('reconnecting');
        }
        if (statusText) {
          statusText.textContent = 'LIVE SSE';
        }
      };

      this.eventSource.onerror = () => {
        if (indicator) {
          indicator.classList.add('reconnecting');
        }
        if (statusText) {
          statusText.textContent = 'RECONNECTING';
        }

        this.eventSource.close();
        this.reconnectAttempts++;

        if (this.reconnectAttempts <= this.maxReconnectAttempts) {
          const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 20000);
          setTimeout(() => this.connect(), delay);
        } else {
          if (statusText) statusText.textContent = 'POLLING';
        }
      };

      // Built-in SSE events
      this.eventSource.addEventListener('connected', (e) => {
        // Connected handshake
      });

      this.eventSource.addEventListener('ping', (e) => {
        // Keep-alive received
      });

      this.eventSource.addEventListener('dashboard:refresh', (e) => {
        this.emit('refresh', JSON.parse(e.data));
      });

      this.eventSource.addEventListener('case:created', (e) => {
        this.emit('case:created', JSON.parse(e.data));
        this.emit('refresh', {});
      });

      this.eventSource.addEventListener('case:updated', (e) => {
        this.emit('case:updated', JSON.parse(e.data));
        this.emit('refresh', {});
      });

      this.eventSource.addEventListener('case:closed', (e) => {
        this.emit('case:closed', JSON.parse(e.data));
        this.emit('refresh', {});
      });

      this.eventSource.addEventListener('allocation:confirmed', (e) => {
        this.emit('allocation:confirmed', JSON.parse(e.data));
        this.emit('refresh', {});
      });

      this.eventSource.addEventListener('bed:updated', (e) => {
        this.emit('bed:updated', JSON.parse(e.data));
        this.emit('refresh', {});
      });

      this.eventSource.addEventListener('ambulance:updated', (e) => {
        this.emit('ambulance:updated', JSON.parse(e.data));
        this.emit('refresh', {});
      });
    } catch (err) {
      console.warn('SSE not supported or connection error:', err);
    }
  },

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  },

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach((cb) => cb(data));
    }
  },
};
