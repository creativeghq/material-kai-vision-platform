/**
 * Background Agent Runner
 *
 * Universal executor for all background agents.
 * Triggered by: scheduler cron, event emission, manual API call, chain trigger.
 *
 * Request body:
 *   agent_id      string   (required) ID from background_agents table
 *   run_id        string   (optional) Resume/update an existing pending run
 *   input_data    object   (optional) Override / augment config input
 *   triggered_by  string   (optional) 'cron' | 'event' | 'manual' | 'chain' | 'api'
 *
 * Response:
 *   { success, run_id, status, duration_ms, output? }
 */

const ANTHROPIC_API_KEY = () => Deno.env.get('ANTHROPIC_API_KEY') || '';
const SUPABASE_URL             = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MIVAA_GATEWAY_URL        = Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';
const MIVAA_API_KEY            = Deno.env.get('MIVAA_API_KEY') || '';

import { corsHeaders }        from '../_shared/cors.ts';
import { authenticate }       from '../_shared/auth.ts';
import { emitFlowEvent }      from '../_shared/flow-events.ts';
import { createLogHelper, createHeartbeatHelper } from '../_shared/agents/base-agent.ts';
import { getRunnerGated, AGENT_TYPE_CATALOG } from '../_shared/agents/registry.ts';
import { DelegateToMivaaError, CancelledError } from '../_shared/agents/types.ts';
import type { BackgroundAgentRecord, AgentRunRecord, AgentRunContext } from '../_shared/agents/types.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const { createClient } = await import('@supabase/supabase-js');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(withApiLogging('background-agent-runner', async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // ── Catalog endpoint (GET) ───────────────────────────────────────────────
  if (req.method === 'GET') {
    const url    = new URL(req.url);
    if (url.searchParams.get('catalog') === '1') {
      return new Response(JSON.stringify({ catalog: AGENT_TYPE_CATALOG }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response('Use POST to run an agent', { status: 405, headers: corsHeaders });
  }

  // ── Auth ─────────────────────────────────────────────────────────────────
  // This function is invoked server-to-server by the scheduler cron, the event
  // emitter, chain triggers, and agent-chat — all of which present the project
  // service-role key as `Authorization: Bearer <service_role_key>`. Accept that
  // directly; any other caller must carry a valid user/secret credential.
  //
  // CRITICAL: authenticate() returns { success:false } (it does NOT throw) for a
  // service-role bearer — it falls through to validateUserToken() and getUser()
  // resolves to "no user" without raising. So the service-role check MUST run on
  // the !success path, not only inside a catch. The previous catch-only fallback
  // was dead code: every cron/event/chain dispatch was rejected with 401, which
  // is why these agents never produced a single run since creation.
  const authHeader = req.headers.get('Authorization') || '';
  const isServiceRole =
    !!SUPABASE_SERVICE_ROLE_KEY && authHeader.includes(SUPABASE_SERVICE_ROLE_KEY);

  let authedUserId: string | null = null;
  if (!isServiceRole) {
    let authed = false;
    try {
      const auth = await authenticate(req);
      authed = auth.success;
      authedUserId = auth.userId ?? null;
    } catch {
      authed = false;
    }
    if (!authed || !authedUserId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  const startTime = Date.now();
  let body: Record<string, unknown>;

  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { agent_id, run_id, input_data = {}, triggered_by = 'manual' } = body as {
    agent_id:      string;
    run_id?:       string;
    input_data?:   Record<string, unknown>;
    triggered_by?: string;
  };

  if (!agent_id) {
    return new Response(JSON.stringify({ error: 'agent_id is required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Load agent config ────────────────────────────────────────────────────
  const { data: agentConfig, error: agentErr } = await supabase
    .from('background_agents')
    .select('*')
    .eq('id', agent_id)
    .single();

  if (agentErr || !agentConfig) {
    return new Response(JSON.stringify({ error: 'Agent not found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!agentConfig.enabled) {
    return new Response(JSON.stringify({ error: 'Agent is disabled' }), {
      status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Tenancy: a JWT caller may only run agents in a workspace they belong to. Service-role
  // callers (scheduler cron / event / chain / agent-chat dispatch) are exempt. Without this,
  // any authenticated user could force-run ANOTHER tenant's agent (forced execution + credit/
  // resource burn on that tenant) by passing its agent_id.
  if (!isServiceRole) {
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', agentConfig.workspace_id)
      .eq('user_id', authedUserId)
      .eq('status', 'active')
      .maybeSingle();
    if (!membership) {
      return new Response(JSON.stringify({ error: "You are not a member of this agent's workspace" }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  // ── Look up runner ───────────────────────────────────────────────────────
  // Use the module-aware variant so disabled-module agents fail closed —
  // disabling a feature module (e.g. Social Media) really stops its agents.
  const gated = await getRunnerGated(agentConfig.agent_type);
  if (gated.runner === undefined) {
    if (gated.skipped === 'unknown_agent_type') {
      return new Response(JSON.stringify({ error: `No runner registered for agent_type "${agentConfig.agent_type}"` }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(
      JSON.stringify({
        error: `Agent skipped: module "${gated.moduleSlug}" is disabled`,
        skipped: gated.skipped,
        module_slug: gated.moduleSlug,
      }),
      { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
  const runner = gated.runner;

  // ── Create or load run record ────────────────────────────────────────────
  let run: AgentRunRecord;

  if (run_id) {
    // .single() throws PGRST116 (Not Acceptable) when zero rows match, so the
    // previous "ignore the error and check !existingRun" pattern would mask
    // legitimate DB errors as "run_id not found". Switch to maybeSingle and
    // surface real errors as 500 so the cron / chat dispatcher sees them.
    const { data: existingRun, error: lookupErr } = await supabase
      .from('agent_runs')
      .select('*')
      .eq('id', run_id)
      .maybeSingle();
    if (lookupErr) {
      return new Response(JSON.stringify({ error: `Failed to load run: ${lookupErr.message}` }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!existingRun) {
      return new Response(JSON.stringify({ error: 'run_id not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    run = existingRun as AgentRunRecord;
  } else {
    const { data: newRun, error: createErr } = await supabase
      .from('agent_runs')
      .insert({
        agent_id,
        status:       'processing',
        triggered_by,
        input_data:   input_data || {},
        workspace_id: agentConfig.workspace_id,
        started_at:   new Date().toISOString(),
        last_heartbeat: new Date().toISOString(),
      })
      .select()
      .single();

    if (createErr || !newRun) {
      return new Response(JSON.stringify({ error: 'Failed to create run record' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    run = newRun as AgentRunRecord;
  }

  // Mark as processing
  await supabase
    .from('agent_runs')
    .update({ status: 'processing', started_at: new Date().toISOString() })
    .eq('id', run.id);

  const log       = createLogHelper(supabase, run.id);
  const heartbeat = createHeartbeatHelper(supabase, run.id);

  // When loading an existing run by run_id (chat dispatch), use the DB-stored
  // input_data as the authoritative source so conversation_id and all fields are intact.
  const effectiveInput = run_id
    ? { ...agentConfig.config, ...run.input_data }
    : { ...agentConfig.config, ...(input_data || {}) };

  const ctx: AgentRunContext = {
    supabase,
    agentConfig:     agentConfig as BackgroundAgentRecord,
    run,
    input:           effectiveInput,
    workspaceId:     agentConfig.workspace_id,
    mivaaGatewayUrl: MIVAA_GATEWAY_URL,
    mivaaApiKey:     MIVAA_API_KEY,
    anthropicApiKey: ANTHROPIC_API_KEY(),
    log,
    heartbeat,
  };

  // ── Execute ──────────────────────────────────────────────────────────────
  try {
    await log('info', `Agent "${agentConfig.name}" started`, { triggered_by, input_data });

    const result = await runner.run(ctx);

    const duration = Date.now() - startTime;

    // Update run as completed
    await supabase
      .from('agent_runs')
      .update({
        status:        'completed',
        output_data:   result.output,
        model_used:    agentConfig.model,
        input_tokens:  result.inputTokens,
        output_tokens: result.outputTokens,
        credits_debited: result.creditsDebited,
        completed_at:  new Date().toISOString(),
        duration_ms:   duration,
      })
      .eq('id', run.id);

    // Update agent stats
    await supabase
      .from('background_agents')
      .update({
        last_run_at:     new Date().toISOString(),
        last_run_status: 'completed',
        run_count:       (agentConfig.run_count || 0) + 1,
      })
      .eq('id', agent_id);

    await log('info', `Agent completed in ${duration}ms`, {
      inputTokens:  result.inputTokens,
      outputTokens: result.outputTokens,
    });

    // Notify workspace owner/admin that agent run completed
    if (agentConfig.workspace_id) {
      const { data: ownerMember } = await supabase
        .from('workspace_members')
        .select('user_id')
        .eq('workspace_id', agentConfig.workspace_id)
        .in('role', ['owner', 'admin'])
        .limit(1)
        .maybeSingle();
      if (ownerMember?.user_id) {
        // Delivered by the "Agent Run Completed" flow (Flows dashboard).
        emitFlowEvent('agent_search_completed', {
          user_id: ownerMember.user_id,
          type: 'agent_run_done',
          title: `Agent "${agentConfig.name}" completed`,
          body: 'Background agent run finished successfully.',
          action_url: '/admin/background-agents',
          agent_id,
          run_id: run.id,
        }).catch(() => {});
      }
    }

    // Post result back to the originating KAI chat conversation (if dispatched from chat)
    const conversationId = (run.input_data as any)?.conversation_id as string | null;
    if (conversationId && result.success) {
      await postResultToChat(
        conversationId,
        run.id,
        (run.input_data as any)?.task_prompt ?? 'background task',
        result.output,
      );
    }

    // Chain trigger
    if (result.triggerChain) {
      triggerChainedAgents(agent_id, run.id, result.output);
    }

    return new Response(JSON.stringify({
      success:     result.success,
      run_id:      run.id,
      status:      'completed',
      duration_ms: duration,
      output:      result.output,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    const duration = Date.now() - startTime;

    // Cancellation signalled via heartbeat — admin flipped status to 'cancelled'.
    // Finalize as cancelled (not failed) and skip failure notifications.
    if (err instanceof CancelledError) {
      await log('warn', 'Agent run cancelled by admin');
      await supabase
        .from('agent_runs')
        .update({
          status:       'cancelled',
          completed_at: new Date().toISOString(),
          duration_ms:  duration,
        })
        .eq('id', run.id);
      await supabase
        .from('background_agents')
        .update({ last_run_at: new Date().toISOString(), last_run_status: 'cancelled' })
        .eq('id', agent_id);
      return new Response(JSON.stringify({
        success:     false,
        run_id:      run.id,
        status:      'cancelled',
        duration_ms: duration,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Delegation to Python
    if (err instanceof DelegateToMivaaError) {
      await log('info', `Delegating to Python backend: ${err.message}`, err.payload);

      const delegated = await delegateToMivaa(run.id, agentConfig, input_data || {}, err.payload);

      if (delegated) {
        await supabase
          .from('agent_runs')
          .update({ delegated_to_python: true, python_job_id: delegated.job_id })
          .eq('id', run.id);

        return new Response(JSON.stringify({
          success:            true,
          run_id:             run.id,
          status:             'processing',
          delegated_to_python: true,
          duration_ms:        duration,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Regular failure
    const errMsg = err?.message || String(err);
    await log('error', `Agent failed: ${errMsg}`, { stack: err?.stack?.slice(0, 500) });

    await supabase
      .from('agent_runs')
      .update({
        status:        'failed',
        error_message: errMsg,
        completed_at:  new Date().toISOString(),
        duration_ms:   duration,
      })
      .eq('id', run.id);

    await supabase
      .from('background_agents')
      .update({
        last_run_at:     new Date().toISOString(),
        last_run_status: 'failed',
      })
      .eq('id', agent_id);

    // Notify workspace owner/admin that agent run failed
    if (agentConfig.workspace_id) {
      const { data: ownerMember } = await supabase
        .from('workspace_members')
        .select('user_id')
        .eq('workspace_id', agentConfig.workspace_id)
        .in('role', ['owner', 'admin'])
        .limit(1)
        .maybeSingle();
      if (ownerMember?.user_id) {
        // Delivered by the "Agent Run Failed" flow (Flows dashboard).
        emitFlowEvent('background_agent_failed', {
          user_id: ownerMember.user_id,
          type: 'agent_run_failed',
          title: `Agent "${agentConfig.name}" failed`,
          body: errMsg,
          action_url: '/admin/background-agents',
          agent_id,
          run_id: run.id,
        }).catch(() => {});
      }
    }

    return new Response(JSON.stringify({
      success:     false,
      run_id:      run.id,
      status:      'failed',
      error:       errMsg,
      duration_ms: duration,
    }), {
      status:  500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}));

// ── Chat callback ─────────────────────────────────────────────────────────────

/**
 * After a background task completes, insert the result as an assistant message
 * in the originating KAI chat conversation so it appears in the user's chat window.
 * Fire-and-forget — never throws.
 */
async function postResultToChat(
  conversationId: string,
  runId:          string,
  taskPrompt:     string,
  output:         Record<string, unknown>,
): Promise<void> {
  try {
    const report = typeof output.report === 'string'
      ? output.report
      : JSON.stringify(output, null, 2);

    const taskPreview = taskPrompt.length > 100
      ? taskPrompt.slice(0, 100) + '…'
      : taskPrompt;

    const content = `**Background task complete** — *${taskPreview}*\n\n${report}`;

    await supabase.from('agent_chat_messages').insert({
      conversation_id: conversationId,
      role:            'assistant',
      content,
      metadata: {
        background_task: true,
        run_id:          runId,
        task_preview:    taskPreview,
      },
    });

    // Update conversation's last_message_at so it floats to the top of the list
    await supabase
      .from('agent_chat_conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversationId);

    console.log(`[postResultToChat] Result posted to conversation ${conversationId}`);
  } catch (err) {
    console.error('[postResultToChat] Failed to post result to chat:', err);
  }
}

// ── Chain trigger (fire-and-forget) ──────────────────────────────────────────

async function triggerChainedAgents(
  parentAgentId: string,
  parentRunId:   string,
  output:        Record<string, unknown>,
): Promise<void> {
  try {
    const { data: chainedAgents } = await supabase
      .from('background_agents')
      .select('id')
      .eq('trigger_type', 'chain')
      .eq('parent_agent_id', parentAgentId)
      .eq('enabled', true);

    const currentDepth = (output as any)?.chain_depth ?? 0;
    const MAX_CHAIN_DEPTH = 5;
    if (currentDepth >= MAX_CHAIN_DEPTH) {
      console.warn(`[chain-trigger] Chain depth ${currentDepth} reached limit ${MAX_CHAIN_DEPTH} — stopping recursion`);
      return;
    }

    for (const child of chainedAgents || []) {
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/background-agent-runner`, {
          method: 'POST',
          headers: {
            'Authorization':  `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type':   'application/json',
          },
          body: JSON.stringify({
            agent_id:     child.id,
            triggered_by: 'chain',
            input_data:   { ...output, parent_run_id: parentRunId, chain_depth: currentDepth + 1 },
          }),
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '(no body)');
          console.error(`[chain-trigger] Child agent ${child.id} returned HTTP ${res.status}: ${body}`);
        }
      } catch (e) {
        console.error('[chain-trigger] Failed to trigger child agent:', e);
      }
    }
  } catch (err) {
    console.error('[chain-trigger] Error querying chained agents:', err);
  }
}

// ── Python delegation ─────────────────────────────────────────────────────────

async function delegateToMivaa(
  runId:       string,
  agentConfig: BackgroundAgentRecord,
  inputData:   Record<string, unknown>,
  extraPayload: Record<string, unknown>,
): Promise<{ job_id: string } | null> {
  try {
    const res = await fetch(`${MIVAA_GATEWAY_URL}/api/agents/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MIVAA_API_KEY}`,
      },
      body: JSON.stringify({
        run_id:       runId,
        agent_id:     agentConfig.id,
        agent_type:   agentConfig.agent_type,
        input_data:   { ...inputData, ...extraPayload },
        model:        agentConfig.model,
        system_prompt: agentConfig.system_prompt_override,
        config:       agentConfig.config,
      }),
    });

    if (!res.ok) {
      console.error('[delegateToMivaa] HTTP error:', res.status, await res.text());
      return null;
    }

    const json = await res.json();
    return { job_id: json.job_id || runId };
  } catch (err) {
    console.error('[delegateToMivaa] Failed:', err);
    return null;
  }
}
