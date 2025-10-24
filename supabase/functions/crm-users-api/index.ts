import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * CRM Users API
 * Handles user management operations: list, get, update, delete
 */
Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const method = req.method;
    const path = url.pathname.split('/').slice(4); // Remove /functions/crm-users-api

    // Get auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: corsHeaders },
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify user is admin
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: corsHeaders },
      );
    }

    // Check if user is admin
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role_id')
      .eq('user_id', user.id)
      .single();

    const { data: adminRole } = await supabase
      .from('roles')
      .select('id')
      .eq('name', 'admin')
      .single();

    if (!userProfile || userProfile.role_id !== adminRole?.id) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: corsHeaders },
      );
    }

    // GET /api/users - List all users
    if (method === 'GET' && path.length === 0) {
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');
      const search = url.searchParams.get('search');

      let query = supabase
        .from('user_profiles')
        .select(`
          id,
          user_id,
          role_id,
          subscription_tier,
          status,
          created_at,
          roles(name, level)
        `)
        .range(offset, offset + limit - 1);

      if (search) {
        // Search by email in auth.users (limited capability)
        query = query.ilike('id', `%${search}%`);
      }

      const { data, error } = await query;

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 400, headers: corsHeaders },
        );
      }

      return new Response(
        JSON.stringify({ data, count: data?.length || 0 }),
        { status: 200, headers: corsHeaders },
      );
    }

    // GET /api/users/{id} - Get user details
    if (method === 'GET' && path.length === 1) {
      const userId = path[0];

      const { data, error } = await supabase
        .from('user_profiles')
        .select(`
          id,
          user_id,
          role_id,
          subscription_tier,
          status,
          created_at,
          updated_at,
          roles(name, level, description)
        `)
        .eq('user_id', userId)
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ error: 'User not found' }),
          { status: 404, headers: corsHeaders },
        );
      }

      return new Response(
        JSON.stringify({ data }),
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
});

