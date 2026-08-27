import { supabase } from '../../integrations/supabase/client';

export interface ApiKey {
  id: string;
  user_id?: string;
  key_name: string;
  /** First 12 characters, for display. The rest is not stored anywhere (#390). */
  key_prefix?: string;
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

/** Cap for an unfiltered api_usage_logs read. The table is 216,737 rows / 50 MB and grows on
 *  every request; no admin view needs more than this at once. */
const DEFAULT_USAGE_LOG_LIMIT = 500;

//: The columns a LIST needs. Deliberately not `select('*')` (#390): that returned
//: `api_key`, which held the credential in directly usable form — so a global admin
//: calling `getAllApiKeys()` dumped every partner's working key into a browser, and a
//: user's own key came back on every list rather than once at creation.
//:
//: The column is hashed and `key_prefix` is what a human identifies a key by. Naming
//: the columns is also what makes the next column added to this table a decision
//: rather than an automatic disclosure.
const API_KEY_LIST_COLUMNS =
  'id, user_id, key_name, key_prefix, is_active, rate_limit_override, allowed_endpoints, expires_at, last_used_at, created_at, updated_at';

class ApiGatewayService {
  // ============= API Keys Management =============
  async getUserApiKeys(userId: string): Promise<ApiKey[]> {
    const { data, error } = await supabase
      .from('api_keys')
      .select(API_KEY_LIST_COLUMNS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async getAllApiKeys(): Promise<ApiKey[]> {
    const { data, error } = await supabase
      .from('api_keys')
      .select(API_KEY_LIST_COLUMNS)
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
    // Generated and hashed IN THE DATABASE (#390), so the plaintext exists in exactly
    // one place for exactly one statement and is returned to the caller ONCE. It cannot
    // be shown again, which is the property that makes hashing worth anything — a key
    // that can be re-read on demand is a plaintext key with extra steps.
    //
    // `generateSecureKey` is gone with the client-side generation it served.
    const { data, error } = await supabase.rpc('create_api_key', {
      p_user_id: userId,
      p_key_name: keyName,
      p_allowed_endpoints: options?.allowedEndpoints ?? null,
      p_expires_at: options?.expiresAt ?? null,
    });

    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as
      | { id: string; api_key: string; key_prefix: string }
      | undefined;
    if (!row) throw new Error('create_api_key returned no row');

    // `rate_limit_override` is not part of the RPC's signature; set it separately when
    // asked for, rather than widening a security-definer function for a tuning knob.
    if (options?.rateLimit != null) {
      const { error: rateLimitError } = await supabase
        .from('api_keys')
        .update({ rate_limit_override: options.rateLimit })
        .eq('id', row.id);
      // Checked (#389): a silently-refused rate limit hands out a key the caller
      // believes is throttled and is not.
      if (rateLimitError) throw rateLimitError;
    }

    return {
      id: row.id,
      key_name: keyName,
      key_prefix: row.key_prefix,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      /** Present ONLY on the response that created it. Never returned by any list. */
      plaintextOnce: row.api_key,
    } as ApiKey & { plaintextOnce: string };
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
    // ALWAYS bounded. The limit used to apply only when a caller passed one, on a table
    // holding 216,737 rows / 50 MB — so a bare call pulled the whole table, ordered, through
    // PostgREST AND the RLS predicate on the VOLATILE has_role overload.
    // One row over the cap is fetched so the caller can tell "exactly N" from "more than N"
    // and SAY SO in the UI. A silently truncated list is the same silent-zero shape the
    // platform guards against everywhere else.
    const limit = options?.limit ?? DEFAULT_USAGE_LOG_LIMIT;
    query = query.limit(limit + 1);

    const { data, error } = await query;

    if (error) throw error;
    const rows = (data || []) as ApiUsageLog[];
    if (rows.length > limit) {
      console.warn(
        `[apiGateway] api_usage_logs truncated to ${limit} rows — narrow the date range or pass a ` +
        'higher limit. The view is showing a partial result.',
      );
      return rows.slice(0, limit);
    }
    return rows;
  }

  // `generateSecureKey` was deleted here (#390), and it is worth saying why rather than
  // just that it moved.
  //
  // It was named "secure" and built the key from `Math.random()`:
  //
  //     result += chars.charAt(Math.floor(Math.random() * chars.length));
  //
  // `Math.random()` is not a CSPRNG. V8 seeds it from a 128-bit xorshift state that an
  // attacker who observes enough output can recover, and it was never intended to
  // produce secrets. So the partner keys issued by this method are not merely stored in
  // plaintext — they are PREDICTABLE, which is why hashing them is necessary but not
  // sufficient and the live keys need rotating rather than just re-storing.
  //
  // Generation now happens in `create_api_key`, which uses `gen_random_bytes` — a real
  // CSPRNG — and never lets the plaintext leave the one statement that returns it.
}

export const apiGatewayService = new ApiGatewayService();
