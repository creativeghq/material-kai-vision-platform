// deno-lint-ignore-file no-explicit-any
// #249 — Real Estate module API (P0 scaffold). Authed CRUD/publish/inquiry/viewing router for the
// `real-estate` add-on. This is the shell: it establishes the exact security spine every future
// action rides on, plus a `ping` action to verify the full gate chain end-to-end. Property tables,
// listing/publish/inquiry actions land in P1.
//
// SECURITY (pen-test #250 baseline — cloned from hr-api):
//  • authenticate() yields a SERVICE-ROLE client (RLS bypassed) → every action re-derives the
//    workspace from the caller and calls userCanAccessWorkspace() (systemic root #2, no body trust).
//  • Module gates: isModuleEnabled('real-estate') [global publish] + assertEntitled(ws,'real-estate')
//    [402 upsell per-workspace].
//  • Evaluate in strict priority order (access 404 → module 404 → entitlement 402) so responses are
//    enumeration-safe (404, never 403, on an unowned workspace id).
//  • P1 will add: RBAC (realestate_agent persona), allowlisted writes (no mass-assignment/BOPLA),
//    the toPublic() projection as the single public read, and the token-gated public page in a
//    SEPARATE `real-estate-public` edge fn.
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { authenticate, userCanAccessWorkspace } from '../_shared/auth.ts';
import { assertEntitled } from '../_shared/entitlement.ts';
import { isModuleEnabled } from '../_shared/modules/registry.ts';

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(withApiLogging('real-estate-api', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) return json({ error: auth.error || 'Unauthorized' }, 401);
  const userId = auth.userId;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'invalid JSON' }, 400); }

  const action = String(body?.action ?? '').trim();
  const workspaceId = String(body?.workspace_id ?? '').trim();
  if (!action) return json({ error: 'action is required' }, 400);
  if (!workspaceId) return json({ error: 'workspace_id is required' }, 400);

  // Gates 1–2 are mutually independent DB checks — fire concurrently, EVALUATE in strict priority
  // order (access 404 → module 404 → entitlement 402). All three helpers resolve (never throw).
  const accessP = userCanAccessWorkspace(supabase, userId, workspaceId);
  const moduleP = isModuleEnabled(supabase, 'real-estate');
  const entP = assertEntitled(supabase, workspaceId, 'real-estate');

  // 1) Bind caller ↔ workspace (service-role client bypasses RLS — this is the real tenancy gate).
  if (!(await accessP)) return json({ error: 'not found' }, 404); // 404 (not 403) — no id enumeration.
  // 2) Module gates: global publish switch + per-workspace entitlement (402 upsell).
  if (!(await moduleP)) throw new HttpError(404, 'Real Estate module is not available');
  const ent = await entP;
  if (!ent.ok) return ent.response;

  // 3) Actions. P0 ships only the gate-chain verifier; P1 adds the property CRUD/publish/inquiry router.
  try {
    switch (action) {
      case 'ping':
        return json({ ok: true, module: 'real-estate', workspace_id: workspaceId, user_id: userId });
      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
    return json({ error: (e as Error)?.message ?? 'internal error' }, 500);
  }
}));
