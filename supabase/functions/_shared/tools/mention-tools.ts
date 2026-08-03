/**
 * Mention Monitoring Tools — agent-chat surface for mention tracking.
 *
 * Tools:
 *   - track_product_mentions   — start/stop monitoring on a product or brand
 *   - get_mention_summary      — pull 7d/30d snapshot inline
 *   - check_llm_visibility     — one-shot LLM probe across cheap models
 *   - find_negative_mentions   — filtered feed for reputation triage
 *
 * Cost discipline:
 *   - track_product_mentions / get_mention_summary: 0 credits (DB reads)
 *   - check_llm_visibility:     2 credits (4 templates × 4 cheap models)
 *   - find_negative_mentions:   0 credits (DB read)
 *
 * Module-gated: every tool first verifies `mention-monitoring` is enabled.
 * If not, it returns a friendly error chunk without touching credits.
 */

const { tool } = await import('npm:@langchain/core@1.1.15/tools');
const { z } = await import('npm:zod@3.24.0');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MIVAA_GATEWAY_URL = Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';

const MODULE_SLUG = 'mention-monitoring';
const LLM_PROBE_CREDITS = 2;

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

import { serviceClient as svcClient } from '../supabase-client.ts';
async function isModuleEnabled(): Promise<boolean> {
  try {
    const sb = svcClient();
    const { data } = await sb
      .from('modules')
      .select('enabled')
      .eq('slug', MODULE_SLUG)
      .maybeSingle();
    return Boolean(data?.enabled);
  } catch (_) {
    return false;
  }
}

async function debit(userId: string, amount: number, op: string, productId?: string): Promise<boolean> {
  if (amount <= 0) return true;
  try {
    const sb = svcClient();
    const { data, error } = await sb.rpc('debit_credits', {
      p_user_id: userId,
      p_amount: amount,
      p_operation_type: op,
      p_description: `${op} (mention monitoring agent tool)`,
      p_metadata: { feature: 'mention_monitoring_agent_tool', product_id: productId },
      p_workspace_id: null,
    });
    if (error) {
      console.warn(`mention-tools: debit error: ${error.message}`);
      return false;
    }
    // debit_credits returns a TABLE — first row carries .success + .error_message.
    // Boolean(data) on the array would always be true, treating "Insufficient credits"
    // as a successful debit. We must inspect the first row.
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.success) {
      console.warn(`mention-tools: debit declined for user ${userId}: ${result?.error_message || 'unknown reason'}`);
      return false;
    }

    // Mirror to ai_usage_logs for cost-attribution parity with the rest of
    // the platform (operations dashboard groups by operation_type).
    sb.from('ai_usage_logs').insert({
      user_id: userId,
      product_id: productId ?? null,
      operation_type: op,
      model_name: 'mention-monitoring-agent-tool',
      api_provider: 'platform',
      input_tokens: 0,
      output_tokens: 0,
      input_cost_usd: 0,
      output_cost_usd: 0,
      raw_cost_usd: amount / 100,
      markup_multiplier: 1,
      billed_cost_usd: amount / 100,
      credits_debited: amount,
      metadata: { feature: 'mention_monitoring_agent_tool', module_slug: MODULE_SLUG, product_id: productId },
      created_at: new Date().toISOString(),
    }).then(({ error }) => {
      if (error) console.warn('mention-tools: ai_usage_logs insert failed (non-blocking):', error.message);
    });

    return true;
  } catch (e) {
    console.warn(`mention-tools: debit failed: ${e instanceof Error ? e.message : e}`);
    return false;
  }
}

async function refund(userId: string, amount: number, op: string, productId?: string): Promise<void> {
  if (amount <= 0) return;
  try {
    const sb = svcClient();
    const { error: refundError } = await sb.rpc('refund_credits', {
      p_user_id: userId,
      p_amount: amount,
      p_operation_type: `${op}.refund`,
      p_description: `${op}.refund (mention monitoring agent tool)`,
      p_metadata: { feature: 'mention_monitoring_agent_tool', product_id: productId, reason: 'tool_call_failed' },
      p_workspace_id: null,
    });
    // supabase-js RESOLVES on an RPC error instead of throwing, so discarding this result made a
    // failed refund indistinguishable from a successful one. The user has already been debited
    // for a tool call that failed; a silent refund failure means they simply stay charged.
    if (refundError) {
      console.error(`mention-tools: refund_credits FAILED for ${op} — user ${userId} stays debited ${amount}:`, refundError.message);
    }

    // Mirror refund as a negative-credit row so dashboard nets out correctly.
    sb.from('ai_usage_logs').insert({
      user_id: userId,
      product_id: productId ?? null,
      operation_type: `${op}.refund`,
      model_name: 'mention-monitoring-agent-tool',
      api_provider: 'platform',
      input_tokens: 0,
      output_tokens: 0,
      input_cost_usd: 0,
      output_cost_usd: 0,
      raw_cost_usd: -amount / 100,
      markup_multiplier: 1,
      billed_cost_usd: -amount / 100,
      credits_debited: -amount,
      metadata: { feature: 'mention_monitoring_agent_tool', module_slug: MODULE_SLUG, product_id: productId, refund: true },
      created_at: new Date().toISOString(),
    }).then(({ error }) => {
      if (error) console.warn('mention-tools: refund ai_usage_logs insert failed (non-blocking):', error.message);
    });
  } catch (e) {
    console.error(`mention-tools: refund threw for ${op} — user ${userId} stays debited ${amount}:`, e);
  }
}

async function getProductRow(productId: string) {
  const sb = svcClient();
  const { data } = await sb
    .from('products')
    // `products.manufacturer` does not exist — brand is the `brand_company_id` FK. It was
    // selected here and never read, but its presence made PostgREST reject the whole
    // statement, so this returned null and the tool told the user their product does not
    // exist. Dropped rather than embedded, since nothing consumes it.
    .select('id, name, metadata')
    .eq('id', productId)
    .maybeSingle();
  return data;
}

async function getTrackedForProduct(productId: string) {
  const sb = svcClient();
  const { data } = await sb
    .from('tracked_mentions')
    .select('*')
    .eq('product_id', productId)
    .is('api_key_id', null)
    .maybeSingle();
  return data;
}

async function callMivaa(
  path: string,
  init: RequestInit & { jwt?: string } = {},
): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (init.jwt) {
    headers.set('Authorization', `Bearer ${init.jwt}`);
  } else {
    headers.set('Authorization', `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`);
  }
  try {
    const resp = await fetch(`${MIVAA_GATEWAY_URL}${path}`, { ...init, headers });
    const text = await resp.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { ok: resp.ok, status: resp.status, data: parsed, error: resp.ok ? undefined : String(parsed)?.slice(0, 200) };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : 'network error' };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 1) track_product_mentions
// ───────────────────────────────────────────────────────────────────────────

export const createTrackProductMentionsTool = (
  userId: string,
  workspaceId: string,
  jwt: string | undefined,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ product_id, action, aliases, auto_expand_aliases, sources_enabled, language_codes, country_codes, alert_on_spike, alert_on_negative_sentiment, alert_on_new_outlet, alert_on_llm_visibility_change }) => {
      if (!await isModuleEnabled()) {
        return JSON.stringify({ success: false, error: 'mention-monitoring module disabled — ask an admin to enable it' });
      }
      const product = await getProductRow(product_id);
      if (!product) return JSON.stringify({ success: false, error: `product ${product_id} not found` });

      onChunk?.({ type: 'tool_progress', status: `${action} mention monitoring for "${product.name}"...`, timestamp: Date.now() });

      if (action === 'stop') {
        const r = await callMivaa(
          `/api/v1/mention-monitoring/products/${product_id}/track`,
          { method: 'DELETE', jwt },
        );
        return JSON.stringify({ success: r.ok, ...r.data });
      }
      // start
      const body: Record<string, any> = {
        run_first_refresh: true,
      };
      if (aliases?.length) body.aliases = aliases;
      if (auto_expand_aliases !== undefined) body.auto_expand_aliases = auto_expand_aliases;
      if (sources_enabled) body.sources_enabled = sources_enabled;
      if (language_codes?.length) body.language_codes = language_codes;
      if (country_codes?.length) body.country_codes = country_codes;
      if (alert_on_spike !== undefined) body.alert_on_spike = alert_on_spike;
      if (alert_on_negative_sentiment !== undefined) body.alert_on_negative_sentiment = alert_on_negative_sentiment;
      if (alert_on_new_outlet !== undefined) body.alert_on_new_outlet = alert_on_new_outlet;
      if (alert_on_llm_visibility_change !== undefined) body.alert_on_llm_visibility_change = alert_on_llm_visibility_change;

      const r = await callMivaa(
        `/api/v1/mention-monitoring/products/${product_id}/track`,
        { method: 'POST', body: JSON.stringify(body), jwt },
      );
      if (!r.ok) {
        return JSON.stringify({ success: false, error: r.error || `backend ${r.status}` });
      }
      onChunk?.({
        type: 'mention_tracking_started',
        product_id,
        product_name: product.name,
        tracked: r.data?.data,
        timestamp: Date.now(),
      });
      return JSON.stringify({ success: true, data: r.data?.data });
    },
    {
      name: 'track_product_mentions',
      description: 'Start or stop mention monitoring on a product. Returns the tracked_mentions row including alert preferences and the first-refresh outcome.',
      schema: z.object({
        product_id: z.string().describe('Product UUID to track.'),
        action: z.enum(['start', 'stop']).default('start'),
        aliases: z.array(z.string()).optional().describe('Alternate spellings/SKUs/abbreviations to use as additional discovery queries.'),
        auto_expand_aliases: z.boolean().optional().describe('Default false. When true, an LLM (Haiku) expands the subject_label into per-word aliases on first refresh — broader recall on multi-word labels but higher cost.'),
        sources_enabled: z.record(z.boolean()).optional().describe('Per-source toggles e.g. { news:true, blogs:true, youtube:false, rss:true, llm:true }'),
        language_codes: z.array(z.string()).optional(),
        country_codes: z.array(z.string()).optional(),
        alert_on_spike: z.boolean().optional(),
        alert_on_negative_sentiment: z.boolean().optional(),
        alert_on_new_outlet: z.boolean().optional(),
        alert_on_llm_visibility_change: z.boolean().optional(),
      }),
    },
  );
};

// ───────────────────────────────────────────────────────────────────────────
// 2) get_mention_summary
// ───────────────────────────────────────────────────────────────────────────

export const createGetMentionSummaryTool = (
  userId: string,
  jwt: string | undefined,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ product_id, days = 30 }) => {
      if (!await isModuleEnabled()) {
        return JSON.stringify({ success: false, error: 'mention-monitoring disabled' });
      }
      onChunk?.({ type: 'tool_progress', status: `Loading ${days}d mention summary...`, timestamp: Date.now() });
      const r = await callMivaa(
        `/api/v1/mention-monitoring/products/${product_id}/summary?days=${days}`,
        { method: 'GET', jwt },
      );
      if (!r.ok) return JSON.stringify({ success: false, error: r.error || `backend ${r.status}` });
      const summary = r.data?.data;
      if (!summary) return JSON.stringify({ success: true, data: null, message: 'product not enrolled in mention monitoring' });
      onChunk?.({
        type: 'mention_summary',
        product_id,
        days,
        summary,
        timestamp: Date.now(),
      });
      return JSON.stringify({ success: true, summary });
    },
    {
      name: 'get_mention_summary',
      description: 'Fetch the rolling mention summary for a product: total count, sentiment breakdown, top outlets. 0 credits.',
      schema: z.object({
        product_id: z.string(),
        days: z.number().int().min(1).max(180).default(30),
      }),
    },
  );
};

// ───────────────────────────────────────────────────────────────────────────
// 3) check_llm_visibility
// ───────────────────────────────────────────────────────────────────────────

export const createCheckLlmVisibilityTool = (
  userId: string,
  jwt: string | undefined,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ product_id, models, force_run }) => {
      if (!await isModuleEnabled()) {
        return JSON.stringify({ success: false, error: 'mention-monitoring disabled' });
      }
      // If force_run, debit + run probe; otherwise return latest cached snapshot
      if (force_run) {
        const ok = await debit(userId, LLM_PROBE_CREDITS, 'mention.llm_probe', product_id);
        if (!ok) return JSON.stringify({ success: false, error: 'insufficient credits' });
        onChunk?.({ type: 'tool_progress', status: 'Running LLM visibility probe across models...', timestamp: Date.now() });
        let r: { ok: boolean; status: number; data?: any; error?: string };
        try {
          r = await callMivaa(
            `/api/v1/mention-monitoring/products/${product_id}/probe-llm`,
            { method: 'POST', body: JSON.stringify({ models }), jwt },
          );
        } catch (probeErr) {
          // Network or unexpected error — refund and surface
          await refund(userId, LLM_PROBE_CREDITS, 'mention.llm_probe', product_id);
          return JSON.stringify({ success: false, error: probeErr instanceof Error ? probeErr.message : 'probe-llm failed' });
        }
        if (!r.ok) {
          await refund(userId, LLM_PROBE_CREDITS, 'mention.llm_probe', product_id);
          return JSON.stringify({ success: false, error: r.error || `backend ${r.status}` });
        }
      }
      // Read latest snapshot
      const sn = await callMivaa(
        `/api/v1/mention-monitoring/products/${product_id}/llm-visibility`,
        { method: 'GET', jwt },
      );
      if (!sn.ok) return JSON.stringify({ success: false, error: sn.error || `backend ${sn.status}` });
      const snapshot = sn.data?.data;
      onChunk?.({
        type: 'llm_visibility_result',
        product_id,
        snapshot,
        forced: !!force_run,
        credits_used: force_run ? LLM_PROBE_CREDITS : 0,
        timestamp: Date.now(),
      });
      return JSON.stringify({ success: true, snapshot, credits_used: force_run ? LLM_PROBE_CREDITS : 0 });
    },
    {
      name: 'check_llm_visibility',
      description: 'Inspect how a product/brand appears in LLM responses (Haiku, GPT-4o-mini, Gemini Flash, Sonar). Returns share-of-voice, average rank, top competitors. Set force_run:true to fire a fresh probe (2 credits); otherwise reads the most recent snapshot (0 credits).',
      schema: z.object({
        product_id: z.string(),
        models: z.array(z.string()).optional().describe('Subset of: claude-haiku-4-5, gpt-4o-mini, gemini-2.0-flash, sonar'),
        force_run: z.boolean().default(false).describe('If true, fires a new probe run instead of reading the latest snapshot.'),
      }),
    },
  );
};

// ───────────────────────────────────────────────────────────────────────────
// 4) find_negative_mentions
// ───────────────────────────────────────────────────────────────────────────

export const createFindNegativeMentionsTool = (
  userId: string,
  jwt: string | undefined,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ product_id, days = 30, limit = 25 }) => {
      if (!await isModuleEnabled()) {
        return JSON.stringify({ success: false, error: 'mention-monitoring disabled' });
      }
      onChunk?.({ type: 'tool_progress', status: 'Loading negative-sentiment mentions...', timestamp: Date.now() });
      const r = await callMivaa(
        `/api/v1/mention-monitoring/products/${product_id}/history?days=${days}&sentiment=negative&limit=${limit}`,
        { method: 'GET', jwt },
      );
      if (!r.ok) return JSON.stringify({ success: false, error: r.error || `backend ${r.status}` });
      const rows = r.data?.data || [];
      onChunk?.({
        type: 'mention_feed',
        product_id,
        days,
        sentiment_filter: 'negative',
        rows,
        timestamp: Date.now(),
      });
      return JSON.stringify({
        success: true,
        count: rows.length,
        rows: rows.slice(0, 10), // truncated for context budget
        all_returned_via_chunk: rows.length > 10,
      });
    },
    {
      name: 'find_negative_mentions',
      description: 'List recent negative-sentiment mentions for a product. Useful for reputation triage.',
      schema: z.object({
        product_id: z.string(),
        days: z.number().int().min(1).max(180).default(30),
        limit: z.number().int().min(1).max(100).default(25),
      }),
    },
  );
};
