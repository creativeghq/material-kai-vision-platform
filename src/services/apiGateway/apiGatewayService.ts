import { supabase } from '../../integrations/supabase/client';

export interface ApiEndpoint {
  id: string;
  path: string;
  method: string;
  category: string;
  description?: string;
  is_public: boolean;
  is_internal: boolean;
  rate_limit_per_minute: number;
  created_at: string;
  updated_at: string;
}

export interface ApiAccessControl {
  id: string;
  endpoint_id: string;
  network_type: 'internal' | 'external' | 'both';
  rate_limit_override?: number;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface InternalNetwork {
  id: string;
  name: string;
  cidr_range: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApiKey {
  id: string;
  user_id?: string;
  key_name: string;
  api_key: string;
  is_active: boolean;
  rate_limit_override?: number;
  allowed_endpoints?: string[];
  expires_at?: string;
  last_used_at?: string;
  created_at: string;
  updated_at: string;
}

export interface RateLimitRule {
  id: string;
  name: string;
  target_type: 'ip' | 'cidr' | 'user' | 'api_key';
  target_value: string;
  requests_per_minute: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApiUsageLog {
  id: string;
  endpoint_id?: string;
  user_id?: string;
  ip_address: string;
  user_agent?: string;
  request_method: string;
  request_path: string;
  response_status?: number;
  response_time_ms?: number;
  is_internal_request: boolean;
  rate_limit_exceeded: boolean;
  created_at: string;
}

class ApiGatewayService {
  // ============= API Endpoints Management =============
  async getAllEndpoints(): Promise<ApiEndpoint[]> {
    const { data, error } = await supabase
      .from('api_endpoints')
      .select('*')
      .order('category', { ascending: true })
      .order('path', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async getEndpointById(id: string): Promise<ApiEndpoint | null> {
    const { data, error } = await supabase
      .from('api_endpoints')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  async createEndpoint(endpoint: Omit<ApiEndpoint, 'id' | 'created_at' | 'updated_at'>): Promise<ApiEndpoint> {
    const { data, error } = await supabase
      .from('api_endpoints')
      .insert(endpoint)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateEndpoint(id: string, updates: Partial<ApiEndpoint>): Promise<ApiEndpoint> {
    const { data, error } = await supabase
      .from('api_endpoints')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deleteEndpoint(id: string): Promise<void> {
    const { error } = await supabase
      .from('api_endpoints')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  async toggleEndpointPublicAccess(id: string, isPublic: boolean): Promise<ApiEndpoint> {
    return this.updateEndpoint(id, { is_public: isPublic });
  }

  async toggleEndpointInternalAccess(id: string, isInternal: boolean): Promise<ApiEndpoint> {
    return this.updateEndpoint(id, { is_internal: isInternal });
  }

  // ============= Internal Networks Management =============
  async getAllInternalNetworks(): Promise<InternalNetwork[]> {
    const { data, error } = await supabase
      .from('internal_networks')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  async createInternalNetwork(network: Omit<InternalNetwork, 'id' | 'created_at' | 'updated_at'>): Promise<InternalNetwork> {
    const { data, error } = await supabase
      .from('internal_networks')
      .insert(network)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateInternalNetwork(id: string, updates: Partial<InternalNetwork>): Promise<InternalNetwork> {
    const { data, error } = await supabase
      .from('internal_networks')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async deleteInternalNetwork(id: string): Promise<void> {
    const { error } = await supabase
      .from('internal_networks')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  // ============= API Keys Management =============
  async getUserApiKeys(userId: string): Promise<ApiKey[]> {
    const { data, error } = await supabase
      .from('api_keys')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async getAllApiKeys(): Promise<ApiKey[]> {
    const { data, error } = await supabase
      .from('api_keys')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async generateApiKey(userId: string, keyName: string, options?: {
    rateLimit?: number;
    allowedEndpoints?: string[];
    expiresAt?: string;
  }): Promise<ApiKey> {
    // Generate a secure API key
    const apiKey = `kai_${this.generateSecureKey(32)}`;

    const { data, error } = await supabase
      .from('api_keys')
      .insert({
        user_id: userId,
        key_name: keyName,
        api_key: apiKey,
        rate_limit_override: options?.rateLimit,
        allowed_endpoints: options?.allowedEndpoints,
        expires_at: options?.expiresAt,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async revokeApiKey(id: string): Promise<void> {
    const { error } = await supabase
      .from('api_keys')
      .update({ is_active: false })
      .eq('id', id);

    if (error) throw error;
  }

  async deleteApiKey(id: string): Promise<void> {
    const { error } = await supabase
      .from('api_keys')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  // ============= Rate Limiting =============
  async getAllRateLimitRules(): Promise<RateLimitRule[]> {
    const { data, error } = await supabase
      .from('rate_limit_rules')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    return (data || []) as RateLimitRule[];
  }

  async createRateLimitRule(rule: Omit<RateLimitRule, 'id' | 'created_at' | 'updated_at'>): Promise<RateLimitRule> {
    const { data, error } = await supabase
      .from('rate_limit_rules')
      .insert(rule)
      .select()
      .single();

    if (error) throw error;
    return data as RateLimitRule;
  }

  async updateRateLimitRule(id: string, updates: Partial<RateLimitRule>): Promise<RateLimitRule> {
    const { data, error } = await supabase
      .from('rate_limit_rules')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data as RateLimitRule;
  }

  async deleteRateLimitRule(id: string): Promise<void> {
    const { error } = await supabase
      .from('rate_limit_rules')
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  // ============= Usage Analytics =============
  async getApiUsageLogs(options?: {
    startDate?: string;
    endDate?: string;
    endpointId?: string;
    userId?: string;
    limit?: number;
  }): Promise<ApiUsageLog[]> {
    let query = supabase
      .from('api_usage_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (options?.startDate) {
      query = query.gte('created_at', options.startDate);
    }
    if (options?.endDate) {
      query = query.lte('created_at', options.endDate);
    }
    if (options?.endpointId) {
      query = query.eq('endpoint_id', options.endpointId);
    }
    if (options?.userId) {
      query = query.eq('user_id', options.userId);
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) throw error;
    return (data || []).map(log => ({
      ...log,
      ip_address: String(log.ip_address || ''),
    })) as ApiUsageLog[];
  }

  async getUsageStats(options?: {
    startDate?: string;
    endDate?: string;
  }): Promise<{
    totalRequests: number;
    successfulRequests: number;
    rateLimitedRequests: number;
    avgResponseTime: number;
    topEndpoints: Array<{ path: string; count: number }>;
    requestsByHour: Array<{ hour: string; count: number }>;
  }> {
    // This would typically be implemented with aggregation queries
    // For now, we'll fetch logs and process them client-side
    const logs = await this.getApiUsageLogs({
      startDate: options?.startDate,
      endDate: options?.endDate,
      limit: 10000,
    });

    const totalRequests = logs.length;
    const successfulRequests = logs.filter(log =>
      log.response_status && log.response_status >= 200 && log.response_status < 400,
    ).length;
    const rateLimitedRequests = logs.filter(log => log.rate_limit_exceeded).length;

    const responseTimesFiltered = logs
      .map(log => log.response_time_ms)
      .filter((time): time is number => time !== null && time !== undefined);
    const avgResponseTime = responseTimesFiltered.length > 0
      ? responseTimesFiltered.reduce((a, b) => a + b, 0) / responseTimesFiltered.length
      : 0;

    // Calculate top endpoints
    const endpointCounts: Record<string, number> = {};
    logs.forEach(log => {
      endpointCounts[log.request_path] = (endpointCounts[log.request_path] || 0) + 1;
    });
    const topEndpoints = Object.entries(endpointCounts)
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Calculate requests by hour
    const hourCounts: Record<string, number> = {};
    logs.forEach(log => {
      const hour = new Date(log.created_at).toISOString().substring(0, 13);
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });
    const requestsByHour = Object.entries(hourCounts)
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => a.hour.localeCompare(b.hour));

    return {
      totalRequests,
      successfulRequests,
      rateLimitedRequests,
      avgResponseTime,
      topEndpoints,
      requestsByHour,
    };
  }

  // ============= Network Checking =============
  async isInternalIP(ipAddress: string): Promise<boolean> {
    const { data, error } = await supabase
      .rpc('is_internal_ip', { ip_addr: ipAddress });

    if (error) throw error;
    return data || false;
  }

  async getRateLimit(endpointPath: string, ipAddress: string, userId?: string): Promise<number> {
    const { data, error } = await supabase
      .rpc('get_rate_limit', {
        endpoint_path: endpointPath,
        ip_addr: ipAddress,
        user_id_param: userId,
      });

    if (error) throw error;
    return data || 30;
  }

  // ============= Batch Operations =============
  async seedDefaultEndpoints(): Promise<void> {
    const defaultEndpoints = await this.getDefaultEndpoints();

    for (const endpoint of defaultEndpoints) {
      try {
        await this.createEndpoint(endpoint);
      } catch (error) {
        // Skip if endpoint already exists
        console.log(`Endpoint ${endpoint.path} already exists or failed to create`);
      }
    }
  }

  private async getDefaultEndpoints(): Promise<Omit<ApiEndpoint, 'id' | 'created_at' | 'updated_at'>[]> {
    // This would be based on your API documentation
    return [
      // Authentication APIs
      { path: '/api/auth/login', method: 'POST', category: 'auth', description: 'User login', is_public: true, is_internal: true, rate_limit_per_minute: 20 },
      { path: '/api/auth/register', method: 'POST', category: 'auth', description: 'User registration', is_public: true, is_internal: true, rate_limit_per_minute: 10 },
      { path: '/api/auth/refresh-token', method: 'POST', category: 'auth', description: 'Refresh authentication token', is_public: true, is_internal: true, rate_limit_per_minute: 60 },

      // User Management APIs
      { path: '/api/users/profile', method: 'GET', category: 'users', description: 'Get user profile', is_public: true, is_internal: true, rate_limit_per_minute: 30 },
      { path: '/api/users/profile', method: 'PUT', category: 'users', description: 'Update user profile', is_public: true, is_internal: true, rate_limit_per_minute: 10 },

      // Material APIs
      { path: '/api/materials', method: 'GET', category: 'materials', description: 'List materials', is_public: true, is_internal: true, rate_limit_per_minute: 60 },
      { path: '/api/materials/:id', method: 'GET', category: 'materials', description: 'Get material by ID', is_public: true, is_internal: true, rate_limit_per_minute: 60 },
      { path: '/api/materials', method: 'POST', category: 'materials', description: 'Create new material', is_public: true, is_internal: true, rate_limit_per_minute: 30 },
      { path: '/api/materials/:id', method: 'PUT', category: 'materials', description: 'Update material', is_public: true, is_internal: true, rate_limit_per_minute: 20 },
      { path: '/api/materials/:id', method: 'DELETE', category: 'materials', description: 'Delete material', is_public: false, is_internal: true, rate_limit_per_minute: 10 },

      // Recognition APIs
      { path: '/api/recognition', method: 'POST', category: 'recognition', description: 'Recognize material', is_public: true, is_internal: true, rate_limit_per_minute: 20 },
      { path: '/api/recognition/batch', method: 'POST', category: 'recognition', description: 'Batch recognition', is_public: true, is_internal: true, rate_limit_per_minute: 5 },

      // Search APIs
      { path: '/api/search', method: 'GET', category: 'search', description: 'Unified search', is_public: true, is_internal: true, rate_limit_per_minute: 60 },
      { path: '/api/search/vector', method: 'POST', category: 'search', description: 'Vector similarity search', is_public: true, is_internal: true, rate_limit_per_minute: 30 },

      // Analytics APIs
      { path: '/api/analytics/events', method: 'POST', category: 'analytics', description: 'Track analytics event', is_public: true, is_internal: true, rate_limit_per_minute: 100 },
      { path: '/api/analytics/events', method: 'GET', category: 'analytics', description: 'Get analytics events', is_public: false, is_internal: true, rate_limit_per_minute: 30 },

      // ML Service APIs
      { path: '/api/ml/inference', method: 'POST', category: 'ml', description: 'Run model inference', is_public: true, is_internal: true, rate_limit_per_minute: 30 },
      { path: '/api/ml/embeddings', method: 'POST', category: 'ml', description: 'Generate embeddings', is_public: true, is_internal: true, rate_limit_per_minute: 30 },

      // Admin APIs
      { path: '/api/admin/users', method: 'GET', category: 'admin', description: 'List all users (admin)', is_public: false, is_internal: true, rate_limit_per_minute: 20 },
      { path: '/api/admin/settings', method: 'GET', category: 'admin', description: 'Get system settings', is_public: false, is_internal: true, rate_limit_per_minute: 10 },
    ];
  }

  // ============= Utility Functions =============
  private generateSecureKey(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}

export const apiGatewayService = new ApiGatewayService();
