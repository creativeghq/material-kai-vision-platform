/** trigger-factory-enrichment */

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, isAdminAccess, userHasWorkspaceCapability } from '../_shared/auth.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import {
  propagateFactoryFieldsInScope,
  factoryCompletenessScore,
  isFactoryScopeColumn,
  type FactoryObject,
  type FactoryScopeColumn,
} from '../_shared/agents/propagation-utils.ts';

const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(withApiLogging('trigger-factory-enrichment', async (req: Request) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const auth = await authenticate(req);
  if (!auth.success) {
    return new Response(JSON.stringify({ error: auth.error ?? 'Unauthorized' }), {
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
    product_ids?:     unknown;
    scope_column?:    unknown;
    scope_value?:     unknown;
    force_enrichment?: boolean;
  };

  if (!workspace_id) {
    return new Response(JSON.stringify({ error: 'workspace_id is required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Every read and write below runs as the service role, so workspace_id bounds all of them.
  if (!isAdminAccess(auth) && !(await userHasWorkspaceCapability(supabase, auth.userId, workspace_id, ['catalog.import', 'workspace.manage']))) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (scope_column !== undefined && !isFactoryScopeColumn(scope_column)) {
    return new Response(JSON.stringify({ error: 'Unsupported scope_column' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const scopeColumn: FactoryScopeColumn | null = isFactoryScopeColumn(scope_column) ? scope_column : null;
  const scopeValue = typeof scope_value === 'string' && scope_value ? scope_value : null;

  if (product_ids !== undefined && (!Array.isArray(product_ids) || product_ids.some((id) => typeof id !== 'string'))) {
    return new Response(JSON.stringify({ error: 'product_ids must be an array of ids' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const requestedIds = [...new Set((product_ids as string[] | undefined) ?? [])].slice(0, 200);

  if (requestedIds.length > 0) {
    const { data: owned, error: ownErr } = await supabase
      .from('products')
      .select('id')
      .eq('workspace_id', workspace_id)
      .in('id', requestedIds);
    if (ownErr) {
      return new Response(JSON.stringify({ error: ownErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if ((owned ?? []).length !== requestedIds.length) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  // ── Step 1: Propagate factory within scope ───────────────────────────────
  let propagated = 0;

  if (scopeColumn && scopeValue) {
    try {
      propagated = await propagateFactoryFieldsInScope(supabase, workspace_id, scopeColumn, scopeValue);
    } catch (e) {
      return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    console.log(`[trigger-factory-enrichment] Propagated factory to ${propagated} products in ${scopeColumn}=${scopeValue}`);
  }

  // ── Step 2: Determine if enrichment is needed ────────────────────────────
  let sampleProductIds: string[] = requestedIds;

  if (sampleProductIds.length === 0 && scopeColumn && scopeValue) {
    const { data } = await supabase
      .from('products')
      .select('id')
      .eq('workspace_id', workspace_id)
      .eq(scopeColumn, scopeValue)
      .limit(50);
    sampleProductIds = (data ?? []).map((r: { id: string }) => r.id);
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
    .eq('workspace_id', workspace_id)
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
  if (scopeColumn && scopeValue) {
    inputData.scope_column = scopeColumn;
    inputData.scope_value  = scopeValue;
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
}));
