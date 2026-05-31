import { supabase } from '../../integrations/supabase/client';

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

// Mirrors the real public.api_usage_logs columns (request-shaped).
export interface ApiUsageLog {
  id: string;
  user_id: string | null;
  endpoint_id: string | null;
  request_path: string;
  request_method: string;
  response_status: number | null;
  response_time_ms: number | null;
  ip_address: string | null;
  user_agent: string | null;
  is_internal_request: boolean;
  rate_limit_exceeded: boolean;
  created_at: string | null;
}

class ApiGatewayService {
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

  async generateApiKey(
    userId: string,
    keyName: string,
    options?: {
      rateLimit?: number;
      allowedEndpoints?: string[];
      expiresAt?: string;
    },
  ): Promise<ApiKey> {
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
    const { error } = await supabase.from('api_keys').delete().eq('id', id);

    if (error) throw error;
  }

  // ============= Usage Analytics =============
  async getApiUsageLogs(options?: {
    startDate?: string;
    endDate?: string;
    endpoint?: string;
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
    if (options?.endpoint) {
      // `endpoint` here is the request path (the function name / route).
      query = query.eq('request_path', options.endpoint);
    }
    if (options?.userId) {
      query = query.eq('user_id', options.userId);
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) throw error;
    return (data || []) as ApiUsageLog[];
  }

  // ============= Utility Functions =============
  private generateSecureKey(length: number): string {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}

export const apiGatewayService = new ApiGatewayService();
