import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { bootstrapSecretsFromDb } from './secrets-bootstrap.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// New API key format (set in Supabase dashboard > Project Settings > Edge Functions > Secrets)
// API_SECRET_KEY = sb_secret_... (for server-to-server admin access)
// API_PUBLISHABLE_KEY = sb_publishable_... (for client access)
const supabaseSecretKey = Deno.env.get('API_SECRET_KEY') || '';
const supabasePublishableKey = Deno.env.get('API_PUBLISHABLE_KEY') || '';

export type AuthLevel = 'secret' | 'user' | 'anon' | 'api_key' | 'none';

export interface ApiKeyContext {
  api_key_id: string;
  user_id: string;
  workspace_id: string | null;
  allowed_endpoints: string[] | null;
  rate_limit_per_min: number;
}

export interface AuthResult {
  success: boolean;
  level: AuthLevel;
  user: User | null;
  userId: string | null;
  error: string | null;
  supabase: SupabaseClient;
  apiKey?: ApiKeyContext | null;
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

  // Bootstrap DB-stored secrets into Deno.env (env-first, DB-fallback). Memoised per worker so
  // every authenticate() call after the first is a no-op. Existing Deno.env.get() calls in
  // downstream code transparently pick up admin-saved values when env is unset.
  // Fire-and-await so the first authenticate() blocks until env is populated; subsequent calls
  // resolve immediately from the cached promise.
  await bootstrapSecretsFromDb(adminClient);

  // Get headers
  const apiKey = req.headers.get('apikey') || req.headers.get('x-api-key');
  const authHeader = req.headers.get('Authorization');

  // Partner API key: Authorization: Bearer kai_<...>
  // Looked up against public.api_keys table — same shape MIVAA's price/mention partner endpoints use.
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (token.startsWith('kai_')) {
      const partnerAuth = await validatePartnerApiKey(adminClient, token);
      // Partner key parse-attempted: return its verdict directly. Don't fall through to JWT validation
      // for kai_* prefixes — the token shape is unambiguous and falling through leaks
      // misleading "Invalid JWT" errors on what is really a missing/disabled api_keys row.
      return partnerAuth;
    }
  }

  // Check for secret key (full admin access, bypasses RLS)
  if (apiKey) {
    // Secret key check - must match configured SUPABASE_SECRET_KEY
    const isSecretKey = supabaseSecretKey && apiKey === supabaseSecretKey;

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

    // Check for publishable key (client access)
    // Must match configured SUPABASE_PUBLISHABLE_KEY
    const isPublishableKey = supabasePublishableKey && apiKey === supabasePublishableKey;

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
          supabase: adminClient, // Use admin client for anon access (RLS will still apply based on no user context)
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

  // Fall back to Authorization header only (user JWT)
  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    // Validate as user token
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

    // Check roles if specified.
    // #195 — reconcile edge auth with the frontend persona model. Authority comes from
    // TWO sources that must agree: the GLOBAL role (`user_profiles.role_id → roles`) AND
    // the WORKSPACE role (`workspace_members.role`). A dealer/architect who OWNS a
    // workspace can hold global role 'user' yet must be allowed business ops — the
    // frontend already treats them as owner/admin via WorkspaceContext, so the edge must
    // too. We grant if EITHER source matches `allowedRoles` (additive — never removes
    // access). Workspace roles are only owner/admin/member/client/finance/accountant, so
    // a `super_admin`-only gate is unaffected (no membership row ever holds it).
    if (allowedRoles && allowedRoles.length > 0) {
      const [{ data: userProfile }, { data: roles }, { data: memberships }] = await Promise.all([
        adminClient.from('user_profiles').select('role_id').eq('user_id', user.id).single(),
        adminClient.from('roles').select('id, name').in('name', allowedRoles),
        adminClient.from('workspace_members').select('role').eq('user_id', user.id).in('role', allowedRoles).limit(1),
      ]);

      const allowedRoleIds = roles?.map(r => r.id) || [];
      const globalOk = !!userProfile && allowedRoleIds.includes(userProfile.role_id);
      const workspaceOk = !!memberships && memberships.length > 0;

      if (!globalOk && !workspaceOk) {
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
 * Validate a partner kai_* API key against public.api_keys.
 * Enforces is_active + expires_at. allowed_endpoints is returned to the caller
 * for route-level enforcement (e.g. agent-chat checks its own path).
 */
async function validatePartnerApiKey(
  adminClient: SupabaseClient,
  token: string,
): Promise<AuthResult> {
  try {
    const { data: row, error } = await adminClient
      .from('api_keys')
      .select('id, user_id, is_active, expires_at, allowed_endpoints, rate_limit_override')
      .eq('api_key', token)
      .maybeSingle();

    if (error || !row || !row.is_active) {
      return {
        success: false,
        level: 'none',
        user: null,
        userId: null,
        error: 'Invalid API key',
        supabase: adminClient,
        apiKey: null,
      };
    }

    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return {
        success: false,
        level: 'none',
        user: null,
        userId: null,
        error: 'API key expired',
        supabase: adminClient,
        apiKey: null,
      };
    }

    // Resolve workspace via oldest active membership — matches the MIVAA Python pattern
    // in price_lookup_routes._resolve_workspace_for_user
    let workspaceId: string | null = null;
    if (row.user_id) {
      const { data: mem } = await adminClient
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', row.user_id)
        .eq('status', 'active')
        .order('joined_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      workspaceId = mem?.workspace_id ?? null;
    }

    // Touch last_used_at — fire and forget
    adminClient.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', row.id).then(
      () => {},
      () => {},
    );

    return {
      success: true,
      level: 'api_key',
      user: null,
      userId: row.user_id,
      error: null,
      supabase: adminClient,
      apiKey: {
        api_key_id: row.id,
        user_id: row.user_id,
        workspace_id: workspaceId,
        allowed_endpoints: row.allowed_endpoints ?? null,
        rate_limit_per_min: Math.max(1, Math.min(Number(row.rate_limit_override) || 60, 600)),
      },
    };
  } catch (err) {
    return {
      success: false,
      level: 'none',
      user: null,
      userId: null,
      error: err instanceof Error ? err.message : 'API key validation failed',
      supabase: adminClient,
      apiKey: null,
    };
  }
}

/**
 * Check whether a partner api_key's allowed_endpoints list permits the given path.
 * `null` allowed_endpoints means allow-all (legacy behavior). Trailing `*` is a prefix wildcard.
 */
export function isEndpointAllowed(allowed: string[] | null, path: string): boolean {
  if (!allowed) return true;
  for (const pat of allowed) {
    if (typeof pat !== 'string') continue;
    if (pat === path) return true;
    if (pat.endsWith('*') && path.startsWith(pat.slice(0, -1))) return true;
  }
  return false;
}

/**
 * Quick helper to check if request has admin/secret access
 */
export function isAdminAccess(auth: AuthResult): boolean {
  return auth.success && auth.level === 'secret';
}

/**
 * True when the request is authenticated as the platform service role — i.e. the
 * Authorization bearer equals SUPABASE_SERVICE_ROLE_KEY. This is how pg_cron jobs
 * call internal/cron edge functions (Bearer <platform_service_role_key>). Use this
 * to gate cron-only functions that have `verify_jwt = false`, so an anonymous caller
 * cannot trigger privileged platform-wide work.
 */
export function isServiceRoleRequest(req: Request): boolean {
  const bearer = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim();
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  return !!key && !!bearer && bearer === key;
}

/**
 * True when a cron-only function may run: either the platform service-role
 * bearer (isServiceRoleRequest) OR a matching `x-cron-secret` header against
 * CRON_SECRET. pg_cron jobs authenticate one of these two ways. Gate cron-only
 * functions on THIS rather than only isServiceRoleRequest, so a job keeps
 * working even when the service-role bearer the scheduler sends drifts from the
 * function's SUPABASE_SERVICE_ROLE_KEY (e.g. a stale/placeholder vault secret).
 */
export function isCronAuthorized(req: Request): boolean {
  if (isServiceRoleRequest(req)) return true;
  const provided = req.headers.get('x-cron-secret');
  const expected = Deno.env.get('CRON_SECRET') || '';
  return !!expected && provided === expected;
}

/**
 * Quick helper to check if request is a partner kai_* API key call.
 */
export function isPartnerApiKeyAccess(auth: AuthResult): boolean {
  return auth.success && auth.level === 'api_key' && !!auth.apiKey;
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

/**
 * Server-side workspace authorization for edge functions that run under the service role.
 *
 * `authenticate({ allowedRoles })` only proves the caller holds a finance-ish role in
 * SOME workspace — it is an admission gate, NOT authorization for a specific document.
 * Functions that then read/transmit a row by id under the service-role client (which
 * bypasses RLS) MUST additionally bind the caller to that row's workspace, or any tenant's
 * finance user can reach another tenant's documents by iterating ids (cross-tenant IDOR).
 *
 * Returns true when `userId` is an ACTIVE member of `workspaceId`, or holds a global
 * platform-operator role (admin/super_admin). Global operators may act across workspaces;
 * everyone else is bound to their own. auth.uid() is unavailable under service role, so we
 * resolve membership + global role by `userId` directly.
 */
export async function userCanAccessWorkspace(
  adminClient: SupabaseClient,
  userId: string | null,
  workspaceId: string | null | undefined,
): Promise<boolean> {
  if (!userId || !workspaceId) return false;
  const [{ data: mem }, { data: prof }] = await Promise.all([
    adminClient
      .from('workspace_members')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle(),
    adminClient
      .from('user_profiles')
      .select('roles!user_profiles_role_id_fkey(name)')
      .eq('user_id', userId)
      .maybeSingle(),
  ]);
  if (mem) return true;
  const globalRole = (prof as { roles?: { name?: string } } | null)?.roles?.name;
  return !!globalRole && ['admin', 'super_admin'].includes(globalRole);
}

/**
 * Return the set of workspace ids the user is an ACTIVE member of. Empty array for a
 * user with no memberships. Used by fan-out handlers (e.g. inbound sync) to constrain a
 * manual/JWT-triggered run to the caller's own tenants.
 */
export async function listUserWorkspaceIds(
  adminClient: SupabaseClient,
  userId: string | null,
): Promise<string[]> {
  if (!userId) return [];
  const { data } = await adminClient
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .eq('status', 'active');
  return (data ?? []).map((r: { workspace_id: string }) => r.workspace_id);
}
