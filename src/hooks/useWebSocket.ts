import { useEffect, useRef, useState, useCallback } from 'react';
import { WebSocketManager, WebSocketConfig, WebSocketMessage, WebSocketState, WebSocketEventHandlers } from '@/services/websocket/WebSocketManager';

export interface UseWebSocketOptions extends Omit<WebSocketConfig, 'url'> {
  autoConnect?: boolean;
  onMessage?: (message: WebSocketMessage) => void;
  onStateChange?: (state: WebSocketState) => void;
  onError?: (error: Event) => void;
}

export interface UseWebSocketReturn {
  state: WebSocketState;
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  send: (message: Omit<WebSocketMessage, 'timestamp' | 'id'>) => boolean;
  stats: {
    state: WebSocketState;
    reconnectAttempts: number;
    queuedMessages: number;
    isConnected: boolean;
  };
  lastMessage: WebSocketMessage | null;
  error: string | null;
}

/**
 * React hook for WebSocket connection management
 * Provides a simple interface for components to connect to WebSocket servers
 * with automatic reconnection and state management.
 */
export function useWebSocket(url: string, options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    autoConnect = true,
    onMessage,
    onStateChange,
    onError,
    ...wsConfig
  } = options;

  const wsManagerRef = useRef<WebSocketManager | null>(null);
  const [state, setState] = useState<WebSocketState>(WebSocketState.DISCONNECTED);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    state: WebSocketState.DISCONNECTED,
    reconnectAttempts: 0,
    queuedMessages: 0,
    isConnected: false
  });

  // Initialize WebSocket manager
  useEffect(() => {
    if (!url) return;

    const config: WebSocketConfig = {
      url,
      ...wsConfig
    };

    wsManagerRef.current = new WebSocketManager(config);

    const handlers: WebSocketEventHandlers = {
      onOpen: () => {
        setError(null);
        updateStats();
      },
      onMessage: (message: WebSocketMessage) => {
        setLastMessage(message);
        if (onMessage) {
          onMessage(message);
        }
        updateStats();
      },
      onClose: () => {
        updateStats();
      },
      onError: (event: Event) => {
        setError('WebSocket connection error');
        if (onError) {
          onError(event);
        }
        updateStats();
      },
      onReconnect: (attempt: number) => {
        setError(`Reconnecting... (attempt ${attempt})`);
        updateStats();
      },
      onReconnectFailed: () => {
        setError('Failed to reconnect after maximum attempts');
        updateStats();
      }
    };

    wsManagerRef.current.setHandlers(handlers);

    // Auto-connect if enabled
    if (autoConnect) {
      wsManagerRef.current.connect().catch((err) => {
        setError(`Failed to connect: ${err.message}`);
      });
    }

    return () => {
      if (wsManagerRef.current) {
        wsManagerRef.current.disconnect();
      }
    };
  }, [url, autoConnect, onMessage, onError]);

  // Update state when WebSocket state changes
  useEffect(() => {
    const interval = setInterval(() => {
      if (wsManagerRef.current) {
        const currentState = wsManagerRef.current.getState();
        if (currentState !== state) {
          setState(currentState);
          if (onStateChange) {
            onStateChange(currentState);
          }
        }
        updateStats();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [state, onStateChange]);

  const updateStats = useCallback(() => {
    if (wsManagerRef.current) {
      setStats(wsManagerRef.current.getStats());
    }
  }, []);

  const connect = useCallback(async (): Promise<void> => {
    if (!wsManagerRef.current) {
      throw new Error('WebSocket manager not initialized');
    }

    try {
      await wsManagerRef.current.connect();
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Connection failed: ${errorMessage}`);
      throw err;
    }
  }, []);

  const disconnect = useCallback((): void => {
    if (wsManagerRef.current) {
      wsManagerRef.current.disconnect();
      setError(null);
    }
  }, []);

  const send = useCallback((message: Omit<WebSocketMessage, 'timestamp' | 'id'>): boolean => {
    if (!wsManagerRef.current) {
      console.warn('WebSocket manager not initialized');
      return false;
    }

    const success = wsManagerRef.current.send(message);
    updateStats();
    return success;
  }, [updateStats]);

  const isConnected = state === WebSocketState.CONNECTED;

  return {
    state,
    isConnected,
    connect,
    disconnect,
    send,
    stats,
    lastMessage,
    error
  };
}

/**
 * Hook for subscribing to specific message types
 */
export function useWebSocketSubscription(
  url: string,
  messageType: string,
  onMessage: (payload: any) => void,
  options: UseWebSocketOptions = {}
) {
  const { lastMessage } = useWebSocket(url, options);

  useEffect(() => {
    if (lastMessage && lastMessage.type === messageType) {
      onMessage(lastMessage.payload);
    }
  }, [lastMessage, messageType, onMessage]);
}

/**
 * Hook for real-time status updates
 */
export function useRealTimeStatus(
  url: string,
  entityId: string,
  options: UseWebSocketOptions = {}
) {
  const [status, setStatus] = useState<any>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const { send, isConnected } = useWebSocket(url, {
    ...options,
    onMessage: (message) => {
      if (message.type === 'status_update' && message.payload.entityId === entityId) {
        setStatus(message.payload.status);
        setLastUpdate(new Date());
      }
      if (options.onMessage) {
        options.onMessage(message);
      }
    }
  });

  // Subscribe to status updates for this entity
  useEffect(() => {
    if (isConnected) {
      send({
        type: 'subscribe_status',
        payload: { entityId }
      });
    }
  }, [isConnected, entityId, send]);

  return {
    status,
    lastUpdate,
    isConnected
  };
}