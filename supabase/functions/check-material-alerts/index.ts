/**
 * check-material-alerts
 *
 * Scheduled via pg_cron (e.g. daily at 08:00 UTC):
 *   SELECT cron.schedule('check-material-alerts', '0 8 * * *',
 *     $$SELECT net.http_post(url:='<SUPABASE_URL>/functions/v1/check-material-alerts',
 *       headers:'{"Authorization":"Bearer <SERVICE_KEY>"}'::jsonb, body:'{}'::jsonb)$$);
 *
 * Can also be triggered manually (POST to the function URL).
 *
 * For each saved_search with is_active_for_recommendations=true,
 * finds products created since last_recommendation_sent_at whose
 * name or description matches the saved query. Inserts alert rows
 * into material_alerts (deduped) and user_notifications for the bell.
 */

import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { authenticate, isAdminAccess, isCronAuthorized } from '../_shared/auth.ts';
import { emitFlowEvent } from '../_shared/flow-events.ts';
import { chargeCronWorkspace, chargeCronUser } from '../_shared/cron-billing.ts';

Deno.serve(withApiLogging('check-material-alerts', async (req: Request) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Cron-only privileged fan-out across ALL tenants. Allow the pg_cron caller
  // (service-role bearer) or a platform admin; reject everyone else so an
  // anonymous caller can't force a platform-wide notification/cost run.
  if (!isCronAuthorized(req)) {
    const auth = await authenticate(req, { allowedRoles: ['admin', 'super_admin'] });
    if (!auth.success && !isAdminAccess(auth)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin       = createClient(supabaseUrl, serviceKey);

    const now = new Date().toISOString();

    // 1. Fetch all active saved searches
    const { data: activeSavedSearches, error: ssErr } = await admin
      .from('saved_searches')
      .select('id, user_id, name, query, recommendation_frequency, last_recommendation_sent_at, workspace_id')
      .eq('is_active_for_recommendations', true)
      .neq('recommendation_frequency', 'never');

    if (ssErr) throw new Error(`saved_searches query failed: ${ssErr.message}`);
    if (!activeSavedSearches || activeSavedSearches.length === 0) {
      return new Response(JSON.stringify({ processed: 0, message: 'No active saved searches' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let totalAlerts = 0;

    for (const ss of activeSavedSearches) {
      // Check frequency — skip if not yet due
      if (ss.last_recommendation_sent_at) {
        const lastSent = new Date(ss.last_recommendation_sent_at).getTime();
        const hoursSince = (Date.now() - lastSent) / 3_600_000;
        if (ss.recommendation_frequency === 'daily'  && hoursSince < 23)  continue;
        if (ss.recommendation_frequency === 'weekly' && hoursSince < 167) continue;
      }

      const since = ss.last_recommendation_sent_at ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // 2. Find new products matching the saved query
      let productsQuery = admin
        .from('products')
        .select('id, name, description')
        .gte('created_at', since)
        .or(`name.ilike.%${ss.query}%,description.ilike.%${ss.query}%`)
        .limit(20);

      // Scope to workspace if available
      if (ss.workspace_id) {
        productsQuery = productsQuery.eq('workspace_id', ss.workspace_id);
      }

      const { data: matchedProducts, error: pErr } = await productsQuery;
      if (pErr) {
        console.error(`Products query failed for saved_search ${ss.id}:`, pErr.message);
        continue;
      }
      if (!matchedProducts || matchedProducts.length === 0) continue;

      // 3. Insert material_alerts rows (UNIQUE on saved_search_id + product_id → conflict ignored)
      const alertRows = matchedProducts.map((p) => ({
        user_id:        ss.user_id,
        saved_search_id: ss.id,
        product_id:     p.id,
      }));

      const { data: insertedAlerts, error: alertErr } = await admin
        .from('material_alerts')
        .insert(alertRows)
        .select('id, product_id')
        .onConflict('saved_search_id, product_id')
        .ignore();

      if (alertErr) {
        console.error(`material_alerts insert failed for ${ss.id}:`, alertErr.message);
        continue;
      }

      const newAlerts = insertedAlerts ?? [];

      // 4. Notify for each truly new alert — routed through Flows so the
      //    bell is governable. The seeded `material_alert` system-default flow runs
      //    create_notification from this payload.
      if (newAlerts.length > 0) {
        // Meter one unit per saved-search run that produces alerts. Workspace-scoped searches charge
        // the workspace owner; personal searches charge the user directly. No credits → skip
        // notifying (auto-resumes next run once funded). The alert rows stay recorded either way.
        const gate = ss.workspace_id
          ? await chargeCronWorkspace(admin, ss.workspace_id, 'check-material-alerts', { description: `Material alerts: ${ss.name}` })
          : await chargeCronUser(admin, ss.user_id, 'check-material-alerts', { description: `Material alerts: ${ss.name}` });
        if (!gate.allowed) continue;
        for (const a of newAlerts) {
          const product = matchedProducts.find((p) => p.id === a.product_id);
          await emitFlowEvent('material_alert', {
            user_id:    ss.user_id,
            workspace_id: ss.workspace_id ?? null,
            type:       'material_alert',
            title:      `New match: "${product?.name ?? 'Material'}"`,
            body:       `A new material matches your saved search "${ss.name}"`,
            action_url: `/search?q=${encodeURIComponent(ss.query)}`,
            saved_search_id: ss.id,
            product_id: a.product_id,
          }).catch((e) => console.error(`material_alert emit failed for ${ss.id}:`, e?.message));
        }

        totalAlerts += newAlerts.length;
      }

      // 5. Update last_recommendation_sent_at
      await admin
        .from('saved_searches')
        .update({ last_recommendation_sent_at: now, updated_at: now })
        .eq('id', ss.id);
    }

    return new Response(
      JSON.stringify({
        processed: activeSavedSearches.length,
        new_alerts: totalAlerts,
        timestamp: now,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('check-material-alerts error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
}));
