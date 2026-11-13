// `tool` is typed non-generically on purpose — see sub-agent-tools.ts.
const { tool } = await import('npm:@langchain/core@1.2.9/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  ) => any;
};
const { z } = await import('npm:zod@3.25.76');
const { ChatAnthropic } = await import('npm:@langchain/anthropic@1.5.6');
const { ToolMessage } = await import('npm:@langchain/core@1.2.9/messages') as {
  ToolMessage: new (f: { tool_call_id: string; content: string }) => unknown;
};

import { serviceClient } from '../supabase-client.ts';
import { wrapUntrusted } from '../untrusted.ts';
import { loadPrompt } from '../prompt-utils.ts';
import { CLAUDE_SONNET, langchainThinking } from '../claude-models.ts';
import { reserveCredits, refundCredits, settleCredits } from '../credit-reserve.ts';
import { resolveTokenPrice, tokenCostParts } from '../ai-logger.ts';

const svc = serviceClient;

const SUB_AGENT_MODEL = CLAUDE_SONNET;
const CEILING_CREDITS = 60;

type Role = 'stark' | 'veritas';

interface InnerTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  run: (args: Record<string, unknown>) => Promise<string>;
  /** Calling it ends the sub-agent's run. */
  final?: boolean;
}

interface Ctx {
  userId: string;
  workspaceId: string;
  conversationId: string | null;
}

const rpcJson = async (fn: string, args: Record<string, unknown>): Promise<{ ok: boolean; data?: unknown; error?: string }> => {
  const { data, error } = await svc().rpc(fn, args);
  return error ? { ok: false, error: error.message } : { ok: true, data };
};

function sharedTools(caseId: string, role: Role): InnerTool[] {
  return [
    {
      name: 'case_evidence',
      description: 'The case, its source evidence (check definition and sample records, job, provider, agent or tool failures) and its history so far, including earlier rounds.',
      input_schema: { type: 'object', properties: {} },
      run: async () => {
        const r = await rpcJson('ops_case_evidence', { p_case_id: caseId });
        return r.ok ? wrapUntrusted('ops case evidence', JSON.stringify(r.data)) : JSON.stringify({ error: r.error });
      },
    },
    {
      name: 'recent_errors',
      description: 'Recent warning/error log lines and failing requests mentioning a term (a function, tool, logger name or job id).',
      input_schema: {
        type: 'object',
        properties: {
          term: { type: 'string', description: 'Text to look for in logger names, messages and request paths.' },
          hours: { type: 'integer', description: 'How far back, 1-48 (default 24).' },
        },
        required: ['term'],
      },
      run: async (a) => {
        const r = await rpcJson('ops_recent_errors', { p_term: String(a.term ?? '').slice(0, 80), p_hours: Number(a.hours ?? 24) });
        return r.ok ? wrapUntrusted('platform logs', JSON.stringify(r.data)) : JSON.stringify({ error: r.error });
      },
    },
    {
      name: 'recheck',
      description: 'Re-run detection for this case (an integrity check re-runs its domain without healing) and say whether the problem is still there.',
      input_schema: { type: 'object', properties: {} },
      run: async () => JSON.stringify(await rpcJson('ops_recheck', { p_case_id: caseId, p_actor: role })),
    },
  ];
}

function starkTools(caseId: string, ctx: Ctx): InnerTool[] {
  return [
    ...sharedTools(caseId, 'stark'),
    {
      name: 'apply_safe_fix',
      description: 'Run the heal the operator enabled for this integrity check. Refuses for anything else; that is not a failure, it means a person or a code change must fix it.',
      input_schema: { type: 'object', properties: {} },
      run: async () => JSON.stringify(await rpcJson('ops_apply_safe_fix', { p_case_id: caseId })),
    },
    {
      name: 'report',
      description: 'File your answer for this case. Call it exactly once, last.',
      final: true,
      input_schema: {
        type: 'object',
        properties: {
          outcome: { type: 'string', enum: ['fixed', 'not_a_problem', 'needs_operator', 'needs_code_change'] },
          diagnosis: { type: 'string', description: 'What is wrong, citing concrete evidence (counts, ids, error text).' },
          root_cause: { type: 'string', description: 'Why it happens, if the evidence shows it.' },
          proposed_fix: { type: 'string', description: 'For needs_operator / needs_code_change: exactly what to do and where.' },
        },
        required: ['outcome', 'diagnosis'],
      },
      run: async (a) => JSON.stringify(await rpcJson('ops_record', {
        p_case_id: caseId, p_actor: 'stark', p_kind: 'diagnosis', p_conversation_id: ctx.conversationId,
        p_payload: { outcome: a.outcome, diagnosis: a.diagnosis, root_cause: a.root_cause ?? null, proposed_fix: a.proposed_fix ?? null },
      })),
    },
  ];
}

function veritasTools(caseId: string, ctx: Ctx): InnerTool[] {
  return [
    ...sharedTools(caseId, 'veritas'),
    {
      name: 'verdict',
      description: 'Rule on Stark\'s answer. Call it exactly once, last.',
      final: true,
      input_schema: {
        type: 'object',
        properties: {
          verdict: { type: 'string', enum: ['confirmed', 'rejected'] },
          note: { type: 'string', description: 'Why. When rejecting, what is missing or wrong.' },
        },
        required: ['verdict', 'note'],
      },
      run: async (a) => JSON.stringify(await rpcJson('ops_record', {
        p_case_id: caseId, p_actor: 'veritas', p_kind: 'verdict', p_conversation_id: ctx.conversationId,
        p_payload: { verdict: a.verdict, note: a.note },
      })),
    },
  ];
}

async function logStep(ctx: Ctx, role: Role, name: string, args: unknown, result: string, ms: number, ok: boolean) {
  await svc().from('agent_tool_call_logs').insert({
    conversation_id: ctx.conversationId, user_id: ctx.userId, workspace_id: ctx.workspaceId, agent_id: role,
    tool_name: name, tool_args: args ?? {}, result_summary: { preview: result.slice(0, 500) },
    duration_ms: ms, success: ok, error_message: ok ? null : result.slice(0, 500),
  }).then(({ error }) => { if (error) console.warn(`[ops-desk] step log failed: ${error.message}`); });
}

async function settleUsage(ctx: Ctx, role: Role, caseId: string, inTok: number, outTok: number) {
  const db = svc();
  const op = `ops_${role}`;
  const price = await resolveTokenPrice(db, SUB_AGENT_MODEL);
  if (!price || (inTok === 0 && outTok === 0)) {
    await refundCredits(db, ctx.userId, ctx.workspaceId, CEILING_CREDITS, op, { reason: price ? 'no_usage' : 'unpriced_model' });
    return;
  }
  const { input, output } = tokenCostParts(price, inTok, outTok);
  const raw = input + output;
  const billed = raw * price.markup;
  const credits = Math.round(billed * 100 * 100) / 100;
  await settleCredits(db, ctx.userId, ctx.workspaceId, CEILING_CREDITS, credits, op, { case_id: caseId, workspace_id: ctx.workspaceId });
  await db.from('ai_usage_logs').insert({
    user_id: ctx.userId, operation_type: op, model_name: SUB_AGENT_MODEL, api_provider: 'anthropic',
    input_tokens: inTok, output_tokens: outTok, input_cost_usd: input, output_cost_usd: output, raw_cost_usd: raw,
    markup_multiplier: price.markup, billed_cost_usd: billed, credits_debited: credits,
    metadata: { feature: 'ops_desk', sub_feature: op, case_id: caseId, workspace_id: ctx.workspaceId, conversation_id: ctx.conversationId },
  });
}

/** One sub-agent run: its own prompt, its own tools, bound to one case, until it files its final call. */
async function runSubAgent(role: Role, caseId: string, brief: string, ctx: Ctx, tools: InnerTool[], maxSteps: number) {
  const system = await loadPrompt(svc(), 'agent', `ops_${role}`);
  const reserve = await reserveCredits(svc(), ctx.userId, ctx.workspaceId, CEILING_CREDITS, `ops_${role}`);
  if (!reserve.ok) return { success: false, error: reserve.message };

  const model = new ChatAnthropic({ model: SUB_AGENT_MODEL, maxTokens: 1500, ...langchainThinking(SUB_AGENT_MODEL) })
    .bindTools(tools.map(({ name, description, input_schema }) => ({ name, description, input_schema })));
  const byName = new Map(tools.map((t) => [t.name, t]));
  const messages: unknown[] = [
    { role: 'system', content: system },
    { role: 'user', content: `Case ${caseId}.\n\nFrom JARVIS: ${brief || 'Work this case.'}` },
  ];
  let inTok = 0;
  let outTok = 0;
  let final: { name: string; result: string } | null = null;
  let steps = 0;
  try {
    for (; steps < maxSteps && !final; steps++) {
      const res: any = await model.invoke(messages as any);
      inTok += res?.usage_metadata?.input_tokens ?? 0;
      outTok += res?.usage_metadata?.output_tokens ?? 0;
      messages.push(res);
      const calls: Array<{ id: string; name: string; args: Record<string, unknown> }> = res?.tool_calls ?? [];
      if (calls.length === 0) break;
      for (const call of calls) {
        const t = byName.get(call.name);
        const started = Date.now();
        let result: string;
        let ok = true;
        try {
          result = t ? await t.run(call.args ?? {}) : JSON.stringify({ error: `no tool ${call.name}` });
          ok = !!t && !/"ok":\s*false|"error":/.test(result.slice(0, 300));
        } catch (e) {
          result = JSON.stringify({ error: e instanceof Error ? e.message : String(e) });
          ok = false;
        }
        await logStep(ctx, role, call.name, call.args, result, Date.now() - started, ok);
        messages.push(new ToolMessage({ tool_call_id: call.id, content: result }));
        if (t?.final && ok) final = { name: call.name, result };
      }
    }
  } finally {
    await settleUsage(ctx, role, caseId, inTok, outTok);
  }
  if (!final) {
    return { success: false, steps, error: `${role === 'stark' ? 'Stark' : 'Veritas'} ended without filing a ${role === 'stark' ? 'report' : 'verdict'}.` };
  }
  return { success: true, steps, filed: JSON.parse(final.result) };
}

export const createOpsCasesTool = () => tool(
  async ({ include_escalated }) => {
    const statuses = include_escalated ? ['open', 'investigating', 'awaiting_review', 'escalated'] : ['open', 'investigating', 'awaiting_review'];
    const { data, error } = await svc().from('ops_cases')
      .select('id, source_kind, source_key, title, summary, severity, status, holder, round, evidence_count, outcome, verdict')
      .in('status', statuses).order('severity').order('opened_at').limit(40);
    if (error) return JSON.stringify({ success: false, error: error.message });
    return wrapUntrusted('ops cases', JSON.stringify({ success: true, cases: data }));
  },
  {
    name: 'ops_cases',
    description: 'Agent Ops cases waiting on the platform: what looks broken (integrity checks, providers, jobs, background agents, agent tools), who holds each case and what round it is on.',
    schema: z.object({
      include_escalated: z.boolean().optional().describe('Also list cases already left for a person.'),
    }),
  },
);

export const createAskStarkTool = (userId: string, workspaceId: string, conversationId: string | null) => tool(
  async ({ case_id, brief }) => {
    const ctx = { userId, workspaceId, conversationId };
    const assigned = await rpcJson('ops_record', {
      p_case_id: case_id, p_actor: 'jarvis', p_kind: 'assigned', p_conversation_id: conversationId, p_payload: { brief },
    });
    const a = assigned.data as { ok?: boolean; reason?: string } | undefined;
    if (!assigned.ok || !a?.ok) return JSON.stringify({ success: false, error: assigned.error ?? a?.reason });
    try {
      return JSON.stringify(await runSubAgent('stark', case_id, brief, ctx, starkTools(case_id, ctx), 8));
    } catch (e) {
      return JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) });
    }
  },
  {
    name: 'ask_stark',
    description: 'Hand one Agent Ops case to Stark, the investigator sub-agent. Stark reads the evidence and logs, re-checks, applies a fix only where an unattended heal is enabled, and files an outcome: fixed, not_a_problem, needs_operator or needs_code_change.',
    schema: z.object({
      case_id: z.string().uuid().describe('The case id from ops_cases.'),
      brief: z.string().max(600).describe('One line: what you want Stark to answer. On a second round, include Veritas\'s note.'),
    }),
  },
);

export const createAskVeritasTool = (userId: string, workspaceId: string, conversationId: string | null) => tool(
  async ({ case_id }) => {
    const ctx = { userId, workspaceId, conversationId };
    const { data: c } = await svc().from('ops_cases').select('status').eq('id', case_id).maybeSingle();
    if (c?.status !== 'awaiting_review') {
      return JSON.stringify({ success: false, error: `Case is ${c?.status ?? 'missing'}; Veritas only reviews a case Stark has reported on.` });
    }
    try {
      return JSON.stringify(await runSubAgent('veritas', case_id, 'Verify Stark\'s answer on this case.', ctx, veritasTools(case_id, ctx), 6));
    } catch (e) {
      return JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) });
    }
  },
  {
    name: 'ask_veritas',
    description: 'Hand a case Stark has reported on to Veritas, the verifier sub-agent. Veritas re-reads the evidence, re-checks a claimed fix, and confirms or rejects Stark\'s answer. Confirmed fixes are resolved; confirmed needs_* cases are left for a person; a rejection returns the case for another Stark round.',
    schema: z.object({
      case_id: z.string().uuid().describe('The case id Stark just reported on.'),
    }),
  },
);
