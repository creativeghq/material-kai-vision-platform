import { createClient, RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { useState, useEffect, useCallback } from 'react';

export interface MaterialRealtimeConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  authToken?: string;
}

export interface MaterialChangePayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  table: 'materials_catalog' | 'material_images' | 'material_metafield_values' | 'material_relationships';
  old?: any;
  new?: any;
  materialId?: string;
  timestamp: string;
}

export interface MaterialSubscriptionCallbacks {
  onMaterialChange?: (payload: MaterialChangePayload) => void;
  onImageChange?: (payload: MaterialChangePayload) => void;
  onMetafieldChange?: (payload: MaterialChangePayload) => void;
  onRelationshipChange?: (payload: MaterialChangePayload) => void;
  onError?: (error: Error) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

export class MaterialRealtimeService {
  private supabase: any;
  private channels: Map<string, RealtimeChannel> = new Map();
  private isConnected: boolean = false;
  private callbacks: MaterialSubscriptionCallbacks = {};
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000;

  constructor(config: MaterialRealtimeConfig) {
    this.supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
          heartbeatIntervalMs: 30000
        }
      }
    });

    // Set auth token if provided
    if (config.authToken) {
      this.supabase.auth.setSession({
        access_token: config.authToken,
        refresh_token: ''
      });
    }

    this.setupConnectionHandlers();
  }

  private setupConnectionHandlers(): void {
    // Handle connection events
    this.supabase.realtime.onOpen(() => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      console.log('Material Realtime: Connected to Supabase Realtime');
      this.callbacks.onConnected?.();
    });

    this.supabase.realtime.onClose(() => {
      this.isConnected = false;
      console.log('Material Realtime: Disconnected from Supabase Realtime');
      this.callbacks.onDisconnected?.();
      this.handleReconnection();
    });

    this.supabase.realtime.onError((error: Error) => {
      console.error('Material Realtime: Connection error:', error);
      this.callbacks.onError?.(error);
      this.handleReconnection();
    });
  }

  private async handleReconnection(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Material Realtime: Max reconnection attempts reached');
      this.callbacks.onError?.(new Error('Failed to reconnect after maximum attempts'));
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff

    console.log(`Material Realtime: Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  public setCallbacks(callbacks: MaterialSubscriptionCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  public async connect(): Promise<void> {
    try {
      if (this.isConnected) {
        console.log('Material Realtime: Already connected');
        return;
      }

      console.log('Material Realtime: Connecting to Supabase Realtime...');
      
      // Remove existing channels
      this.channels.forEach(channel => {
        this.supabase.removeChannel(channel);
      });
      this.channels.clear();

      await this.supabase.realtime.connect();
      
    } catch (error) {
      console.error('Material Realtime: Failed to connect:', error);
      this.callbacks.onError?.(error as Error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      console.log('Material Realtime: Disconnecting...');
      
      // Unsubscribe from all channels
      this.channels.forEach(channel => {
        channel.unsubscribe();
      });
      this.channels.clear();

      await this.supabase.realtime.disconnect();
      this.isConnected = false;
      
      console.log('Material Realtime: Disconnected successfully');
    } catch (error) {
      console.error('Material Realtime: Error during disconnect:', error);
      throw error;
    }
  }

  // Subscribe to all material-related changes
  public async subscribeToAllMaterialChanges(): Promise<void> {
    await this.subscribeToMaterialCatalogChanges();
    await this.subscribeToMaterialImagesChanges();
    await this.subscribeToMaterialMetafieldChanges();
    await this.subscribeToMaterialRelationshipChanges();
  }

  // Subscribe to materials catalog changes
  public async subscribeToMaterialCatalogChanges(materialId?: string): Promise<void> {
    const channelName = materialId ? `materials_catalog_${materialId}` : 'materials_catalog_all';
    
    if (this.channels.has(channelName)) {
      console.log(`Material Realtime: Already subscribed to ${channelName}`);
      return;
    }

    const channel = this.supabase.channel(channelName);

    // Configure subscription filters
    let subscription = channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'materials_catalog',
        ...(materialId && { filter: `id=eq.${materialId}` })
      },
      (payload: RealtimePostgresChangesPayload<any>) => {
        console.log('Material Realtime: Material catalog change:', payload);
        
        const changePayload: MaterialChangePayload = {
          eventType: payload.eventType as any,
          table: 'materials_catalog',
          old: payload.old,
          new: payload.new,
          materialId: payload.new?.id || payload.old?.id,
          timestamp: new Date().toISOString()
        };

        this.callbacks.onMaterialChange?.(changePayload);
      }
    );

    subscription.subscribe((status: string) => {
      console.log(`Material Realtime: Materials catalog subscription status: ${status}`);
      if (status === 'SUBSCRIBED') {
        this.channels.set(channelName, channel);
      } else if (status === 'CHANNEL_ERROR') {
        this.callbacks.onError?.(new Error(`Failed to subscribe to materials catalog: ${channelName}`));
      }
    });
  }

  // Subscribe to material images changes
  public async subscribeToMaterialImagesChanges(materialId?: string): Promise<void> {
    const channelName = materialId ? `material_images_${materialId}` : 'material_images_all';
    
    if (this.channels.has(channelName)) {
      console.log(`Material Realtime: Already subscribed to ${channelName}`);
      return;
    }

    const channel = this.supabase.channel(channelName);

    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'material_images',
        ...(materialId && { filter: `material_id=eq.${materialId}` })
      },
      (payload: RealtimePostgresChangesPayload<any>) => {
        console.log('Material Realtime: Material images change:', payload);
        
        const changePayload: MaterialChangePayload = {
          eventType: payload.eventType as any,
          table: 'material_images',
          old: payload.old,
          new: payload.new,
          materialId: payload.new?.material_id || payload.old?.material_id,
          timestamp: new Date().toISOString()
        };

        this.callbacks.onImageChange?.(changePayload);
      }
    ).subscribe((status: string) => {
      console.log(`Material Realtime: Material images subscription status: ${status}`);
      if (status === 'SUBSCRIBED') {
        this.channels.set(channelName, channel);
      } else if (status === 'CHANNEL_ERROR') {
        this.callbacks.onError?.(new Error(`Failed to subscribe to material images: ${channelName}`));
      }
    });
  }

  // Subscribe to material metafield values changes
  public async subscribeToMaterialMetafieldChanges(materialId?: string, fieldId?: string): Promise<void> {
    const channelName = materialId && fieldId 
      ? `material_metafields_${materialId}_${fieldId}`
      : materialId 
        ? `material_metafields_${materialId}`
        : 'material_metafields_all';
    
    if (this.channels.has(channelName)) {
      console.log(`Material Realtime: Already subscribed to ${channelName}`);
      return;
    }

    const channel = this.supabase.channel(channelName);

    let filter = '';
    if (materialId && fieldId) {
      filter = `material_id=eq.${materialId} AND field_id=eq.${fieldId}`;
    } else if (materialId) {
      filter = `material_id=eq.${materialId}`;
    }

    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'material_metafield_values',
        ...(filter && { filter })
      },
      (payload: RealtimePostgresChangesPayload<any>) => {
        console.log('Material Realtime: Material metafield change:', payload);
        
        const changePayload: MaterialChangePayload = {
          eventType: payload.eventType as any,
          table: 'material_metafield_values',
          old: payload.old,
          new: payload.new,
          materialId: payload.new?.material_id || payload.old?.material_id,
          timestamp: new Date().toISOString()
        };

        this.callbacks.onMetafieldChange?.(changePayload);
      }
    ).subscribe((status: string) => {
      console.log(`Material Realtime: Material metafields subscription status: ${status}`);
      if (status === 'SUBSCRIBED') {
        this.channels.set(channelName, channel);
      } else if (status === 'CHANNEL_ERROR') {
        this.callbacks.onError?.(new Error(`Failed to subscribe to material metafields: ${channelName}`));
      }
    });
  }

  // Subscribe to material relationships changes
  public async subscribeToMaterialRelationshipChanges(materialId?: string): Promise<void> {
    const channelName = materialId ? `material_relationships_${materialId}` : 'material_relationships_all';
    
    if (this.channels.has(channelName)) {
      console.log(`Material Realtime: Already subscribed to ${channelName}`);
      return;
    }

    const channel = this.supabase.channel(channelName);

    const filter = materialId 
      ? `parent_material_id=eq.${materialId} OR related_material_id=eq.${materialId}`
      : '';

    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'material_relationships',
        ...(filter && { filter })
      },
      (payload: RealtimePostgresChangesPayload<any>) => {
        console.log('Material Realtime: Material relationships change:', payload);
        
        const changePayload: MaterialChangePayload = {
          eventType: payload.eventType as any,
          table: 'material_relationships',
          old: payload.old,
          new: payload.new,
          materialId: payload.new?.parent_material_id || payload.old?.parent_material_id,
          timestamp: new Date().toISOString()
        };

        this.callbacks.onRelationshipChange?.(changePayload);
      }
    ).subscribe((status: string) => {
      console.log(`Material Realtime: Material relationships subscription status: ${status}`);
      if (status === 'SUBSCRIBED') {
        this.channels.set(channelName, channel);
      } else if (status === 'CHANNEL_ERROR') {
        this.callbacks.onError?.(new Error(`Failed to subscribe to material relationships: ${channelName}`));
      }
    });
  }

  // Subscribe to specific material and all its related data
  public async subscribeToMaterial(materialId: string): Promise<void> {
    console.log(`Material Realtime: Setting up comprehensive subscription for material: ${materialId}`);
    
    await Promise.all([
      this.subscribeToMaterialCatalogChanges(materialId),
      this.subscribeToMaterialImagesChanges(materialId),
      this.subscribeToMaterialMetafieldChanges(materialId),
      this.subscribeToMaterialRelationshipChanges(materialId)
    ]);

    console.log(`Material Realtime: Comprehensive subscription active for material: ${materialId}`);
  }

  // Unsubscribe from specific material
  public async unsubscribeFromMaterial(materialId: string): Promise<void> {
    const channelsToRemove = [
      `materials_catalog_${materialId}`,
      `material_images_${materialId}`,
      `material_metafields_${materialId}`,
      `material_relationships_${materialId}`
    ];

    channelsToRemove.forEach(channelName => {
      const channel = this.channels.get(channelName);
      if (channel) {
        channel.unsubscribe();
        this.channels.delete(channelName);
        console.log(`Material Realtime: Unsubscribed from ${channelName}`);
      }
    });
  }

  // Get connection status
  public getConnectionStatus(): {
    isConnected: boolean;
    activeChannels: number;
    reconnectAttempts: number;
  } {
    return {
      isConnected: this.isConnected,
      activeChannels: this.channels.size,
      reconnectAttempts: this.reconnectAttempts
    };
  }

  // Get list of active subscriptions
  public getActiveSubscriptions(): string[] {
    return Array.from(this.channels.keys());
  }

  // Enable/disable specific subscription types
  public async configureSubscriptions(config: {
    materials?: boolean;
    images?: boolean;
    metafields?: boolean;
    relationships?: boolean;
    materialId?: string;
  }): Promise<void> {
    if (config.materialId) {
      // Configure for specific material
      if (config.materials) {
        await this.subscribeToMaterialCatalogChanges(config.materialId);
      }
      if (config.images) {
        await this.subscribeToMaterialImagesChanges(config.materialId);
      }
      if (config.metafields) {
        await this.subscribeToMaterialMetafieldChanges(config.materialId);
      }
      if (config.relationships) {
        await this.subscribeToMaterialRelationshipChanges(config.materialId);
      }
    } else {
      // Configure for all materials
      if (config.materials) {
        await this.subscribeToMaterialCatalogChanges();
      }
      if (config.images) {
        await this.subscribeToMaterialImagesChanges();
      }
      if (config.metafields) {
        await this.subscribeToMaterialMetafieldChanges();
      }
      if (config.relationships) {
        await this.subscribeToMaterialRelationshipChanges();
      }
    }
  }
}

// React Hook for Material Realtime
export function useMaterialRealtime(
  config: MaterialRealtimeConfig,
  callbacks: MaterialSubscriptionCallbacks,
  options: {
    autoConnect?: boolean;
    subscribeToAll?: boolean;
    materialId?: string;
  } = {}
) {
  const [service, setService] = useState<MaterialRealtimeService | null>(null);
  const [connectionStatus, setConnectionStatus] = useState({
    isConnected: false,
    activeChannels: 0,
    reconnectAttempts: 0
  });

  useEffect(() => {
    const realtimeService = new MaterialRealtimeService(config);
    
    // Set up callbacks with connection status updates
    realtimeService.setCallbacks({
      ...callbacks,
      onConnected: () => {
        setConnectionStatus(realtimeService.getConnectionStatus());
        callbacks.onConnected?.();
      },
      onDisconnected: () => {
        setConnectionStatus(realtimeService.getConnectionStatus());
        callbacks.onDisconnected?.();
      },
      onError: (error) => {
        setConnectionStatus(realtimeService.getConnectionStatus());
        callbacks.onError?.(error);
      }
    });

    setService(realtimeService);

    // Auto-connect if enabled
    if (options.autoConnect !== false) {
      realtimeService.connect().then(() => {
        // Set up subscriptions
        if (options.subscribeToAll) {
          realtimeService.subscribeToAllMaterialChanges();
        } else if (options.materialId) {
          realtimeService.subscribeToMaterial(options.materialId);
        }
      }).catch(error => {
        console.error('Material Realtime: Auto-connect failed:', error);
        callbacks.onError?.(error);
      });
    }

    // Cleanup on unmount
    return () => {
      realtimeService.disconnect().catch(console.error);
    };
  }, [config.supabaseUrl, config.supabaseAnonKey, config.authToken]);

  const connect = useCallback(async () => {
    if (service) {
      await service.connect();
      setConnectionStatus(service.getConnectionStatus());
    }
  }, [service]);

  const disconnect = useCallback(async () => {
    if (service) {
      await service.disconnect();
      setConnectionStatus(service.getConnectionStatus());
    }
  }, [service]);

  const subscribeToMaterial = useCallback(async (materialId: string) => {
    if (service) {
      await service.subscribeToMaterial(materialId);
      setConnectionStatus(service.getConnectionStatus());
    }
  }, [service]);

  const unsubscribeFromMaterial = useCallback(async (materialId: string) => {
    if (service) {
      await service.unsubscribeFromMaterial(materialId);
      setConnectionStatus(service.getConnectionStatus());
    }
  }, [service]);

  return {
    service,
    connectionStatus,
    connect,
    disconnect,
    subscribeToMaterial,
    unsubscribeFromMaterial,
    activeSubscriptions: service?.getActiveSubscriptions() || []
  };
}

// Material Change Event Types for type safety
export type MaterialCatalogChange = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  materialId: string;
  material?: {
    id: string;
    name: string;
    category: string;
    description?: string;
    properties?: any;
    created_at: string;
    updated_at: string;
  };
  changes?: Partial<any>;
};

export type MaterialImageChange = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  imageId: string;
  materialId: string;
  image?: {
    id: string;
    material_id: string;
    image_url: string;
    image_type: string;
    is_featured: boolean;
    display_order: number;
  };
};

export type MaterialMetafieldChange = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  valueId: string;
  materialId: string;
  fieldId: string;
  metafieldValue?: {
    id: string;
    material_id: string;
    field_id: string;
    value_text?: string;
    value_number?: number;
    value_boolean?: boolean;
    confidence_score?: number;
  };
};

export type MaterialRelationshipChange = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  relationshipId: string;
  parentMaterialId: string;
  relatedMaterialId: string;
  relationship?: {
    id: string;
    parent_material_id: string;
    related_material_id: string;
    relationship_type: string;
    relationship_strength: number;
  };
};

// Helper function to create service instance
export function createMaterialRealtimeService(config: MaterialRealtimeConfig): MaterialRealtimeService {
  return new MaterialRealtimeService(config);
}

// Default export
export default MaterialRealtimeService;