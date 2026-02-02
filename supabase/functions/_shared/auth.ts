import { createClient, SupabaseClient, User } from '@supabase/supabase-js';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';

// New API key format support (optional - set in Supabase dashboard > Project Settings > API)
const supabaseSecretKey = Deno.env.get('SUPABASE_SECRET_KEY') || '';
const supabasePublishableKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '';

// Supabase provides these keys automatically:
// - SUPABASE_SERVICE_ROLE_KEY = legacy secret key (elevated privileges, bypasses RLS)
// - SUPABASE_ANON_KEY = legacy publishable/anon key (low privileges, respects RLS)
//
// New key format (optional):
// - SUPABASE_SECRET_KEY = new format secret key (sb_secret_...)
// - SUPABASE_PUBLISHABLE_KEY = new format publishable key (sb_publishable_...)

export type AuthLevel = 'secret' | 'user' | 'anon' | 'none';

export interface AuthResult {
  success: boolean;
  level: AuthLevel;
  user: User | null;
  userId: string | null;
  error: string | null;
  supabase: SupabaseClient;
}

/**
 * Unified authentication handler for Supabase Edge Functions
 *
 * Supports:
 * - Secret keys (sb_secret_... or custom) via apikey header → Full admin access
 * - Publishable keys (sb_publishable_... or anon JWT) via apikey header → Client access
 * - User JWT via Authorization header → User-specific access
 *
 * Usage:
 * ```typescript
 * const auth = await authenticate(req);
 * if (!auth.success) {
 *   return new Response(JSON.stringify({ error: auth.error }), { status: 401 });
 * }
 *
 * // Check auth level
 * if (auth.level === 'secret') {
 *   // Full admin access - server-to-server calls
 * } else if (auth.level === 'user') {
 *   // User-specific access - use auth.user and auth.userId
 * }
 * ```
 */
export async function authenticate(
  req: Request,
  options: {
    requireUser?: boolean;      // Require a valid user JWT (default: false)
    allowedRoles?: string[];    // Require user to have one of these roles
    allowAnon?: boolean;        // Allow anonymous access with just apikey (default: false)
  } = {}
): Promise<AuthResult> {
  const { requireUser = false, allowedRoles, allowAnon = false } = options;

  // Create admin client for validation
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);

  // Get headers
  const apiKey = req.headers.get('apikey') || req.headers.get('x-api-key');
  const authHeader = req.headers.get('Authorization');

  // Check for secret/service role key (full admin access)
  if (apiKey) {
    // Service role key = secret key (provided by Supabase, bypasses RLS)
    // Supports both legacy JWT format and new sb_secret_... format
    const isSecretKey =
      apiKey === supabaseServiceKey ||
      (supabaseSecretKey && apiKey === supabaseSecretKey) ||
      apiKey.startsWith('sb_secret_');

    if (isSecretKey) {
      return {
        success: true,
        level: 'secret',
        user: null,
        userId: null,
        error: null,
        supabase: adminClient,
      };
    }

    // Check for publishable/anon key (client access)
    // Supports both new format (sb_publishable_...) and legacy JWT format
    const isPublishableKey =
      apiKey === supabaseAnonKey ||
      (supabasePublishableKey && apiKey === supabasePublishableKey) ||
      apiKey.startsWith('sb_publishable_');

    if (isPublishableKey) {
      // Publishable key is valid, now check for user JWT if required
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        const userAuth = await validateUserToken(adminClient, token, allowedRoles);
        if (userAuth.success) {
          return userAuth;
        }
        // If user token provided but invalid, return error
        return userAuth;
      }

      // No user token provided
      if (requireUser) {
        return {
          success: false,
          level: 'none',
          user: null,
          userId: null,
          error: 'User authentication required',
          supabase: adminClient,
        };
      }

      if (allowAnon) {
        return {
          success: true,
          level: 'anon',
          user: null,
          userId: null,
          error: null,
          supabase: createClient(supabaseUrl, supabaseAnonKey),
        };
      }

      return {
        success: false,
        level: 'none',
        user: null,
        userId: null,
        error: 'User authentication required',
        supabase: adminClient,
      };
    }
  }

  // Fall back to Authorization header only (legacy behavior)
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');

    // Check if it's actually an anon key being used as Bearer token (legacy pattern)
    if (token === supabaseAnonKey) {
      if (requireUser) {
        return {
          success: false,
          level: 'none',
          user: null,
          userId: null,
          error: 'User authentication required',
          supabase: adminClient,
        };
      }

      if (allowAnon) {
        return {
          success: true,
          level: 'anon',
          user: null,
          userId: null,
          error: null,
          supabase: createClient(supabaseUrl, supabaseAnonKey),
        };
      }
    }

    // Try to validate as user token
    return await validateUserToken(adminClient, token, allowedRoles);
  }

  return {
    success: false,
    level: 'none',
    user: null,
    userId: null,
    error: 'Missing authentication',
    supabase: adminClient,
  };
}

/**
 * Validate a user JWT token
 */
async function validateUserToken(
  adminClient: SupabaseClient,
  token: string,
  allowedRoles?: string[]
): Promise<AuthResult> {
  try {
    const { data: { user }, error } = await adminClient.auth.getUser(token);

    if (error || !user) {
      return {
        success: false,
        level: 'none',
        user: null,
        userId: null,
        error: 'Invalid or expired token',
        supabase: adminClient,
      };
    }

    // Check roles if specified
    if (allowedRoles && allowedRoles.length > 0) {
      const { data: userProfile } = await adminClient
        .from('user_profiles')
        .select('role_id')
        .eq('user_id', user.id)
        .single();

      const { data: roles } = await adminClient
        .from('roles')
        .select('id, name')
        .in('name', allowedRoles);

      const allowedRoleIds = roles?.map(r => r.id) || [];

      if (!userProfile || !allowedRoleIds.includes(userProfile.role_id)) {
        return {
          success: false,
          level: 'none',
          user,
          userId: user.id,
          error: `Access denied. Required roles: ${allowedRoles.join(', ')}`,
          supabase: adminClient,
        };
      }
    }

    return {
      success: true,
      level: 'user',
      user,
      userId: user.id,
      error: null,
      supabase: adminClient,
    };
  } catch (err) {
    return {
      success: false,
      level: 'none',
      user: null,
      userId: null,
      error: err instanceof Error ? err.message : 'Authentication failed',
      supabase: adminClient,
    };
  }
}

/**
 * Quick helper to check if request has admin/secret access
 */
export function isAdminAccess(auth: AuthResult): boolean {
  return auth.success && auth.level === 'secret';
}

/**
 * Quick helper to check if request has user access
 */
export function isUserAccess(auth: AuthResult): boolean {
  return auth.success && auth.level === 'user' && auth.user !== null;
}

/**
 * Get user ID from auth result (works for both user and admin access)
 * For admin access, returns null (no user context)
 */
export function getUserId(auth: AuthResult): string | null {
  return auth.userId;
}
