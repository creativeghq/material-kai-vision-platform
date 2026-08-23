// Unified Zernio (social posting) API.
// POST { action, ... } — action determines which handler runs.
// GET — proxies to oauth handler (used by the account-listing flow).
// Analytics:  get_best_time, get_post_analytics, get_account_insights, import_external_posts,
//             get_daily_metrics, get_content_decay, get_posting_frequency, get_follower_stats,
//             get_post_timeline, get_linkedin_aggregate
// OAuth:      connect, callback, list_accounts (via GET), disconnect, config_status
// Publish:    schedule, publish_now
// zernio-webhook-handler stays separate (Zernio's outbound webhook URL).

import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { handleZernioAnalytics } from './handlers/analytics.ts';
import { handleZernioOauth } from './handlers/oauth.ts';
import { handleZernioPublish } from './handlers/publish.ts';

const ANALYTICS_ACTIONS = new Set([
  'get_best_time', 'get_post_analytics', 'get_account_insights', 'import_external_posts',
  // Derived reads Zernio already computes — pass-through, never stored (see analytics.ts).
  'get_daily_metrics', 'get_content_decay', 'get_posting_frequency', 'get_follower_stats',
  'get_post_timeline',
  // Per-ACCOUNT, and the only analytics a LinkedIn personal profile has — every other read here
  // is per-post and needs a post list LinkedIn does not publish for a member.
  'get_linkedin_aggregate',
  // The company pages an existing member connection already administers — they do NOT each need
  // connecting separately, and they are invisible until something asks.
  'get_linkedin_organizations',
]);
const OAUTH_ACTIONS = new Set(['connect', 'callback', 'disconnect', 'config_status']);
const PUBLISH_ACTIONS = new Set(['schedule', 'publish_now']);

Deno.serve(withApiLogging('zernio-api', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // GET → oauth account listing path
  if (req.method === 'GET') return handleZernioOauth(req, {});

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const action = body?.action;
  if (ANALYTICS_ACTIONS.has(action)) return handleZernioAnalytics(req, body);
  if (OAUTH_ACTIONS.has(action)) return handleZernioOauth(req, body);
  if (PUBLISH_ACTIONS.has(action)) return handleZernioPublish(req, body);

  return new Response(JSON.stringify({
    success: false,
    error: `Unknown action '${action}'. Available: ${[...ANALYTICS_ACTIONS, ...OAUTH_ACTIONS, ...PUBLISH_ACTIONS].join(', ')}`,
  }), {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}));
