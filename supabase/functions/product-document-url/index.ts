// pdf-documents is private, so the URL is minted per read: a stored one is an expired one.
import { createClient } from '@supabase/supabase-js';
import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const URL_TTL_SECONDS = 300;

Deno.serve(withApiLogging('product-document-url', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) return json({ error: auth.error ?? 'Unauthorized' }, 401);

  let body: { product_id?: string; kb_doc_id?: string; document_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const productId = body.product_id;
  if (!productId) return json({ error: 'product_id is required' }, 400);
  if (!body.kb_doc_id && !body.document_id) {
    return json({ error: 'kb_doc_id or document_id is required' }, 400);
  }

  // Under service role auth.uid() is NULL, and the RPC's gate would refuse everyone.
  const asUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );

  const { data, error } = await asUser.rpc('get_product_document_path', {
    p_product_id: productId,
    p_kb_doc_id: body.kb_doc_id ?? null,
    p_document_id: body.document_id ?? null,
  });
  if (error) return json({ error: 'Could not resolve the document' }, 500);

  const row = Array.isArray(data) ? data[0] : null;
  // 404 not 403: "not yours" and "no such file" must be indistinguishable.
  if (!row?.object_path) return json({ error: 'Not found' }, 404);

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const signed = await service.storage
    .from(row.bucket)
    .createSignedUrl(row.object_path, URL_TTL_SECONDS, { download: row.filename });

  if (signed.error || !signed.data?.signedUrl) {
    // Ours, not theirs: a 404 here would read as "this product has no document".
    return json({ error: 'The file could not be signed for download' }, 502);
  }

  return json({ url: signed.data.signedUrl, filename: row.filename, expires_in: URL_TTL_SECONDS });
}));
