import { useState, useEffect, useRef } from 'react';

import { MaterialRealtimeService, MaterialChangePayload, MaterialSubscriptionCallbacks } from '../services/realtime/materialRealtimeService';
// import { supabase } from '../lib/supabase'; // Fixed: Using window.supabase instead

interface UseMaterialRealtimeOptions {
  materialId?: string;
  autoConnect?: boolean;
  subscribeToImages?: boolean;
  subscribeToMetafields?: boolean;
  subscribeToRelationships?: boolean;
  onError?: (error: Error) => void;
}

interface MaterialRealtimeState {
  isConnected: boolean;
  activeChannels: number;
  reconnectAttempts: number;
  lastUpdate?: string;
  error?: string;
}

export function useMaterialRealtime(options: UseMaterialRealtimeOptions = {}) {
  const [state, setState] = useState<MaterialRealtimeState>({
    isConnected: false,
    activeChannels: 0,
    reconnectAttempts: 0,
  });

  const serviceRef = useRef<MaterialRealtimeService | null>(null);
  const [materialData, setMaterialData] = useState<Record<string, unknown> | null>(null);
  const [imageUpdates, setImageUpdates] = useState<MaterialChangePayload[]>([]);
  const [metafieldUpdates, setMetafieldUpdates] = useState<MaterialChangePayload[]>([]);
  const [relationshipUpdates, setRelationshipUpdates] = useState<MaterialChangePayload[]>([]);

  useEffect(() => {
    // Initialize service
    const service = new MaterialRealtimeService({
      supabaseUrl: (window as any).supabase?.supabaseUrl || '',
      supabaseAnonKey: (window as any).supabase?.supabaseKey || '',
      authToken: (window as any).supabase?.auth?.session()?.access_token,
    });

    const callbacks: MaterialSubscriptionCallbacks = {
      onMaterialChange: (payload) => {
        console.log('Material change received:', payload);

        if (payload.new) {
          setMaterialData((prev: Record<string, unknown> | null) => ({
            ...(prev || {}),
            ...(payload.new as Record<string, unknown>),
          }));
        }

        setState(prev => ({
          ...prev,
          lastUpdate: payload.timestamp,
        }));
      },

      onImageChange: (payload) => {
        console.log('Image change received:', payload);

        setImageUpdates(prev => [payload, ...prev.slice(0, 9)]); // Keep last 10 updates

        setState(prev => ({
          ...prev,
          lastUpdate: payload.timestamp,
        }));
      },

      onMetafieldChange: (payload) => {
        console.log('Metafield change received:', payload);

        setMetafieldUpdates(prev => [payload, ...prev.slice(0, 9)]); // Keep last 10 updates

        setState(prev => ({
          ...prev,
          lastUpdate: payload.timestamp,
        }));
      },

      onRelationshipChange: (payload) => {
        console.log('Relationship change received:', payload);

        setRelationshipUpdates(prev => [payload, ...prev.slice(0, 9)]); // Keep last 10 updates

        setState(prev => ({
          ...prev,
          lastUpdate: payload.timestamp,
        }));
      },

      onConnected: () => {
        setState(prev => ({
          ...prev,
          isConnected: true,
          error: undefined,
        }));
      },

      onDisconnected: () => {
        setState(prev => ({
          ...prev,
          isConnected: false,
        }));
      },

      onError: (error) => {
        console.error('Material realtime error:', error);
        setState(prev => ({
          ...prev,
          error: error.message,
        }));
        options.onError?.(error);
      },
    };

    service.setCallbacks(callbacks);
    serviceRef.current = service;

    // Auto-connect if enabled
    if (options.autoConnect !== false) {
      service.connect().then(() => {
        // Set up subscriptions based on options
        const subscriptionConfig = {
          materials: true,
          images: options.subscribeToImages !== false,
          metafields: options.subscribeToMetafields !== false,
          relationships: options.subscribeToRelationships !== false,
          materialId: options.materialId,
        };

        service.configureSubscriptions(subscriptionConfig);
      }).catch(error => {
        console.error('Failed to auto-connect:', error);
        setState(prev => ({
          ...prev,
          error: error.message,
        }));
      });
    }

    // Cleanup
    return () => {
      service.disconnect().catch(console.error);
    };
  }, [options.materialId, options.autoConnect]);

  // Update connection status periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (serviceRef.current) {
        const status = serviceRef.current.getConnectionStatus();
        setState(prev => ({
          ...prev,
          isConnected: status.isConnected,
          activeChannels: status.activeChannels,
          reconnectAttempts: status.reconnectAttempts,
        }));
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const connect = async () => {
    if (serviceRef.current) {
      await serviceRef.current.connect();
    }
  };

  const disconnect = async () => {
    if (serviceRef.current) {
      await serviceRef.current.disconnect();
    }
  };

  const subscribeToMaterial = async (materialId: string) => {
    if (serviceRef.current) {
      await serviceRef.current.subscribeToMaterial(materialId);
    }
  };

  const unsubscribeFromMaterial = async (materialId: string) => {
    if (serviceRef.current) {
      await serviceRef.current.unsubscribeFromMaterial(materialId);
    }
  };

  const clearUpdates = () => {
    setImageUpdates([]);
    setMetafieldUpdates([]);
    setRelationshipUpdates([]);
  };

  return {
    // Connection state
    ...state,

    // Data state
    materialData,
    imageUpdates,
    metafieldUpdates,
    relationshipUpdates,

    // Actions
    connect,
    disconnect,
    subscribeToMaterial,
    unsubscribeFromMaterial,
    clearUpdates,

    // Service reference for advanced usage
    service: serviceRef.current,
  };
}

// Hook for monitoring specific material in real-time
export function useMaterialMonitor(materialId: string) {
  return useMaterialRealtime({
    materialId,
    autoConnect: true,
    subscribeToImages: true,
    subscribeToMetafields: true,
    subscribeToRelationships: true,
  });
}

// Hook for monitoring all material changes (admin/dashboard use)
export function useMaterialsOverview() {
  return useMaterialRealtime({
    autoConnect: true,
    subscribeToImages: true,
    subscribeToMetafields: true,
    subscribeToRelationships: true,
  });
}

// Hook for specific data type monitoring
export function useMaterialImageUpdates(materialId?: string) {
  return useMaterialRealtime({
    materialId,
    autoConnect: true,
    subscribeToImages: true,
    subscribeToMetafields: false,
    subscribeToRelationships: false,
  });
}

export function useMaterialMetafieldUpdates(materialId?: string) {
  return useMaterialRealtime({
    materialId,
    autoConnect: true,
    subscribeToImages: false,
    subscribeToMetafields: true,
    subscribeToRelationships: false,
  });
}

export function useMaterialRelationshipUpdates(materialId?: string) {
  return useMaterialRealtime({
    materialId,
    autoConnect: true,
    subscribeToImages: false,
    subscribeToMetafields: false,
    subscribeToRelationships: true,
  });
}
