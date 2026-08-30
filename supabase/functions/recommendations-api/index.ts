import { createClient } from '@supabase/supabase-js';

import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, isAdminAccess, userCanAccessWorkspace } from '../_shared/auth.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Material interaction tracking
 * Records per-user material interactions (read live by MarketTrendsTab /
 * FactoryAnalytics). This function does NOT score recommendations — product
 * recommendations are served by the product_edges path
 * (find_similar/complementary_products).
 *
 * Endpoints:
 * - POST /track-interaction - Track user interaction with material
 *
 * Authentication:
 * - Secret key (apikey header): Full admin access
 * - User JWT (Authorization header): User-specific operations
 */
Deno.serve(withApiLogging('recommendations-api', async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const method = req.method;
    const path = url.pathname.replace('/recommendations-api', '').split('/').filter(Boolean);

    // Authenticate request
    const auth = await authenticate(req);

    if (!auth.success) {
      return new Response(
        JSON.stringify({ error: auth.error || 'Unauthorized' }),
        { status: 401, headers: corsHeaders },
      );
    }

    const userId = auth.userId;

    // This fn uses the service-role client (RLS bypassed) and trusts
    // workspace_id from the body / path / query on every route. Bind the caller to any
    // workspace_id it supplies (admin-secret backend callers exempt). Returns a 403
    // Response to short-circuit, or null when access is OK.
    const isAdmin = isAdminAccess(auth);
    const assertWs = async (wsId: string | null | undefined): Promise<Response | null> => {
      if (isAdmin) return null;
      if (!wsId || !(await userCanAccessWorkspace(supabase, userId, wsId))) {
        return new Response(
          JSON.stringify({ error: 'Not authorized for this workspace' }),
          { status: 403, headers: corsHeaders },
        );
      }
      return null;
    };

    // ========================================================================
    // POST /track-interaction - Track user interaction with material
    // ========================================================================
    if (method === 'POST' && path[0] === 'track-interaction') {
      const body = await req.json();
      const {
        workspace_id,
        material_id,
        interaction_type,
        interaction_value = 1.0,
        session_id,
        metadata,
      } = body;

      if (!workspace_id || !material_id || !interaction_type) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: workspace_id, material_id, interaction_type' }),
          { status: 400, headers: corsHeaders },
        );
      }

      const wsErr = await assertWs(workspace_id);
      if (wsErr) return wsErr;

      // Validate interaction type
      const validTypes = ['view', 'click', 'save', 'purchase', 'rate', 'add_to_quote', 'share'];
      if (!validTypes.includes(interaction_type)) {
        return new Response(
          JSON.stringify({ error: `Invalid interaction_type. Must be one of: ${validTypes.join(', ')}` }),
          { status: 400, headers: corsHeaders },
        );
      }

      // `user_material_interactions.user_id` is NOT NULL, and authenticate() succeeds with
      // no user at all at 'secret'/'anon' level, so the caller's identity is required
      // explicitly here. `user.id` threw a TypeError instead — a 500 with no usable message
      // for every service-role call. 'api_key' sets `userId`, so partner keys still record.
      if (!auth.userId) {
        return new Response(
          JSON.stringify({ error: 'An interaction must be recorded against a signed-in user.' }),
          { status: 400, headers: corsHeaders },
        );
      }

      // Insert interaction
      const { data, error } = await supabase
        .from('user_material_interactions')
        .insert({
          user_id: auth.userId,
          workspace_id,
          material_id,
          interaction_type,
          interaction_value,
          session_id: session_id || null,
          metadata: metadata || {},
        })
        .select()
        .single();

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: corsHeaders },
        );
      }


      return new Response(
        JSON.stringify({ data, message: 'Interaction tracked successfully' }),
        { status: 201, headers: corsHeaders },
      );
    }


    // ========================================================================
    // 404 - Route not found
    // ========================================================================
    return new Response(
      JSON.stringify({ error: 'Route not found' }),
      { status: 404, headers: corsHeaders },
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({
        error: (error instanceof Error ? error.message : String(error)) || 'Internal server error',
      }),
      { status: 500, headers: corsHeaders },
    );
  }
}));

