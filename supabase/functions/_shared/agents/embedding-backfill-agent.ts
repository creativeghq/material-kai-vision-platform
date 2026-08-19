/**
 * Background Agent: Embedding Backfill
 *
 * Safety net for the inline embedding generation on the product-create path
 * (admin / dealer / XML). Inline creation embeds text + image vectors
 * synchronously, but the image block swallows failures ("Don't raise — product
 * is already created"), so a transient Voyage/SLIG/Opus hiccup leaves a product
 * text-searchable but silently missing vectors. This agent detects and repairs
 * those by calling MIVAA's existing, bounded, idempotent backfill endpoints.
 *
 * It does NOT generate embeddings itself — it orchestrates the per-type
 * backfill endpoints and records what was fixed / failed / is stuck.
 *
 * Scope is derived from the clock (single cron row, every 15 min):
 *   - 'full'   on the first tick of config.nightly_hour_utc — clears old backlog
 *   - 'recent' on every other tick — repairs rows created in the last window_hours
 * An explicit input.scope ('recent'|'full') overrides (used by manual "Run now").
 *
 * Self-throttling: every family pre-counts deficient rows and no-ops when zero,
 * so a clean platform costs nothing per tick.
 *
 * Config (background_agents.config):
 *   window_hours      number  Recent lookback (default 48)
 *   nightly_hour_utc  number  UTC hour for the daily full scan (default 3)
 *   batch_size        number  Voyage batch size passed through (default 50)
 *   recent / full     { max_products, max_chunks, max_images }  per-scope caps
 *
 * Targeting note (v1): product text + image aspects are repaired by explicit ID
 * (with per-row stuck tracking in embedding_backfill_state). Chunk text +
 * understanding run as bounded global scans — ID targeting for those is deferred
 * to the MIVAA-side `chunk_ids` / `image_ids` params (see .claude plan, Phase 1).
 */

import type { AgentRunner, AgentRunContext, AgentRunResult } from './types.ts';

type Scope = 'recent' | 'full';

interface FamilyResult {
  family: string;
  scanned: number;
  fixed: number;
  failed: number;
  status: 'ok' | 'error';
  error?: string;
}

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Deficient-image OR-filter shared by detection + post-repair re-check. */
const ASPECT_DEFICIENT_OR =
  'has_color_slig.is.null,has_color_slig.eq.false,' +
  'has_texture_slig.is.null,has_texture_slig.eq.false,' +
  'has_style_slig.is.null,has_style_slig.eq.false,' +
  'has_material_slig.is.null,has_material_slig.eq.false';

export class EmbeddingBackfillAgent implements AgentRunner {
  readonly agentType    = 'embedding-backfill';
  readonly name         = 'Embedding Backfill';
  readonly description  = 'Repairs products/chunks/images whose embeddings silently failed at creation';
  readonly defaultTools: string[] = [];
  readonly defaultModel = 'claude-haiku-4-5';

  async run(ctx: AgentRunContext): Promise<AgentRunResult> {
    const { supabase, agentConfig, input, log, heartbeat, mivaaGatewayUrl, mivaaApiKey } = ctx;
    const cfg = { ...agentConfig.config } as Record<string, any>;

    if (!mivaaApiKey) {
      await log('error', 'MIVAA_API_KEY not configured — cannot reach backfill endpoints');
      return { success: false, output: { error: 'mivaa_api_key_missing' }, inputTokens: 0, outputTokens: 0, creditsDebited: 0 };
    }

    // ── derive scope from the clock (or an explicit manual override) ──
    const now = new Date();
    const nightlyHour = Number(cfg.nightly_hour_utc ?? 3);
    const inputScope = input?.scope as string | undefined;
    const scope: Scope = inputScope === 'full' || inputScope === 'recent'
      ? inputScope
      : (now.getUTCHours() === nightlyHour && now.getUTCMinutes() < 15 ? 'full' : 'recent');

    const limits      = (scope === 'full' ? cfg.full : cfg.recent) ?? {};
    const maxProducts = Number(limits.max_products ?? 100);
    const maxChunks   = Number(limits.max_chunks   ?? 300);
    const maxImages   = Number(limits.max_images   ?? 100);
    const batchSize   = Number(cfg.batch_size ?? 50);
    const windowHours = Number(cfg.window_hours ?? 48);
    const sinceIso    = scope === 'recent' ? new Date(now.getTime() - windowHours * 3_600_000).toISOString() : null;

    await log('info', `Embedding backfill starting (scope=${scope})`, { scope, sinceIso, maxProducts, maxChunks, maxImages });

    /**
     * `mivaaGatewayUrl` is the BARE base — every other caller adds its own `/api` prefix
     * (`kai-task-agent` fetches `${mivaaGatewayUrl}/api/rag/search`). These five calls did not,
     * and every admin backfill route lives on `APIRouter(prefix="/api")`, so all five 404'd.
     *
     * It never showed. When a family has nothing to scan the code returns `{scanned: 0,
     * status: 'ok'}` WITHOUT calling MIVAA, so the 404 is only reachable on a run that has real
     * work — and `products` was empty platform-wide. 691 consecutive runs reported `completed`
     * with `scanned: 0`, and the first run that finally had one product to embed returned
     * `HTTP 404: {"detail":"Not Found"}`. The safety net for every un-embedded product on the
     * platform had never once run.
     */
    const callMivaa = async (path: string, body: Record<string, unknown>): Promise<any> => {
      const res = await fetch(`${mivaaGatewayUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${mivaaApiKey}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return res.json();
    };

    const families: FamilyResult[] = [];

    // ── 1. PRODUCT TEXT — ID-targeted + per-row stuck tracking (the live path) ──
    await heartbeat();
    try {
      let q = supabase.from('products').select('id')
        .is('text_embedding_1024', null)
        .order('created_at', { ascending: false })
        .limit(maxProducts);
      if (sinceIso) q = q.gte('created_at', sinceIso);
      const { data: rows, error } = await q;
      if (error) throw new Error(error.message);
      const ids = (rows ?? []).map((r: any) => r.id as string);

      if (ids.length === 0) {
        families.push({ family: 'product_text', scanned: 0, fixed: 0, failed: 0, status: 'ok' });
      } else {
        await supabase.rpc('record_embedding_backfill_attempts', { p_entity_type: 'product', p_deficiency: 'product_text', p_ids: ids });
        await callMivaa('/api/admin/text-embeddings/backfill', {
          product_ids: ids, include_products: true, include_chunks: false, max_products: ids.length, batch_size: batchSize,
        });
        await heartbeat();
        const { data: still } = await supabase.from('products').select('id').in('id', ids).is('text_embedding_1024', null);
        const failedIds = (still ?? []).map((r: any) => r.id as string);
        const fixedIds  = ids.filter((id) => !failedIds.includes(id));
        if (fixedIds.length)  await supabase.rpc('resolve_embedding_backfill_entities', { p_entity_type: 'product', p_deficiency: 'product_text', p_ids: fixedIds });
        if (failedIds.length) await supabase.rpc('fail_embedding_backfill_entities',    { p_entity_type: 'product', p_deficiency: 'product_text', p_ids: failedIds, p_error: 'still_null_after_backfill' });
        families.push({ family: 'product_text', scanned: ids.length, fixed: fixedIds.length, failed: failedIds.length, status: 'ok' });
        await log(failedIds.length ? 'warn' : 'info', `product_text: ${fixedIds.length}/${ids.length} fixed`, { failed_ids: failedIds.slice(0, 50) });
      }
    } catch (e) {
      families.push({ family: 'product_text', scanned: 0, fixed: 0, failed: 0, status: 'error', error: msg(e) });
      await log('error', 'product_text backfill errored', { error: msg(e) });
    }

    // ── 2. CHUNK TEXT — bounded global scan (recent ID targeting deferred) ──
    await heartbeat();
    try {
      let cq = supabase.from('document_chunks').select('id', { count: 'exact', head: true })
        .or('has_text_embedding.is.null,has_text_embedding.eq.false');
      if (sinceIso) cq = cq.gte('created_at', sinceIso);
      const { count } = await cq;
      if (!count) {
        families.push({ family: 'chunk_text', scanned: 0, fixed: 0, failed: 0, status: 'ok' });
      } else {
        const summary = await callMivaa('/api/admin/text-embeddings/backfill', {
          include_products: false, include_chunks: true, max_chunks: maxChunks, batch_size: batchSize,
        });
        const c = summary?.chunks ?? summary ?? {};
        families.push({ family: 'chunk_text', scanned: Number(c.scanned ?? 0), fixed: Number(c.embedded ?? 0), failed: Number(c.failed ?? 0), status: 'ok' });
        await log('info', 'chunk_text backfill', { summary });
      }
    } catch (e) {
      families.push({ family: 'chunk_text', scanned: 0, fixed: 0, failed: 0, status: 'error', error: msg(e) });
      await log('error', 'chunk_text backfill errored', { error: msg(e) });
    }

    // ── 3. UNDERSTANDING — material images missing the understanding vector ──
    //     (bounded global scan; ID targeting deferred to MIVAA Phase 1)
    await heartbeat();
    try {
      let uq = supabase.from('document_images').select('id', { count: 'exact', head: true })
        .eq('has_slig_embedding', true)
        .or('has_understanding_embedding.is.null,has_understanding_embedding.eq.false');
      if (sinceIso) uq = uq.gte('created_at', sinceIso);
      const { count } = await uq;
      if (!count) {
        families.push({ family: 'understanding', scanned: 0, fixed: 0, failed: 0, status: 'ok' });
      } else {
        const summary = await callMivaa('/api/admin/understanding-embeddings/backfill', { max_images: maxImages, batch_size: 25 });
        families.push({ family: 'understanding', scanned: Number(summary?.scanned ?? 0), fixed: Number(summary?.reembedded ?? 0), failed: Number(summary?.failed ?? 0), status: 'ok' });
        await log('info', 'understanding backfill', { summary });
      }
    } catch (e) {
      families.push({ family: 'understanding', scanned: 0, fixed: 0, failed: 0, status: 'error', error: msg(e) });
      await log('error', 'understanding backfill errored', { error: msg(e) });
    }

    // ── 4. ASPECTS — ID-targeted; only images whose understanding already landed ──
    await heartbeat();
    try {
      let aq = supabase.from('document_images').select('id')
        .eq('has_slig_embedding', true)
        .eq('has_understanding_embedding', true)
        .or(ASPECT_DEFICIENT_OR)
        .order('created_at', { ascending: false })
        .limit(maxImages);
      if (sinceIso) aq = aq.gte('created_at', sinceIso);
      const { data: rows, error } = await aq;
      if (error) throw new Error(error.message);
      const ids = (rows ?? []).map((r: any) => r.id as string);

      if (ids.length === 0) {
        families.push({ family: 'aspects', scanned: 0, fixed: 0, failed: 0, status: 'ok' });
      } else {
        await supabase.rpc('record_embedding_backfill_attempts', { p_entity_type: 'image', p_deficiency: 'aspects', p_ids: ids });
        await callMivaa('/api/admin/aspect-embeddings/backfill', { image_ids: ids, batch_size: 25, max_images: ids.length });
        await heartbeat();
        const { data: still } = await supabase.from('document_images').select('id').in('id', ids).or(ASPECT_DEFICIENT_OR);
        const failedIds = (still ?? []).map((r: any) => r.id as string);
        const fixedIds  = ids.filter((id) => !failedIds.includes(id));
        if (fixedIds.length)  await supabase.rpc('resolve_embedding_backfill_entities', { p_entity_type: 'image', p_deficiency: 'aspects', p_ids: fixedIds });
        if (failedIds.length) await supabase.rpc('fail_embedding_backfill_entities',    { p_entity_type: 'image', p_deficiency: 'aspects', p_ids: failedIds, p_error: 'aspects_still_missing_after_backfill' });
        families.push({ family: 'aspects', scanned: ids.length, fixed: fixedIds.length, failed: failedIds.length, status: 'ok' });
        await log(failedIds.length ? 'warn' : 'info', `aspects: ${fixedIds.length}/${ids.length} fixed`, { failed_ids: failedIds.slice(0, 50) });
      }
    } catch (e) {
      families.push({ family: 'aspects', scanned: 0, fixed: 0, failed: 0, status: 'error', error: msg(e) });
      await log('error', 'aspects backfill errored', { error: msg(e) });
    }

    // ── 5. CLASSIFICATION — quarantined images (self-targets via pending marker) ──
    await heartbeat();
    try {
      let pq = supabase.from('document_images').select('id', { count: 'exact', head: true })
        .filter('metadata->ai_classification->>classification_pending', 'eq', 'true');
      if (sinceIso) pq = pq.gte('created_at', sinceIso);
      const { count } = await pq;
      if (!count) {
        families.push({ family: 'classification', scanned: 0, fixed: 0, failed: 0, status: 'ok' });
      } else {
        const summary = await callMivaa('/api/admin/images/classification-backfill', { max_images: maxImages, batch_size: 10 });
        families.push({ family: 'classification', scanned: Number(summary?.scanned ?? 0), fixed: Number(summary?.embedded ?? 0), failed: Number(summary?.failed ?? 0), status: 'ok' });
        await log('info', 'classification backfill', { summary });
      }
    } catch (e) {
      families.push({ family: 'classification', scanned: 0, fixed: 0, failed: 0, status: 'error', error: msg(e) });
      await log('error', 'classification backfill errored', { error: msg(e) });
    }

    // ── stuck count (entities failing every tick) ──
    let stuck = 0;
    try {
      const { count } = await supabase.from('embedding_backfill_state').select('entity_id', { count: 'exact', head: true })
        .is('resolved_at', null).gte('attempts', 3);
      stuck = count ?? 0;
    } catch { /* non-fatal */ }

    const byType: Record<string, FamilyResult> = {};
    for (const f of families) byType[f.family] = f;
    const totals = families.reduce((a, f) => ({ scanned: a.scanned + f.scanned, fixed: a.fixed + f.fixed, failed: a.failed + f.failed }), { scanned: 0, fixed: 0, failed: 0 });
    const anyError = families.some((f) => f.status === 'error');

    await log('info', 'Embedding backfill complete', { scope, ...totals, stuck });

    return {
      success: !anyError,
      output:  { scope, ...totals, stuck, by_type: byType },
      inputTokens: 0, outputTokens: 0, creditsDebited: 0,
    };
  }
}
