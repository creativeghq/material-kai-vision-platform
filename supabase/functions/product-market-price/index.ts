import { createClient } from '@supabase/supabase-js';
import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { authenticate, userCanAccessWorkspace } from '../_shared/auth.ts';

function serviceClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

Deno.serve(withApiLogging('product-market-price', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = await authenticate(req);
  if (!auth.userId) return json({ error: 'Unauthorized' }, 401);

  let body: { product_id?: string; workspace_id?: string };
  try { body = await req.json(); } catch { return json({ error: 'invalid JSON' }, 400); }

  const productId = body?.product_id;
  const workspaceId = body?.workspace_id;
  if (!productId) return json({ error: 'product_id is required' }, 400);
  if (!workspaceId) return json({ error: 'workspace_id is required' }, 400);

  const svc = serviceClient();
  if (!(await userCanAccessWorkspace(svc, auth.userId, workspaceId))) {
    return json({ error: 'not a member of this workspace' }, 403);
  }

  // 404 rather than 403 on a mismatch: a distinguishable 403 enumerates ids.
  const { data: product } = await svc
    .from('products').select('id, workspace_id').eq('id', productId).maybeSingle();
  if (!product || product.workspace_id !== workspaceId) {
    return json({ error: 'not found' }, 404);
  }

  await svc.rpc('record_price_demand', {
    p_tracked_query_id: null,
    p_product_id: productId,
    p_workspace_id: workspaceId,
    p_user_id: auth.userId,
    p_api_key_id: null,
    p_surface: 'catalogue',
    p_served_from: null,
  });

  const { data, error } = await svc.rpc('resolve_product_market_price', { p_product_id: productId });
  if (error) return json({ error: 'price resolution failed', detail: error.message }, 502);

  return json({ success: true, ...(data ?? {}) });
}));
