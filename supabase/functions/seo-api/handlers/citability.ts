/** Pick the page that should have answered a question, read it, score it. On demand. */

import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate, userCanAccessWorkspace } from '../../_shared/auth.ts';
import { assertSafeUrl, SSRFError } from '../../_shared/ssrf-guard.ts';
import { resolveAndAssertSeoEntitled } from './entitlement.ts';
import { scoreCitability } from '../../_shared/seo/citability.ts';

const supabaseUrl = () => Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = () => Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const STALE_AFTER_DAYS = 14;
const MAX_BYTES = 1_500_000;

interface PageRow { id: string; url: string; title: string | null; keywords: string[] | null; content_text: string | null; fetched_at: string | null }

/**
 * The page most likely to be the answer. Term overlap against title, URL and keywords —
 * deliberately not the embedding: only 528 of 6,000 pages have one, so a vector search
 * silently restricts the candidate set to whatever happened to be embedded.
 */
function pickPage(question: string, pages: PageRow[]): PageRow | null {
  const terms = (question.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []);
  if (pages.length === 0) return null;
  let best: PageRow | null = null;
  let bestScore = 0;
  for (const p of pages) {
    const hay = `${p.title ?? ''} ${p.url} ${(p.keywords ?? []).join(' ')}`.toLowerCase();
    let hits = 0;
    for (const t of terms) if (hay.includes(t)) hits += 1;
    // Prefer a page we have already read: scoring one we must fetch costs a request.
    const score = hits * 10 + (p.content_text ? 1 : 0);
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return bestScore > 0 ? best : null;
}

async function readPage(url: string): Promise<{ html: string | null; error: string | null }> {
  let safe: string;
  try {
    safe = await assertSafeUrl(url);
  } catch (e) {
    return { html: null, error: e instanceof SSRFError ? `refused: ${e.message}` : 'refused' };
  }
  try {
    const res = await fetch(safe, {
      redirect: 'follow',
      headers: { 'User-Agent': 'MaterialsHubBot/1.0 (+https://materialshub.gr)' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { html: null, error: `HTTP ${res.status}` };
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) return { html: null, error: 'page too large' };
    return { html: new TextDecoder().decode(buf), error: null };
  } catch (e) {
    return { html: null, error: (e instanceof Error ? e.message : 'fetch failed').slice(0, 140) };
  }
}

export async function handleCitability(req: Request, body: any): Promise<Response> {
  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) return json({ success: false, error: 'Unauthorized' }, 401);

  const websiteId: string | undefined = body?.website_id;
  const question: string | undefined = body?.question;
  if (!websiteId || !question) {
    return json({ success: false, error: 'website_id and question are required' }, 400);
  }

  const db = createClient(supabaseUrl(), supabaseServiceKey());

  const { data: site } = await db
    .from('user_websites')
    .select('id, workspace_id')
    .eq('id', websiteId)
    .maybeSingle();
  // 404 on an ownership miss, never 403 — a 403 confirms the id exists (invariant 1).
  if (!site || !(await userCanAccessWorkspace(db, auth.userId, site.workspace_id))) {
    return json({ success: false, error: 'Not found' }, 404);
  }
  const ent = await resolveAndAssertSeoEntitled(db, auth.userId);
  if (ent.response) return ent.response;

  const { data: pages } = await db
    .from('user_website_pages')
    .select('id, url, title, keywords, content_text, fetched_at')
    .eq('website_id', websiteId)
    .eq('is_active', true)
    .limit(4000);

  const chosen = body?.url
    ? ((pages ?? []) as PageRow[]).find((p) => p.url === body.url) ?? null
    : pickPage(question, (pages ?? []) as PageRow[]);

  if (!chosen) {
    return json({
      success: true,
      status: 'no_data',
      note: 'No page on this site matches that question. That is the finding: the answer has nowhere to live yet.',
      page: null,
    });
  }

  const stale = !chosen.fetched_at
    || (Date.now() - Date.parse(chosen.fetched_at)) > STALE_AFTER_DAYS * 86_400_000;

  let html: string | null = null;
  let fetchError: string | null = null;
  if (!chosen.content_text || stale) {
    const read = await readPage(chosen.url);
    html = read.html;
    fetchError = read.error;
    if (html) {
      const { error: cacheErr } = await db.from('user_website_pages')
        .update({ content_text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200_000), fetched_at: new Date().toISOString() })
        .eq('id', chosen.id);
      if (cacheErr) console.warn('[citability] could not cache page text:', cacheErr.message);
    }
  }

  // A fetch that FAILED is not a page that scored zero. Persist the reason so the panel
  // can say "we could not read it" instead of marking the page down for being unreachable.
  if (!html && !chosen.content_text) {
    const row = {
      website_id: websiteId, workspace_id: site.workspace_id, url: chosen.url, question,
      score: null, status: 'not_collected',
      note: fetchError ? `Could not read the page: ${fetchError}` : 'The page has not been read yet.',
      dimensions: [], gaps: [], words: 0, analysed_at: new Date().toISOString(),
    };
    const { error: storeErr } = await db.from('website_page_citability')
      .upsert(row, { onConflict: 'website_id,url,question' });
    if (storeErr) return json({ success: false, error: storeErr.message }, 500);
    return json({ success: true, status: 'not_collected', note: row.note, page: { url: chosen.url } });
  }

  const report = scoreCitability({ html, text: html ? null : chosen.content_text, question });

  const { error: saveErr } = await db.from('website_page_citability').upsert({
    website_id: websiteId, workspace_id: site.workspace_id, url: chosen.url, question,
    score: report.score, status: report.status, note: report.note,
    dimensions: report.dimensions, gaps: report.gaps, words: report.words,
    analysed_at: new Date().toISOString(),
  }, { onConflict: 'website_id,url,question' });
  if (saveErr) return json({ success: false, error: saveErr.message }, 500);

  return json({ success: true, page: { url: chosen.url, title: chosen.title }, ...report });
}
