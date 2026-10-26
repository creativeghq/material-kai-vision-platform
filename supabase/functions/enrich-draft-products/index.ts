// deno-lint-ignore-file no-explicit-any
/** enrich-draft-products — the operator's door to draft-product enrichment. */
import { createClient } from '@supabase/supabase-js';
import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { authenticate, userHasWorkspaceCapability } from '../_shared/auth.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';

const MIVAA_GATEWAY_URL = () => Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';
const CRON_SECRET = () => Deno.env.get('CRON_SECRET') || '';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS = 5000;

Deno.serve(withApiLogging('enrich-draft-products', async (req) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) return json({ error: auth.error || 'Unauthorized' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'invalid JSON' }, 400); }
  const workspaceId = String(body?.workspace_id ?? '').trim();
  if (!UUID.test(workspaceId)) return json({ error: 'workspace_id is required' }, 400);

  // Same capabilities publish_products asks for: whoever may publish a catalogue may enrich it.
  if (!(await userHasWorkspaceCapability(supabase, auth.userId, workspaceId, ['catalog.import', 'pricing.manage']))) {
    return json({ error: 'not found' }, 404);
  }

  const action = String(body?.action ?? 'report');
  if (action !== 'report') return json({ error: `unknown action '${action}'` }, 400);

  const documentId = body?.document_id ? String(body.document_id) : null;
  const productIds: string[] | null = Array.isArray(body?.product_ids) ? body.product_ids.map(String) : null;
  if (Boolean(documentId) === Boolean(productIds)) {
    return json({ error: 'send exactly one of document_id or product_ids' }, 400);
  }
  if (documentId) {
    if (!UUID.test(documentId)) return json({ error: 'document_id is invalid' }, 400);
    const { data: doc } = await supabase.from('documents').select('workspace_id').eq('id', documentId).maybeSingle();
    if (!doc || doc.workspace_id !== workspaceId) return json({ error: 'not found' }, 404);
  }
  if (productIds && (productIds.length > MAX_IDS || !productIds.every((id) => UUID.test(id)))) {
    return json({ error: `product_ids must be up to ${MAX_IDS} uuids` }, 400);
  }

  if (!CRON_SECRET()) return json({ error: 'CRON_SECRET not configured on edge function' }, 500);
  const res = await fetch(`${MIVAA_GATEWAY_URL()}/api/internal/product-enrichment/gaps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET() },
    body: JSON.stringify({ workspace_id: workspaceId, document_id: documentId, product_ids: productIds }),
  });
  if (!res.ok) {
    const text = await res.text();
    return json({ error: `gap report failed: MIVAA ${res.status}: ${text.slice(0, 300)}` }, 502);
  }
  return json(await res.json());
}));
