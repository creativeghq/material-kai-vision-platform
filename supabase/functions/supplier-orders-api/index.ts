/**
 * supplier-orders-api — ERP outbound
 *
 * Partner API for a claimed supplier's own ERP system. Authenticated with a
 * `kai_*` api_key (Authorization: Bearer kai_...), the same flow price/mention/job
 * partners use. The key's workspace must have an APPROVED supplier-identity claim;
 * the endpoint then exposes the purchase orders sent to that identity across all
 * buyer workspaces and lets the ERP post acknowledge/ship/ETA back.
 *
 *   GET  /supplier-orders-api            → { orders: [...] }
 *   POST /supplier-orders-api { action:'list_orders' }                 → { orders }
 *   POST /supplier-orders-api { action:'update_order', order_id, status?, eta?, note? } → { ok }
 *
 * Visibility contract: only PO header + lines + buyer name (no buyer catalog/margins).
 */
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { authenticate } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(withApiLogging('supplier-orders-api', async (req: Request) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const auth = await authenticate(req);
  if (!auth.success || auth.level !== 'api_key' || !auth.apiKey) {
    throw new HttpError(401, 'A partner api_key (Authorization: Bearer kai_...) is required');
  }
  const workspaceId = auth.apiKey.workspace_id;
  if (!workspaceId) throw new HttpError(403, 'This api_key is not bound to a workspace');
  const db = auth.supabase;

  // GET → list; POST {action} → list | update.
  let action = 'list_orders';
  let body: Record<string, unknown> = {};
  if (req.method === 'POST') {
    body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    action = String(body.action || 'list_orders');
  } else if (req.method !== 'GET') {
    throw new HttpError(405, 'GET or POST only');
  }

  if (action === 'list_orders') {
    const { data, error } = await db.rpc('get_supplier_inbound_orders_svc', { p_workspace_id: workspaceId });
    if (error) throw new HttpError(500, error.message);
    if (data && (data as any).error === 'workspace_has_no_claimed_supplier') {
      throw new HttpError(403, 'This workspace has no approved supplier-identity claim');
    }
    return json({ orders: data ?? [] });
  }

  if (action === 'update_order') {
    const orderId = String(body.order_id || '');
    if (!orderId) throw new HttpError(400, 'order_id is required');
    const status = body.status != null ? String(body.status) : null;
    const eta = body.eta != null ? String(body.eta) : null;
    const note = body.note != null ? String(body.note) : null;
    const { data, error } = await db.rpc('supplier_update_inbound_order_svc', {
      p_workspace_id: workspaceId, p_order_id: orderId, p_status: status, p_eta: eta, p_note: note,
    });
    if (error) throw new HttpError(500, error.message);
    const r = data as Record<string, unknown> | null;
    if (r?.error === 'order_not_addressed_to_workspace') throw new HttpError(403, 'That order is not addressed to your supplier identity');
    if (r?.error === 'invalid_status') throw new HttpError(400, 'status must be acknowledged or shipped');
    return json(r ?? { ok: true });
  }

  throw new HttpError(400, `Unknown action: ${action}`);
}));
