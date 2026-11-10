/** Background Agent: Embedding Backfill */

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

/** Deficient-image OR-filter shared by detection + post-repair re-check. An aspect MIVAA
 *  stamped `absent` had no source text — nothing to embed, so it is never a failure. */
const ASPECT_DEFICIENT_OR = ['color', 'texture', 'style', 'material']
  .map((a) => `and(has_${a}_slig.not.is.true,or(${a}_aspect_embedding_model.is.null,${a}_aspect_embedding_model.neq.absent))`)
  .join(',');

/** Mirrors `owes_visual_vector` in MIVAA visual_backfill.py, so a row it skips is never counted failed. */
const OWES_VISUAL_AND =
  'or(has_slig_embedding.is.null,has_slig_embedding.eq.false),' +
  'metadata->excluded_from_products.is.null,metadata->>bundle_skipped_reason.is.null,' +
  'or(metadata->ai_classification->>is_material.is.null,metadata->ai_classification->>is_material.neq.false),' +
  'or(metadata->ai_classification->>classification_pending.is.null,metadata->ai_classification->>classification_pending.neq.true),' +
  'or(metadata->image_quality->>sourcing.is.null,metadata->image_quality->>sourcing.neq.pending)';

/** An entity that failed this many ticks is reported as `stuck` and no longer re-sent every 15 minutes. */
const STUCK_ATTEMPTS = 3;

export class EmbeddingBackfillAgent implements AgentRunner {
  readonly agentType    = 'embedding-backfill';
  readonly name         = 'Embedding Backfill';
  readonly description  = 'Repairs products/chunks/images whose embeddings silently failed at creation';
  readonly defaultTools: string[] = [];
  readonly defaultModel = 'claude-haiku-5-5';

  async run(ctx: AgentRunContext): Promise<AgentRunResult> {
    const { supabase, agentConfig, input, log, heartbeat, mivaaGatewayUrl, mivaaApiKey } = ctx;
    const cfg = { ...agentConfig.config } as Record<string, any>;

    // A platform-wide repair: only the operator's unscoped agent may run it, never a tenant-owned copy.
    if (agentConfig.workspace_id !== null || ctx.workspaceId !== null) {
      await log('error', 'Embedding backfill refused: a workspace-owned agent cannot repair every tenant');
      return { success: false, output: { error: 'platform_agent_only' }, inputTokens: 0, outputTokens: 0, creditsDebited: 0 };
    }

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

    // A legitimately empty aspect (no texture in a spec-sheet fragment) never sets its flag.
    const stuckFilter = async (entityType: string, deficiency: string): Promise<string | null> => {
      const { data } = await supabase.from('embedding_backfill_state').select('entity_id')
        .eq('entity_type', entityType).eq('deficiency', deficiency)
        .is('resolved_at', null).gte('attempts', STUCK_ATTEMPTS);
      const ids = (data ?? []).map((r: any) => r.entity_id as string);
      return ids.length ? `(${ids.join(',')})` : null;
    };

    const families: FamilyResult[] = [];

    // ── 1. PRODUCT TEXT — ID-targeted + per-row stuck tracking (the live path) ──
    await heartbeat();
    try {
      // Services are excluded, and the exclusion is the point of the cap being finite.
      // This agent repairs what the CREATE path was supposed to embed; services are written
      // by servicesService with no ingest-core call, so an embedding was never owed on them
      // and nothing searches one (`search_products_by_embedding` serves RAG + product
      // enrichment, never the services list).
      let q = supabase.from('products').select('id')
        .is('text_embedding_1024', null)
        .neq('item_type', 'service')
        .order('created_at', { ascending: false })
        .limit(maxProducts);
      if (sinceIso) q = q.gte('created_at', sinceIso);
      const stuckProducts = await stuckFilter('product', 'product_text');
      if (stuckProducts) q = q.not('id', 'in', stuckProducts);
      // A document awaiting review owes no vector yet (#513); counted here it would read as failing and go stuck.
      const { data: deferredDocs } = await supabase.from('documents').select('id').eq('metadata->>embedding_deferred', 'true');
      const deferredIds = (deferredDocs ?? []).map((d: { id: string }) => d.id);
      if (deferredIds.length) q = q.or(`source_document_id.is.null,source_document_id.not.in.(${deferredIds.join(',')})`);
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

    // ── 3. VISUAL — material images with no SLIG vector. Runs first: steps 4 and 5 only select images that have one ──
    await heartbeat();
    try {
      const { data: settling, error: settlingErr } = await supabase.rpc('ingestion_settling_document_ids');
      if (settlingErr) throw new Error(settlingErr.message);
      const settlingIds = ((settling ?? []) as string[]).filter(Boolean);
      const outsideSettling = settlingIds.length
        ? `,or(document_id.is.null,document_id.not.in.(${settlingIds.join(',')}))`
        : '';
      const stuckVisual = await stuckFilter('image', 'visual');
      const extra = (sinceIso ? `,created_at.gte.${sinceIso}` : '') + (stuckVisual ? `,id.not.in.${stuckVisual}` : '');
      const { data: rows, error } = await supabase.from('document_images').select('id')
        .not('image_url', 'is', null)
        .or(`and(${OWES_VISUAL_AND}${outsideSettling}${extra})`)
        .order('created_at', { ascending: false })
        .limit(maxImages);
      if (error) throw new Error(error.message);
      const ids = (rows ?? []).map((r: any) => r.id as string);

      if (ids.length === 0) {
        families.push({ family: 'visual', scanned: 0, fixed: 0, failed: 0, status: 'ok' });
      } else {
        await supabase.rpc('record_embedding_backfill_attempts', { p_entity_type: 'image', p_deficiency: 'visual', p_ids: ids });
        await callMivaa('/api/admin/visual-embeddings/backfill', { image_ids: ids, max_images: ids.length });
        await heartbeat();
        const { data: still } = await supabase.from('document_images').select('id').in('id', ids)
          .or('has_slig_embedding.is.null,has_slig_embedding.eq.false');
        const failedIds = (still ?? []).map((r: any) => r.id as string);
        const fixedIds  = ids.filter((id) => !failedIds.includes(id));
        if (fixedIds.length)  await supabase.rpc('resolve_embedding_backfill_entities', { p_entity_type: 'image', p_deficiency: 'visual', p_ids: fixedIds });
        if (failedIds.length) await supabase.rpc('fail_embedding_backfill_entities',    { p_entity_type: 'image', p_deficiency: 'visual', p_ids: failedIds, p_error: 'visual_still_missing_after_backfill' });
        families.push({ family: 'visual', scanned: ids.length, fixed: fixedIds.length, failed: failedIds.length, status: 'ok' });
        await log(failedIds.length ? 'warn' : 'info', `visual: ${fixedIds.length}/${ids.length} fixed`, { failed_ids: failedIds.slice(0, 50) });
      }
    } catch (e) {
      families.push({ family: 'visual', scanned: 0, fixed: 0, failed: 0, status: 'error', error: msg(e) });
      await log('error', 'visual backfill errored', { error: msg(e) });
    }

    // ── 4. UNDERSTANDING — material images missing the understanding vector ──
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
        const summary = await callMivaa('/api/admin/understanding-embeddings/backfill', { max_images: maxImages, batch_size: 25, skip_settling_documents: true });
        families.push({ family: 'understanding', scanned: Number(summary?.scanned ?? 0), fixed: Number(summary?.reembedded ?? 0), failed: Number(summary?.failed ?? 0), status: 'ok' });
        await log('info', 'understanding backfill', { summary });
      }
    } catch (e) {
      families.push({ family: 'understanding', scanned: 0, fixed: 0, failed: 0, status: 'error', error: msg(e) });
      await log('error', 'understanding backfill errored', { error: msg(e) });
    }

    // ── 5. ASPECTS — ID-targeted; only images whose understanding already landed ──
    await heartbeat();
    try {
      // An image of a still-settling ingestion must never be sent: it would be counted failed, then stuck.
      const { data: settling, error: settlingErr } = await supabase.rpc('ingestion_settling_document_ids');
      if (settlingErr) throw new Error(settlingErr.message);
      const settlingIds = ((settling ?? []) as string[]).filter(Boolean);
      const outsideSettling = settlingIds.length
        ? `,or(document_id.is.null,document_id.not.in.(${settlingIds.join(',')}))`
        : '';
      let aq = supabase.from('document_images').select('id')
        .eq('has_slig_embedding', true)
        .eq('has_understanding_embedding', true)
        .or(`and(or(${ASPECT_DEFICIENT_OR})${outsideSettling})`)
        .order('created_at', { ascending: false })
        .limit(maxImages);
      if (sinceIso) aq = aq.gte('created_at', sinceIso);
      const stuckImages = await stuckFilter('image', 'aspects');
      if (stuckImages) aq = aq.not('id', 'in', stuckImages);
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

    // ── 6. CLASSIFICATION — quarantined images (self-targets via pending marker) ──
    await heartbeat();
    try {
      let pq = supabase.from('document_images').select('id', { count: 'exact', head: true })
        .filter('metadata->ai_classification->>classification_pending', 'eq', 'true');
      if (sinceIso) pq = pq.gte('created_at', sinceIso);
      const { count } = await pq;
      if (!count) {
        families.push({ family: 'classification', scanned: 0, fixed: 0, failed: 0, status: 'ok' });
      } else {
        const summary = await callMivaa('/api/admin/images/classification-backfill', { max_images: maxImages, batch_size: 10, skip_settling_documents: true });
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
        .is('resolved_at', null).gte('attempts', STUCK_ATTEMPTS);
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
