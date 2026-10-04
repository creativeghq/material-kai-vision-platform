// seve-directory-sync — keeps public.seve_members, the ΣΕΒΕ exporter directory used as a CRM identity source.

import { createClient } from '@supabase/supabase-js';
import type { DbClient } from '../_shared/supabase-client.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { isCronAuthorized } from '../_shared/auth.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import {
  SEVE_ORIGIN, companySitemaps, foldCompanyName, parseMemberPage, parseSitemap, type SitemapEntry,
} from '../_shared/crm/seveDirectory.ts';

const DEFAULT_PAGES = 150;
const MAX_PAGES = 400;
const CONCURRENCY = 4;
const UA = 'MaterialsHubDirectorySync/1.0 (+https://app.materialshub.gr)';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function get(url: string): Promise<string | null> {
  if (!url.startsWith(SEVE_ORIGIN)) return null;
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

async function refreshSitemap(db: DbClient): Promise<{ listed: number; failed: number }> {
  const index = await get(`${SEVE_ORIGIN}/sitemap_index.xml`);
  if (!index) throw new Error('ΣΕΒΕ sitemap index did not load');
  const entries = new Map<string, SitemapEntry>();
  let failed = 0;
  for (const sm of companySitemaps(index)) {
    const xml = await get(sm);
    if (!xml) { failed++; continue; }
    for (const e of parseSitemap(xml)) entries.set(e.slug, e);
  }
  const rows = [...entries.values()];
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.rpc('seve_members_upsert_sitemap', { p_rows: rows.slice(i, i + 500) });
    if (error) throw new Error(`storing the sitemap failed: ${error.message}`);
  }
  return { listed: rows.length, failed };
}

Deno.serve(withApiLogging('seve-directory-sync', async (req: Request) => {
  await bootstrapForFunction();
  if (!isCronAuthorized(req)) return json({ error: 'Unauthorized' }, 401);

  const db = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '') as DbClient;
  const body = (await req.json().catch(() => ({}))) as { limit?: number; refresh_sitemap?: boolean };
  const limit = Math.min(Math.max(Number(body.limit) || DEFAULT_PAGES, 1), MAX_PAGES);

  const { count } = await db.from('seve_members').select('slug', { count: 'exact', head: true });
  const sitemap = body.refresh_sitemap || !count ? await refreshSitemap(db) : null;

  const { data: due, error } = await db.rpc('seve_members_due', { p_limit: limit });
  if (error) return json({ error: error.message }, 500);

  let fetched = 0, failed = 0;
  const queue = [...((due ?? []) as { slug: string; url: string }[])];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const row = queue.shift()!;
      const html = await get(row.url);
      const m = html ? parseMemberPage(html) : null;
      const now = new Date().toISOString();
      const patch = m
        ? { ...m, name_fold: foldCompanyName(m.name), fetched_at: now, fetch_error: null }
        : { fetched_at: now, fetch_error: html ? 'page did not parse' : 'page did not load' };
      const { error: upErr } = await db.from('seve_members').update(patch).eq('slug', row.slug);
      if (m && !upErr) fetched++; else failed++;
    }
  }));

  return json({ success: true, sitemap, attempted: (due ?? []).length, fetched, failed });
}));
