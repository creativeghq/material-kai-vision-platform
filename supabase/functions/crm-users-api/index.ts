import { createClient } from '@supabase/supabase-js';

import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, isAdminAccess } from '../_shared/auth.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * CRM Users API
 * Handles user management operations: list, get, update, delete
 *
 * Authentication:
 * - Secret key (apikey header): Full admin access
 * - User JWT (Authorization header): Requires admin role
 */
Deno.serve(withApiLogging('crm-users-api', async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const method = req.method;
    const path = url.pathname.replace('/crm-users-api', '').split('/').filter(Boolean);

    // Authenticate request - admin only
    const auth = await authenticate(req, {
      allowedRoles: ['admin'],
    });

    // Secret key bypasses role check
    if (!auth.success && !isAdminAccess(auth)) {
      return new Response(
        JSON.stringify({ error: auth.error || 'Unauthorized' }),
        { status: auth.error?.includes('Required roles') ? 403 : 401, headers: corsHeaders },
      );
    }

    const user = auth.user;
    const userId = auth.userId;

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
          total_raw_cost_usd: acc.total_raw_cost_usd + (parseFloat(log.raw_cost_usd) || parseFloat(log.total_cost_usd) || 0),
          total_billed_cost_usd: acc.total_billed_cost_usd + (parseFloat(log.billed_cost_usd) || parseFloat(log.total_cost_usd) || 0),
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
        byModel[model].cost += parseFloat(log.billed_cost_usd) || parseFloat(log.total_cost_usd) || 0;
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

      const { role_id, status, subscription_tier } = body;

      const { data, error } = await supabase
        .from('user_profiles')
        .update({
          ...(role_id && { role_id }),
          ...(status && { status }),
          ...(subscription_tier && { subscription_tier }),
          updated_at: new Date().toISOString(),
        })
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

    // DELETE /api/users/{id} - Delete user
    if (method === 'DELETE' && path.length === 1) {
      const userId = path[0];

      // Delete user profile
      const { error: profileError } = await supabase
        .from('user_profiles')
        .delete()
        .eq('user_id', userId);

      if (profileError) {
        return new Response(
          JSON.stringify({ error: profileError.message }),
          { status: 400, headers: corsHeaders },
        );
      }

      // Delete user credits
      await supabase
        .from('user_credits')
        .delete()
        .eq('user_id', userId);

      // Delete the auth user so it doesn't remain orphaned
      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId);
      if (authDeleteError) {
        console.error(`[crm-users-api] Failed to delete auth user ${userId}:`, authDeleteError.message);
        // Non-fatal: profile already deleted; log and continue
      }

      return new Response(
        JSON.stringify({ message: 'User deleted successfully' }),
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
}));

