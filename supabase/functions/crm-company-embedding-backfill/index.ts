/**
 * CRM company embedding drain (#289 — lookalike companies).
 *
 * Keeps `crm_companies.text_embedding_1024` in step with what the company actually
 * says about itself, so the Market tab's "Similar companies in your CRM" panel has
 * something to rank.
 *
 * There is no trigger and no refresh-on-write hook, on purpose. The backlog is
 * derived: `crm_companies_embedding_backlog()` returns every row whose stored
 * `embedding_source_hash` differs from the hash of `crm_company_embedding_text(id)`
 * computed right now. A company edited in the CRM, re-imported from ΑΑΔΕ/ΓΕΜΗ, or
 * whose catalog products changed all fall out of that one comparison — including the
 * writers nobody remembered to hook (XML import, company-enrich, the bulk bar). The
 * first run is therefore also the backfill; there is no separate one.
 *
 * Sequential, small batches — the same courtesy to MIVAA that kb-embedding-backfill
 * pays. A pg_cron job drains it; it is idempotent and early-returns when clean.
 *
 * One hazard worth knowing about before you add a field to the derivation:
 * `crm_companies` carries a BEFORE-UPDATE normaliser (`crm_normalize_country`) that can
 * rewrite `country` / `country_code` / `state`, and the derivation reads all three. If our
 * own write ever changed one of them, the hash would move and every embed would re-queue
 * itself — a paid loop with no error anywhere. Verified 2026-08-15 across all 42 live
 * companies: this exact update changes nothing the derivation reads. Re-check it if you add
 * a derivation input that any BEFORE-write trigger touches.
 *
 * Auth: service-role bearer or x-cron-secret (cron / internal), or an admin JWT.
 */

import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, isAdminAccess, isCronAuthorized } from '../_shared/auth.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MIVAA_URL = () => Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';
// Lazy: the secrets bootstrap populates env at handler entry, so a module-load capture
// reads undefined.
const CRON_SECRET = () => Deno.env.get('CRON_SECRET') || '';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

interface BacklogRow {
  id: string;
  workspace_id: string | null;
  source_text: string | null;
  source_hash: string;
}

/** Embed one company and store the result. Never throws — the batch keeps draining. */
async function embedOne(row: BacklogRow): Promise<'success' | 'skipped' | 'failed'> {
  // Nothing to embed beyond a bare name. Record that as a VERDICT, not as an absence:
  // left `pending` the row would be re-picked every run forever, and would read to the
  // integrity probe as a backlog that never drains.
  if (!row.source_text || !row.source_text.trim()) {
    const { error } = await supabaseAdmin.from('crm_companies').update({
      text_embedding_1024: null,
      embedding_status: 'skipped',
      embedding_source_hash: row.source_hash,
      embedding_model: null,
      embedding_error_message: null,
      embedding_updated_at: new Date().toISOString(),
    }).eq('id', row.id);
    // supabase-js RESOLVES on an RLS/constraint denial. Unchecked, a failed verdict-write
    // leaves the row pending with a stale hash — so it is re-picked on EVERY run, forever,
    // crowding out real work while the backlog never drains and nothing says why.
    if (error) {
      console.error(`[crm-company-embedding-backfill] could not mark ${row.id} skipped:`, error.message);
      return 'failed';
    }
    return 'skipped';
  }

  try {
    const res = await fetch(`${MIVAA_URL()}/api/embeddings/clip-text`, {
      method: 'POST',
      // /api/embeddings/* sits outside the JWT middleware and is gated by
      // verify_internal_access; x-cron-secret is the branch that is a plain string
      // compare, so it works where a service-role Bearer would not (audit #12).
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET() },
      body: JSON.stringify({
        text: row.source_text.substring(0, 8000),
        model: 'voyage-4',
        // 'document' — these are stored vectors. The lookalike search never embeds a
        // query: it reads the seed company's own stored vector, so both sides of the
        // comparison are document-side and Voyage's asymmetric contract is respected.
        input_type: 'document',
        dimensions: 1024,
        // Attribution only (MIVAA authenticates by x-cron-secret, never by this field).
        // Without it the spend lands in ai_usage_logs owned by nobody.
        workspace_id: row.workspace_id ?? null,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`MIVAA embedding API ${res.status}: ${body.substring(0, 160)}`);
    }
    const result = await res.json();
    if (!result?.success || !Array.isArray(result.embedding)) {
      throw new Error(`MIVAA embedding failed: ${result?.error ?? 'no embedding returned'}`);
    }

    const { error } = await supabaseAdmin.from('crm_companies').update({
      text_embedding_1024: result.embedding,
      embedding_status: 'success',
      embedding_source_hash: row.source_hash,
      embedding_model: 'voyage-4',
      embedding_error_message: null,
      embedding_updated_at: new Date().toISOString(),
    }).eq('id', row.id);
    if (error) throw new Error(`Failed to save embedding: ${error.message}`);
    return 'success';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // The hash is deliberately NOT stored on failure: the row stays in the backlog and is
    // retried once the 6-hour cool-off in crm_companies_embedding_backlog expires.
    const { error: markErr } = await supabaseAdmin.from('crm_companies').update({
      embedding_status: 'failed',
      embedding_error_message: msg,
      embedding_updated_at: new Date().toISOString(),
    }).eq('id', row.id);
    // Losing this write costs the cool-off: the row comes back on the very next tick and
    // hammers whatever just failed. Worth a line in the log.
    if (markErr) {
      console.error(`[crm-company-embedding-backfill] could not mark ${row.id} failed:`, markErr.message);
    }
    console.error(`[crm-company-embedding-backfill] ${row.id}: ${msg}`);
    return 'failed';
  }
}

Deno.serve(withApiLogging('crm-company-embedding-backfill', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (!isCronAuthorized(req)) {
    const auth = await authenticate(req, { allowedRoles: ['admin'] });
    if (!auth.success && !isAdminAccess(auth)) {
      return new Response(JSON.stringify({ error: auth.error || 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const rawLimit = (body as Record<string, unknown>)?.limit;
  const limit = typeof rawLimit === 'number'
    ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(rawLimit)))
    : DEFAULT_LIMIT;

  const { data, error } = await supabaseAdmin.rpc('crm_companies_embedding_backlog', { p_limit: limit });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const rows = (data ?? []) as BacklogRow[];
  let succeeded = 0, skipped = 0, failed = 0;

  // Sequential — one at a time, so a large first-run backfill does not stampede MIVAA.
  for (const row of rows) {
    const verdict = await embedOne(row);
    if (verdict === 'success') succeeded++;
    else if (verdict === 'skipped') skipped++;
    else failed++;
  }

  // Re-read the backlog rather than subtracting: a row can leave it for reasons this
  // invocation did not cause (someone edited a company mid-run), and a computed
  // "remaining" would quietly disagree with the table.
  const { data: after } = await supabaseAdmin.rpc('crm_companies_embedding_backlog', { p_limit: MAX_LIMIT });
  const remaining = (after ?? []).length;

  return new Response(JSON.stringify({
    success: true,
    processed: rows.length,
    succeeded,
    skipped,
    failed,
    remaining,
    // The backlog probe is capped at MAX_LIMIT — say so, so a plateau at 200 is not
    // read as a stalled drain.
    remaining_capped: remaining >= MAX_LIMIT,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}));
