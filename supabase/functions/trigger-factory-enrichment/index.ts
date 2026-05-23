/**
 * trigger-factory-enrichment
 *
 * Called by all 3 import pipelines (PDF, XML, Scraping) after products are
 * inserted/updated. Does two things:
 *
 *   1. Propagates the best available factory object to all products in the
 *      same scope (source_document_id OR scrape_session_id).
 *
 *   2. If the resulting completeness score is still below 0.9, queues a
 *      background agent job (agent_type = 'factory-enrichment') so Apollo,
 *      Firecrawl, and Hunter.io can fill the remaining gaps.
 *
 * Request body:
 *   workspace_id        string   (required)
 *   product_ids         string[] (optional) specific product IDs to check
 *   scope_column        'source_document_id' | 'scrape_session_id'  (optional)
 *   scope_value         string   (optional) value for scope_column
 *   force_enrichment    boolean  (optional, default false) skip score check
 *
 * Response:
 *   { propagated, queued_job_id? }
 */

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

import { corsHeaders } from '../_shared/cors.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import {
  propagateFactoryFieldsInScope,
  factoryCompletenessScore,
  type FactoryObject,
} from '../_shared/agents/propagation-utils.ts';

const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type ScopeColumn = 'source_document_id' | 'scrape_session_id';

Deno.serve(async (req: Request) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Allow service-role calls (from Python backend) without user JWT
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.includes(SUPABASE_SERVICE_ROLE_KEY) && !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const {
    workspace_id,
    product_ids,
    scope_column,
    scope_value,
    force_enrichment = false,
  } = body as {
    workspace_id:     string;
    product_ids?:     string[];
    scope_column?:    ScopeColumn;
    scope_value?:     string;
    force_enrichment?: boolean;
  };

  if (!workspace_id) {
    return new Response(JSON.stringify({ error: 'workspace_id is required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Step 1: Propagate factory within scope ───────────────────────────────
  let propagated = 0;

  if (scope_column && scope_value) {
    propagated = await propagateFactoryFieldsInScope(supabase, scope_column, scope_value);
    console.log(`[trigger-factory-enrichment] Propagated factory to ${propagated} products in ${scope_column}=${scope_value}`);
  }

  // ── Step 2: Determine if enrichment is needed ────────────────────────────
  // Sample products to check completeness
  let sampleProductIds: string[] = product_ids ?? [];

  if (sampleProductIds.length === 0 && scope_column && scope_value) {
    const { data } = await supabase
      .from('products')
      .select('id')
      .eq(scope_column, scope_value)
      .limit(50);
    sampleProductIds = (data ?? []).map((r: any) => r.id);
  }

  if (sampleProductIds.length === 0) {
    return new Response(
      JSON.stringify({ propagated, queued_job_id: null, reason: 'no_products' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // Load a sample of metadata to score completeness
  const { data: sampleRows } = await supabase
    .from('products')
    .select('metadata')
    .in('id', sampleProductIds.slice(0, 10));

  let needsEnrichment = force_enrichment;

  if (!needsEnrichment && sampleRows && sampleRows.length > 0) {
    // Check if average completeness is below threshold
    const scores = sampleRows.map((r: any) => {
      const factory = (r.metadata as any)?.factory as FactoryObject | undefined;
      return factoryCompletenessScore(factory);
    });
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    needsEnrichment = avgScore < 0.9;

    console.log(`[trigger-factory-enrichment] Avg factory completeness: ${(avgScore * 100).toFixed(0)}%`);
  }

  if (!needsEnrichment) {
    return new Response(
      JSON.stringify({ propagated, queued_job_id: null, reason: 'already_complete' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // ── Step 3: Find the factory-enrichment agent for this workspace ─────────
  const { data: agentRow } = await supabase
    .from('background_agents')
    .select('id')
    .eq('workspace_id', workspace_id)
    .eq('agent_type', 'factory-enrichment')
    .eq('enabled', true)
    .single();

  if (!agentRow) {
    console.warn(`[trigger-factory-enrichment] No factory-enrichment agent found for workspace ${workspace_id}`);
    return new Response(
      JSON.stringify({ propagated, queued_job_id: null, reason: 'no_agent_configured' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // ── Step 4: Queue an agent_run ───────────────────────────────────────────
  const inputData: Record<string, unknown> = {
    product_ids:  sampleProductIds,
    workspace_id,
  };
  if (scope_column && scope_value) {
    inputData.scope_column = scope_column;
    inputData.scope_value  = scope_value;
  }

  const { data: runRow, error: runErr } = await supabase
    .from('agent_runs')
    .insert({
      agent_id:           agentRow.id,
      status:             'pending',
      triggered_by:       'event',
      trigger_event_type: 'factory_enrichment_needed',
      input_data:         inputData,
      workspace_id,
    })
    .select('id')
    .single();

  if (runErr || !runRow) {
    console.error('[trigger-factory-enrichment] Failed to create run:', runErr);
    return new Response(
      JSON.stringify({ propagated, queued_job_id: null, error: runErr?.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  console.log(`[trigger-factory-enrichment] Queued factory-enrichment run ${runRow.id} for workspace ${workspace_id}`);

  return new Response(
    JSON.stringify({ propagated, queued_job_id: runRow.id }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
