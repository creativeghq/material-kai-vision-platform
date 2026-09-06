/**
 * Free text (and photos) → a catalog `product_id`. Issue #342 §3 / §3a.
 *
 * Three methods, same ladder the rest of the platform uses:
 *   `mivaa`  — semantic search, `/api/rag/search?strategy=multi_vector` (results carry product_id)
 *   `ilike`  — a direct DB fallback when MIVAA is unavailable or returns nothing
 *   `visual` — the customer sent a photo instead of a name ("2 boxes of this"), matched through
 *              the SAME MIVAA multi_vector call with the image attached
 *
 * Nothing here auto-accepts a weak match. Below `CONFIDENT_SCORE` the line keeps its candidates
 * and is flagged `needs_review`, because a confidently wrong product is worse than an unmatched
 * line a human fixes in five seconds.
 */

import type { DbClient } from '../supabase-client.ts';
import { assertSafeUrl } from '../ssrf-guard.ts';
import type { MatchMethod } from './types.ts';

const MIVAA_GATEWAY_URL = () => Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';
const MIVAA_API_KEY = () => Deno.env.get('MIVAA_API_KEY') || Deno.env.get('MATERIAL_KAI_API_KEY') || '';

const mivaaAuthHeaders = (): Record<string, string> => {
  const k = MIVAA_API_KEY();
  return { 'Content-Type': 'application/json', ...(k ? { Authorization: `Bearer ${k}` } : {}) };
};

/** Above this, the top hit is taken as the line's product. Below, a human picks. */
const CONFIDENT_SCORE = 0.72;
/** A conversation is not a batch job; a slow search must not hold the whole intake open. */
const SEARCH_TIMEOUT_MS = 20_000;

export interface MatchCandidate {
  product_id: string;
  name: string;
  score: number | null;
}

export interface MatchResult {
  product_id: string | null;
  method: MatchMethod;
  confidence: number | null;
  candidates: MatchCandidate[];
  /** Catalog name of the chosen product, so the line reads back in the operator's vocabulary. */
  name: string | null;
}

const EMPTY: MatchResult = { product_id: null, method: 'none', confidence: null, candidates: [], name: null };

/** Product ids out of a MIVAA payload, in rank order, deduped. */
function productIdsFrom(payload: unknown): Array<{ id: string; score: number | null }> {
  const results = ((payload as { results?: unknown[] })?.results ?? []) as Array<Record<string, unknown>>;
  const seen = new Set<string>();
  const out: Array<{ id: string; score: number | null }> = [];
  for (const r of results) {
    const meta = (r.metadata || {}) as Record<string, unknown>;
    const id = (r.product_id ?? meta.product_id) as string | undefined;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const raw = (r.score ?? r.similarity_score ?? null) as number | null;
    out.push({ id, score: raw == null ? null : Number(raw) });
  }
  return out;
}

/** Resolve ids → names, workspace-scoped. A product from another tenant is not a match. */
async function nameProducts(
  db: DbClient,
  workspaceId: string,
  ids: string[],
): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const { data } = await db
    .from('products')
    .select('id, name')
    .eq('workspace_id', workspaceId)
    .in('id', ids);
  return new Map(((data || []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name]));
}

async function mivaaSearch(
  workspaceId: string,
  body: Record<string, unknown>,
): Promise<Array<{ id: string; score: number | null }>> {
  const url = new URL(`${MIVAA_GATEWAY_URL()}/api/rag/search`);
  url.searchParams.set('strategy', 'multi_vector');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: mivaaAuthHeaders(),
      body: JSON.stringify({ workspace_id: workspaceId, top_k: 5, ...body }),
      signal: controller.signal,
    });
    if (!res.ok) return [];
    return productIdsFrom(await res.json());
  } catch {
    // A search outage degrades to the DB fallback; it never fails the intake.
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Free text → a term safe inside a PostgREST `ilike` filter.
 *
 * The text reaches a filter GRAMMAR: `,` `.` `(` `)` are operators there, `*` is the wildcard,
 * and escapeHtml is NOT a PostgREST sanitizer (separate contract, see CLAUDE.md). Anything that is
 * not a letter, digit, space or hyphen becomes `%` — a wildcard, not a space — so an SKU typed
 * as `OAK-28.145` still matches `OAK-28.145` instead of looking for a literal space. One helper
 * for every ilike built from user text (the intake matcher, the catalog picker).
 */
export function postgrestSafeIlikeTerm(text: string, max = 80): string {
  return text
    .replace(/[^\p{L}\p{N}\s\-]/gu, '%')
    .replace(/\s+/g, ' ')
    .replace(/%{2,}/g, '%')
    .trim()
    .slice(0, max);
}

/** Direct DB fallback. Deliberately dumb — it exists so a MIVAA outage still produces a match. */
async function ilikeSearch(
  db: DbClient,
  workspaceId: string,
  description: string,
): Promise<MatchCandidate[]> {
  // The description is model output derived from customer text: it reaches a PostgREST filter
  // grammar, so it goes through the one sanitizer.
  const safe = postgrestSafeIlikeTerm(description);
  if (safe.replace(/%/g, '').length < 3) return [];
  const { data } = await db
    .from('products')
    .select('id, name')
    .eq('workspace_id', workspaceId)
    .ilike('name', `%${safe}%`)
    .limit(5);
  return ((data || []) as Array<{ id: string; name: string }>).map((p) => ({
    product_id: p.id, name: p.name, score: null,
  }));
}

/** Rank → MatchResult, applying the confidence floor. */
async function shape(
  db: DbClient,
  workspaceId: string,
  ranked: Array<{ id: string; score: number | null }>,
  method: MatchMethod,
): Promise<MatchResult> {
  if (!ranked.length) return EMPTY;
  const names = await nameProducts(db, workspaceId, ranked.map((r) => r.id));
  const candidates: MatchCandidate[] = ranked
    .filter((r) => names.has(r.id))     // cross-tenant ids simply are not candidates
    .map((r) => ({ product_id: r.id, name: names.get(r.id)!, score: r.score }));
  if (!candidates.length) return EMPTY;

  const top = candidates[0];
  const confident = top.score != null && top.score >= CONFIDENT_SCORE;
  return {
    product_id: confident ? top.product_id : null,
    method: confident ? method : 'none',
    confidence: top.score,
    candidates,
    name: confident ? top.name : null,
  };
}

/** Text → product. */
export async function matchByText(
  db: DbClient,
  workspaceId: string,
  description: string,
): Promise<MatchResult> {
  const ranked = await mivaaSearch(workspaceId, { query: description });
  const semantic = await shape(db, workspaceId, ranked, 'mivaa');
  if (semantic.candidates.length) return semantic;

  const fallback = await ilikeSearch(db, workspaceId, description);
  if (!fallback.length) return EMPTY;
  // An ilike hit carries no score, so it is never auto-accepted — it is a suggestion.
  return { product_id: null, method: 'none', confidence: null, candidates: fallback, name: null };
}

/**
 * Photo → product (#342 §3a, folded in from #209 §7). Same MIVAA endpoint, image attached.
 *
 * The result is NEVER auto-accepted regardless of score: an image is evidence of *what*, and the
 * quantity still comes from the text. The reviewer confirms which product the picture is.
 */
export async function matchByImage(
  db: DbClient,
  workspaceId: string,
  imageBase64: string,
  description: string,
): Promise<MatchResult> {
  const ranked = await mivaaSearch(workspaceId, {
    // An empty query is meaningful here — "match this picture, I have no words for it".
    query: description || '',
    image_base64: imageBase64,
  });
  const result = await shape(db, workspaceId, ranked, 'visual');
  if (!result.candidates.length) return EMPTY;
  return {
    ...result,
    product_id: result.candidates[0].product_id,
    method: 'visual',
    name: result.candidates[0].name,
  };
}

/**
 * First usable image on a message as base64. Attachments are either private-storage pairs (email,
 * in-app uploads) or an external channel URL (WhatsApp via Zernio).
 *
 * The external branch goes through the shared SSRF guard (invariant 7): the URL travels on a
 * webhook payload, so it is user-influenced by definition and must never be fetched raw.
 */
export async function firstImageBase64(
  db: DbClient,
  attachments: Array<Record<string, unknown>>,
): Promise<string | null> {
  for (const att of attachments) {
    const type = String(att.content_type || '');
    if (!type.startsWith('image/')) continue;

    const bucket = att.storage_bucket as string | undefined;
    const path = att.storage_object_path as string | undefined;
    if (bucket && path) {
      const { data } = await db.storage.from(bucket).download(path);
      if (data) return bytesToBase64(new Uint8Array(await data.arrayBuffer()));
      continue;
    }

    const url = att.url as string | undefined;
    if (!url) continue;
    try {
      const safe = await assertSafeUrl(url, { allowSchemes: ['https:'] });
      const res = await fetch(safe, { redirect: 'manual' });
      if (!res.ok) continue;
      const buf = new Uint8Array(await res.arrayBuffer());
      // Bound it: an attachment is evidence for one search, not an upload path.
      if (buf.byteLength > 8 * 1024 * 1024) continue;
      return bytesToBase64(buf);
    } catch {
      continue;
    }
  }
  return null;
}

/** Chunked so a multi-MB image does not blow the argument limit of String.fromCharCode. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
