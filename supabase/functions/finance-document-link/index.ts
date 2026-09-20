import { createClient } from '@supabase/supabase-js';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';

const SIGNED_TTL_SECONDS = 60 * 60;

Deno.serve(withApiLogging('finance-document-link', async (req) => {
  const url = new URL(req.url);
  const token = (url.searchParams.get('token') ?? '').trim();
  if (!token) throw new HttpError(400, 'token is required');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const { data } = await supabase.rpc('resolve_invoice_document_token', { p_token: token });
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) throw new HttpError(404, 'Not found');
  if (!row.pdf_storage_path) {
    throw new HttpError(409, 'That document has not been rendered yet.');
  }

  const { data: signed } = await supabase.storage
    .from('pdf-documents')
    .createSignedUrl(row.pdf_storage_path, SIGNED_TTL_SECONDS);
  if (!signed?.signedUrl) throw new HttpError(404, 'Not found');

  return new Response(null, {
    status: 302,
    headers: { Location: signed.signedUrl, 'Cache-Control': 'no-store' },
  });
}));
