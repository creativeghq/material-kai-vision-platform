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

const ANTHROPIC_API_KEY       = Deno.env.get('ANTHROPIC_API_KEY')!;
const SUPABASE_URL             = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MIVAA_GATEWAY_URL        = Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';
const MIVAA_API_KEY            = Deno.env.get('MIVAA_API_KEY') || '';

import { corsHeaders }        from '../_shared/cors.ts';
import { authenticate }       from '../_shared/auth.ts';
import { createLogHelper, createHeartbeatHelper } from '../_shared/agents/base-agent.ts';
import { getRunner, AGENT_TYPE_CATALOG } from '../_shared/agents/registry.ts';
import { DelegateToMivaaError } from '../_shared/agents/types.ts';
import type { BackgroundAgentRecord, AgentRunRecord, AgentRunContext } from '../_shared/agents/types.ts';

const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req: Request) => {
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
  try {
    const auth = await authenticate(req, supabase);
    if (!auth.isAuthenticated) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  } catch (authErr) {
    // Allow service-role requests (from scheduler / event emitter) without user JWT
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.includes(SUPABASE_SERVICE_ROLE_KEY)) {
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

  // ── Look up runner ───────────────────────────────────────────────────────
  const runner = getRunner(agentConfig.agent_type);
  if (!runner) {
    return new Response(JSON.stringify({ error: `No runner registered for agent_type "${agentConfig.agent_type}"` }), {
      status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── Create or load run record ────────────────────────────────────────────
  let run: AgentRunRecord;

  if (run_id) {
    const { data: existingRun } = await supabase
      .from('agent_runs')
      .select('*')
      .eq('id', run_id)
      .single();
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
    anthropicApiKey: ANTHROPIC_API_KEY,
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
});

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
            input_data:   { ...output, parent_run_id: parentRunId },
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
