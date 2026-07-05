import { createClient } from '@supabase/supabase-js';

import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, isAdminAccess, userCanAccessWorkspace } from '../_shared/auth.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Recommendations API
 * Handles collaborative filtering recommendations and interaction tracking
 *
 * Endpoints:
 * - POST /track-interaction - Track user interaction with material
 * - GET /for-user/{user_id} - Get recommendations for user
 * - GET /similar-materials/{material_id} - Get similar materials
 * - GET /analytics/{workspace_id} - Get recommendation analytics
 * - DELETE /cache - Invalidate recommendation cache
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

    const user = auth.user;
    const userId = auth.userId;

    // Pentest #250 M11: this fn uses the service-role client (RLS bypassed) and trusts
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

      // Insert interaction
      const { data, error } = await supabase
        .from('user_material_interactions')
        .insert({
          user_id: user.id,
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

      // Invalidate user's recommendation cache
      await supabase
        .from('recommendation_scores')
        .delete()
        .eq('user_id', user.id)
        .eq('workspace_id', workspace_id);

      return new Response(
        JSON.stringify({ data, message: 'Interaction tracked successfully' }),
        { status: 201, headers: corsHeaders },
      );
    }

    // ========================================================================
    // GET /for-user - Get recommendations for current user
    // ========================================================================
    if (method === 'GET' && path[0] === 'for-user') {
      const workspace_id = url.searchParams.get('workspace_id');
      const limit = parseInt(url.searchParams.get('limit') || '20');
      const algorithm = url.searchParams.get('algorithm') || 'user_user';

      const wsErr = await assertWs(workspace_id);
      if (wsErr) return wsErr;

      if (!workspace_id) {
        return new Response(
          JSON.stringify({ error: 'Missing workspace_id parameter' }),
          { status: 400, headers: corsHeaders },
        );
      }

      // Check cache first
      const { data: cachedRecs, error: cacheError } = await supabase
        .from('recommendation_scores')
        .select('material_id, score, confidence, algorithm, metadata')
        .eq('user_id', user.id)
        .eq('workspace_id', workspace_id)
        .eq('algorithm', algorithm)
        .gt('expires_at', new Date().toISOString())
        .order('score', { ascending: false })
        .limit(limit);

      if (!cacheError && cachedRecs && cachedRecs.length > 0) {
        return new Response(
          JSON.stringify({ data: cachedRecs, cached: true }),
          { status: 200, headers: corsHeaders },
        );
      }

      // No cache - need to compute recommendations
      // This would call the Python recommendation service
      // For now, return empty array with message
      return new Response(
        JSON.stringify({
          data: [],
          cached: false,
          message: 'No cached recommendations available. Recommendation computation requires Python service.',
        }),
        { status: 200, headers: corsHeaders },
      );
    }

    // ========================================================================
    // GET /similar-materials/{material_id} - Get similar materials
    // ========================================================================
    if (method === 'GET' && path[0] === 'similar-materials' && path[1]) {
      const material_id = path[1];
      const workspace_id = url.searchParams.get('workspace_id');
      const limit = parseInt(url.searchParams.get('limit') || '10');

      const wsErr = await assertWs(workspace_id);
      if (wsErr) return wsErr;

      if (!workspace_id) {
        return new Response(
          JSON.stringify({ error: 'Missing workspace_id parameter' }),
          { status: 400, headers: corsHeaders },
        );
      }

      // Get users who interacted with this material
      const { data: interactions, error: interactionsError } = await supabase
        .from('user_material_interactions')
        .select('user_id, interaction_value')
        .eq('material_id', material_id)
        .eq('workspace_id', workspace_id);

      if (interactionsError) {
        return new Response(
          JSON.stringify({ error: interactionsError.message }),
          { status: 500, headers: corsHeaders },
        );
      }

      if (!interactions || interactions.length < 3) {
        return new Response(
          JSON.stringify({
            data: [],
            message: 'Insufficient interactions for similarity calculation',
          }),
          { status: 200, headers: corsHeaders },
        );
      }

      // Get other materials these users interacted with
      const userIds = [...new Set(interactions.map((i) => i.user_id))];

      const { data: otherInteractions, error: otherError } = await supabase
        .from('user_material_interactions')
        .select('material_id, user_id, interaction_value')
        .in('user_id', userIds)
        .eq('workspace_id', workspace_id)
        .neq('material_id', material_id);

      if (otherError) {
        return new Response(
          JSON.stringify({ error: otherError.message }),
          { status: 500, headers: corsHeaders },
        );
      }

      // Calculate similarity scores
      const materialScores: Record<string, { score: number; count: number }> = {};

      otherInteractions?.forEach((interaction) => {
        const mid = interaction.material_id;
        if (!materialScores[mid]) {
          materialScores[mid] = { score: 0, count: 0 };
        }
        materialScores[mid].score += interaction.interaction_value || 1.0;
        materialScores[mid].count += 1;
      });

      // Convert to array and sort
      const recommendations = Object.entries(materialScores)
        .map(([material_id, { score, count }]) => ({
          material_id,
          score: score / count,
          confidence: Math.min(count / 5.0, 1.0),
          algorithm: 'item_item',
          metadata: {
            source_material_id: path[1],
            common_users: count,
          },
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      return new Response(
        JSON.stringify({ data: recommendations }),
        { status: 200, headers: corsHeaders },
      );
    }

    // ========================================================================
    // GET /analytics/{workspace_id} - Get recommendation analytics
    // ========================================================================
    if (method === 'GET' && path[0] === 'analytics' && path[1]) {
      const workspace_id = path[1];
      const days = parseInt(url.searchParams.get('days') || '30');

      const wsErr = await assertWs(workspace_id);
      if (wsErr) return wsErr;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get interaction counts by type
      const { data: interactions, error: interactionsError } = await supabase
        .from('user_material_interactions')
        .select('interaction_type')
        .eq('workspace_id', workspace_id)
        .gte('created_at', startDate.toISOString());

      if (interactionsError) {
        return new Response(
          JSON.stringify({ error: interactionsError.message }),
          { status: 500, headers: corsHeaders },
        );
      }

      const interactionCounts: Record<string, number> = {};
      interactions?.forEach((i) => {
        interactionCounts[i.interaction_type] = (interactionCounts[i.interaction_type] || 0) + 1;
      });

      // Get cached recommendations count
      const { data: cachedRecs, error: cacheError } = await supabase
        .from('recommendation_scores')
        .select('algorithm')
        .eq('workspace_id', workspace_id);

      if (cacheError) {
        return new Response(
          JSON.stringify({ error: cacheError.message }),
          { status: 500, headers: corsHeaders },
        );
      }

      const algorithmCounts: Record<string, number> = {};
      cachedRecs?.forEach((r) => {
        algorithmCounts[r.algorithm] = (algorithmCounts[r.algorithm] || 0) + 1;
      });

      return new Response(
        JSON.stringify({
          data: {
            workspace_id,
            period_days: days,
            total_interactions: interactions?.length || 0,
            interactions_by_type: interactionCounts,
            cached_recommendations: cachedRecs?.length || 0,
            recommendations_by_algorithm: algorithmCounts,
          },
        }),
        { status: 200, headers: corsHeaders },
      );
    }

    // ========================================================================
    // DELETE /cache - Invalidate recommendation cache
    // ========================================================================
    if (method === 'DELETE' && path[0] === 'cache') {
      const workspace_id = url.searchParams.get('workspace_id');
      const material_id = url.searchParams.get('material_id');

      let query = supabase.from('recommendation_scores').delete();

      // Always filter by current user
      query = query.eq('user_id', user.id);

      if (workspace_id) {
        query = query.eq('workspace_id', workspace_id);
      }

      if (material_id) {
        query = query.eq('material_id', material_id);
      }

      const { error } = await query;

      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: corsHeaders },
        );
      }

      return new Response(
        JSON.stringify({ message: 'Cache invalidated successfully' }),
        { status: 200, headers: corsHeaders },
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
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: corsHeaders },
    );
  }
}));

