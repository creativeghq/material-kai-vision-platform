import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';
import { callDataForSEO } from '../../_shared/tools/dataforseo-dispatch.ts';
import { resolveAndAssertSeoEntitled } from './entitlement.ts';

const supabaseUrl = () => Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = () => Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function volumeOf(item: Record<string, unknown>): number | null {
  for (const k of ['ai_search_volume', 'search_volume', 'volume']) {
    const v = item?.[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

export async function handleAiKeywordVolume(req: Request, body: any): Promise<Response> {
  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) return json({ success: false, error: 'Unauthorized' }, 401);

  const keywords: string[] = Array.isArray(body?.keywords)
    ? body.keywords.map((k: unknown) => String(k).trim()).filter(Boolean).slice(0, 200)
    : [];
  if (keywords.length === 0) return json({ success: false, error: 'keywords is required' }, 400);
  const language = String(body?.language_code || 'en').toLowerCase();

  const db = createClient(supabaseUrl(), supabaseServiceKey());
  const ent = await resolveAndAssertSeoEntitled(db, auth.userId);
  if (ent.response) return ent.response;
  if (!ent.workspaceId) return json({ success: false, error: 'No workspace' }, 404);

  const r = await callDataForSEO(
    'ai_keyword_search_volume',
    { keywords, language_code: language },
    { user_id: auth.userId, workspace_id: ent.workspaceId },
  );

  const now = new Date().toISOString();
  if (!r.ok) {
    const rows = keywords.map((keyword) => ({
      workspace_id: ent.workspaceId, keyword, language_code: language,
      ai_volume: null, status: 'collector_failed',
      note: (r.error ?? 'the AI keyword source refused the call').slice(0, 300), captured_at: now,
    }));
    const { error } = await db.from('ai_keyword_volumes')
      .upsert(rows, { onConflict: 'workspace_id,keyword,language_code' });
    if (error) return json({ success: false, error: error.message }, 500);
    return json({ success: false, status: 'collector_failed', error: r.error, keywords: keywords.length });
  }

  const byKeyword = new Map<string, number | null>();
  for (const item of (r.data?.items ?? []) as Record<string, unknown>[]) {
    const k = String(item?.keyword ?? '').trim();
    if (k) byKeyword.set(k.toLowerCase(), volumeOf(item));
  }

  const rows = keywords.map((keyword) => {
    const hit = byKeyword.has(keyword.toLowerCase());
    const vol = byKeyword.get(keyword.toLowerCase()) ?? null;
    return {
      workspace_id: ent.workspaceId, keyword, language_code: language,
      ai_volume: vol,
      status: hit && vol != null ? 'ok' : 'no_data',
      note: hit && vol != null ? null : 'The source answered and has no AI volume for this term.',
      captured_at: now,
    };
  });

  const { error } = await db.from('ai_keyword_volumes')
    .upsert(rows, { onConflict: 'workspace_id,keyword,language_code' });
  if (error) return json({ success: false, error: error.message }, 500);

  return json({
    success: true,
    keywords: rows.length,
    measured: rows.filter((x) => x.status === 'ok').length,
    cost_usd: r.data?.cost_usd ?? null,
  });
}
