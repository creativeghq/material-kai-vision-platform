import { createClient } from '@supabase/supabase-js';

import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';
import { getCrmScope } from './_scope.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Recursively delete every object under `prefix` in a storage bucket.
 * Supabase's list() is per-folder and paginated, so we walk folders and page through files.
 * Returns the number of objects removed. Best-effort: errors are logged, not thrown.
 */
async function deleteStoragePrefix(bucket: string, prefix: string): Promise<number> {
  const toRemove: string[] = [];

  async function walk(folder: string): Promise<void> {
    let offset = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabase.storage
        .from(bucket)
        .list(folder, { limit: 1000, offset });
      if (error) {
        console.error(`[crm-users-api] storage list ${bucket}/${folder} failed:`, error.message);
        return;
      }
      if (!data || data.length === 0) return;
      for (const entry of data) {
        const full = folder ? `${folder}/${entry.name}` : entry.name;
        // Folders come back with a null id; files have an id.
        if (entry.id === null) {
          await walk(full);
        } else {
          toRemove.push(full);
        }
      }
      if (data.length < 1000) break;
      offset += 1000;
    }
  }

  await walk(prefix);

  let removed = 0;
  for (let i = 0; i < toRemove.length; i += 100) {
    const batch = toRemove.slice(i, i + 100);
    const { error } = await supabase.storage.from(bucket).remove(batch);
    if (error) {
      console.error(`[crm-users-api] storage remove ${bucket} batch failed:`, error.message);
    } else {
      removed += batch.length;
    }
  }
  return removed;
}

/**
 * CRM Users API
 * Handles user management operations: list, get, update, delete
 *
 * Authentication:
 * - Secret key (apikey header): Full admin access
 * - User JWT (Authorization header): Requires admin role
 */
export async function handleUsers(req: Request): Promise<Response> {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const method = req.method;
    const path = url.pathname.replace(/^(\/functions\/v1)?(\/crm-api)?\/users/, '').split('/').filter(Boolean);

    // Authenticate request - admin only
    const auth = await authenticate(req, {
      allowedRoles: ['admin'],
    });

    // authenticate() already grants success for secret-key (level='secret') access and
    // enforces the admin role gate for user tokens, so a failed auth is simply rejected here.
    if (!auth.success) {
      return new Response(
        JSON.stringify({ error: auth.error || 'Unauthorized' }),
        { status: auth.error?.includes('Required roles') ? 403 : 401, headers: corsHeaders },
      );
    }

    const user = auth.user;
    const userId = auth.userId;

    // This handler manages PLATFORM auth users (invite, global role_id changes, auth-user
    // deletion, cross-user AI-usage/credits). That is a platform-operator capability, not a
    // per-tenant one — authenticate()'s admin/factory gate is satisfied by a WORKSPACE-level
    // admin, who must NOT be able to enumerate or mutate every platform user (roles, balances).
    // Restrict to global operators (secret key, or global role admin/super_admin).
    const scope = await getCrmScope(supabase, auth);
    if (!scope.isGlobalOperator) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: platform-operator access required' }),
        { status: 403, headers: corsHeaders },
      );
    }

    // POST / - Create (invite) a new user by email
    if (method === 'POST' && path.length === 0) {
      const body = await req.json();
      const { email, full_name, contact_id } = body;

      if (!email) {
        return new Response(
          JSON.stringify({ error: 'email is required' }),
          { status: 400, headers: corsHeaders },
        );
      }

      // Invite user — sends a magic-link email, no password required
      const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
        email,
        { data: { full_name: full_name || '' } },
      );

      if (inviteError) {
        return new Response(
          JSON.stringify({ error: inviteError.message }),
          { status: 400, headers: corsHeaders },
        );
      }

      const newUserId = inviteData.user.id;

      // Update the profile with full_name if provided
      if (full_name) {
        await supabase
          .from('user_profiles')
          .update({ full_name })
          .eq('user_id', newUserId);
      }

      // Auto-link to contact if contact_id supplied
      if (contact_id) {
        await supabase
          .from('crm_contacts')
          .update({
            user_id: newUserId,
            linked_at: new Date().toISOString(),
            linked_by: userId,
          })
          .eq('id', contact_id);
      }

      return new Response(
        JSON.stringify({ data: { user_id: newUserId, email } }),
        { status: 201, headers: corsHeaders },
      );
    }

    // GET /api/users - List all users
    if (method === 'GET' && path.length === 0) {
      const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '100', 10), 1), 1000);
      const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0);

      // Fetch all auth users using admin API
      const { data: authData, error: authError } = await supabase.auth.admin.listUsers({
        page: Math.floor(offset / limit) + 1,
        perPage: limit,
      });

      if (authError) {
        return new Response(
          JSON.stringify({ error: authError.message }),
          { status: 400, headers: corsHeaders },
        );
      }

      // Fetch user profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from('user_profiles')
        .select(`
          id,
          user_id,
          role_id,
          subscription_tier,
          status,
          professional_type,
          created_at,
          full_name,
          roles(id, name, level)
        `);

      if (profilesError) {
        return new Response(
          JSON.stringify({ error: profilesError.message }),
          { status: 400, headers: corsHeaders },
        );
      }

      // Fetch user credits
      const { data: creditsData } = await supabase
        .from('user_credits')
        .select('user_id, balance');

      // Merge auth users with profiles and credits
      const mergedUsers = authData.users.map((authUser) => {
        const profile = profilesData?.find((p) => p.user_id === authUser.id);
        const credits = creditsData?.find((c) => c.user_id === authUser.id);

        return {
          id: profile?.id || authUser.id,
          user_id: authUser.id,
          email: authUser.email || '',
          full_name: profile?.full_name || '',
          role_id: profile?.role_id,
          subscription_tier: profile?.subscription_tier || 'free',
          status: profile?.status || 'active',
          professional_type: profile?.professional_type ?? null,
          credits: credits?.balance || 0,
          created_at: authUser.created_at,
          roles: profile?.roles,
        };
      });

      return new Response(
        JSON.stringify({ data: mergedUsers, count: mergedUsers.length }),
        { status: 200, headers: corsHeaders },
      );
    }

    // GET /api/users/{id} - Get user details
    if (method === 'GET' && path.length === 1) {
      const userId = path[0];

      // Fetch user profile
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select(`
          id,
          user_id,
          role_id,
          subscription_tier,
          status,
          professional_type,
          created_at,
          updated_at,
          roles(id, name, level, description)
        `)
        .eq('user_id', userId)
        .single();

      if (profileError) {
        return new Response(
          JSON.stringify({ error: 'User not found' }),
          { status: 404, headers: corsHeaders },
        );
      }

      // Fetch auth user to get email
      const { data: authData, error: authError } = await supabase.auth.admin.getUserById(userId);

      // Fetch user credits
      const { data: creditsData } = await supabase
        .from('user_credits')
        .select('balance')
        .eq('user_id', userId)
        .single();

      // Merge data
      const mergedData = {
        ...profileData,
        email: authData?.user?.email || '',
        credits: creditsData?.balance || 0,
      };

      return new Response(
        JSON.stringify({ data: mergedData }),
        { status: 200, headers: corsHeaders },
      );
    }

    // GET /api/users/{id}/ai-usage - Get user's AI usage summary
    if (method === 'GET' && path.length === 2 && path[1] === 'ai-usage') {
      const userId = path[0];
      const limit = parseInt(url.searchParams.get('limit') || '50');

      // Fetch AI usage logs for this user
      const { data: usageData, error: usageError } = await supabase
        .from('ai_usage_logs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (usageError) {
        return new Response(
          JSON.stringify({ error: usageError.message }),
          { status: 400, headers: corsHeaders },
        );
      }

      // Calculate totals
      const totals = (usageData || []).reduce(
        (acc, log) => ({
          total_calls: acc.total_calls + 1,
          total_input_tokens: acc.total_input_tokens + (log.input_tokens || 0),
          total_output_tokens: acc.total_output_tokens + (log.output_tokens || 0),
          total_raw_cost_usd: acc.total_raw_cost_usd + (parseFloat(log.raw_cost_usd) || 0),
          total_billed_cost_usd: acc.total_billed_cost_usd + (parseFloat(log.billed_cost_usd) || 0),
          total_credits_debited: acc.total_credits_debited + (parseFloat(log.credits_debited) || 0),
        }),
        {
          total_calls: 0,
          total_input_tokens: 0,
          total_output_tokens: 0,
          total_raw_cost_usd: 0,
          total_billed_cost_usd: 0,
          total_credits_debited: 0,
        }
      );

      // Aggregate by model
      const byModel: Record<string, { calls: number; cost: number; credits: number }> = {};
      (usageData || []).forEach((log) => {
        const model = log.model_name || 'unknown';
        if (!byModel[model]) {
          byModel[model] = { calls: 0, cost: 0, credits: 0 };
        }
        byModel[model].calls += 1;
        byModel[model].cost += parseFloat(log.billed_cost_usd) || 0;
        byModel[model].credits += parseFloat(log.credits_debited) || 0;
      });

      return new Response(
        JSON.stringify({
          data: {
            usage: usageData || [],
            totals,
            byModel: Object.entries(byModel).map(([model, stats]) => ({
              model,
              ...stats,
            })),
          },
        }),
        { status: 200, headers: corsHeaders },
      );
    }

    // PATCH /api/users/{id} - Update user
    if (method === 'PATCH' && path.length === 1) {
      const userId = path[0];
      const body = await req.json();

      // Allow-list of admin-editable fields. `professional_type` lets admins
      // re-categorise a user without asking them to change their own profile
      // (the auto-synced crm_categories pick up the change on next resync).
      // For professional_type / status we accept `null` to clear the value,
      // not just truthy assignments.
      const { role_id, status, subscription_tier, professional_type } = body;
      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (role_id !== undefined && role_id !== '') updates.role_id = role_id;
      if (status !== undefined && status !== '') updates.status = status;
      if (subscription_tier !== undefined && subscription_tier !== null && subscription_tier !== '') {
        updates.subscription_tier = subscription_tier;
      }
      if (professional_type !== undefined) updates.professional_type = professional_type;

      const { data, error } = await supabase
        .from('user_profiles')
        .update(updates)
        .eq('user_id', userId)
        .select();

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: corsHeaders },
        );
      }

      return new Response(
        JSON.stringify({ data: data?.[0] }),
        { status: 200, headers: corsHeaders },
      );
    }

    // DELETE /api/users/{id} - Delete user account + all personal data + files
    if (method === 'DELETE' && path.length === 1) {
      const targetUserId = path[0];

      // 1. Delete the auth user. Foreign keys on auth.users now CASCADE all of the user's
      //    personal data (user_profiles, user_credits, moodboards, projects, quotes,
      //    conversations, generations, api keys, social accounts, tracked queries/mentions/
      //    jobs, notifications, preferences, …) and SET NULL on shared/business records they
      //    merely authored (catalog products/documents, KB docs, CRM, finance). AFTER DELETE
      //    storage triggers fire during this cascade for entity-keyed outputs (moodboard
      //    sheets, quote / catalog / client-view PDFs).
      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(targetUserId);
      if (authDeleteError) {
        // Surface the real failure — do NOT report success on a failed delete.
        console.error(`[crm-users-api] Failed to delete auth user ${targetUserId}:`, authDeleteError.message);
        return new Response(
          JSON.stringify({ error: `Failed to delete user: ${authDeleteError.message}` }),
          { status: 500, headers: corsHeaders },
        );
      }

      // 2. jwt_tokens_log keys the user by a text column (no FK to auth.users), so the
      //    cascade can't reach it — clean it explicitly.
      await supabase.from('jwt_tokens_log').delete().eq('user_id', targetUserId);

      // 3. Remove storage objects keyed by the user-id prefix (avatars, AI generations,
      //    uploaded chat images, KB raw PDFs). The account is already gone, so this is
      //    best-effort; storage-orphan-cleanup-cron is the backstop for anything missed.
      const storageRemoved = {
        'profile-avatars': await deleteStoragePrefix('profile-avatars', targetUserId),
        'generation-images':
          (await deleteStoragePrefix('generation-images', `u/${targetUserId}`)) +
          (await deleteStoragePrefix('generation-images', targetUserId)),
        'pdf-documents': await deleteStoragePrefix('pdf-documents', targetUserId),
      };

      return new Response(
        JSON.stringify({ message: 'User deleted successfully', storage_objects_removed: storageRemoved }),
        { status: 200, headers: corsHeaders },
      );
    }

    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: corsHeaders },
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: corsHeaders },
    );
  }
}

