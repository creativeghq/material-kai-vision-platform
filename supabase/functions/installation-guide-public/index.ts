/** installation-guide-public — serves one guide to anyone holding its public share token. */
import { createClient } from '@supabase/supabase-js';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';

const BUCKET = 'pdf-documents';
const URL_TTL_SECONDS = 60 * 60 * 6;
const TOKEN = /^[0-9a-f]{64}$/;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(withApiLogging('installation-guide-public', async (req: Request) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');

  const { token } = (await req.json().catch(() => ({}))) as { token?: unknown };
  if (typeof token !== 'string' || !TOKEN.test(token)) throw new HttpError(404, 'This link is not valid.');

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: row, error } = await admin
    .from('installation_guides')
    .select('id, workspace_id, title, page_count, page_aspect, guide')
    .eq('public_share_token', token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row || !row.guide) throw new HttpError(404, 'This link is not valid any more.');

  const folder = `installation-guides/${row.workspace_id}/${row.id}`;
  const paths = Array.from({ length: row.page_count ?? 0 }, (_, i) => `${folder}/pages/p${String(i + 1).padStart(3, '0')}.webp`);
  const { data: signed, error: signError } = paths.length
    ? await admin.storage.from(BUCKET).createSignedUrls(paths, URL_TTL_SECONDS)
    : { data: [], error: null };
  if (signError) throw new Error(signError.message);

  return new Response(JSON.stringify({
    title: row.title,
    page_count: row.page_count,
    page_aspect: row.page_aspect,
    guide: row.guide,
    page_urls: paths.map((p) => signed?.find((s) => s.path === p)?.signedUrl ?? ''),
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}));
