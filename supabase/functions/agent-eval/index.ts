// deno-lint-ignore-file no-explicit-any
/**
 * agent-eval — run ONE golden question through agent-chat and score what came back.
 *
 * WHY THIS EXISTS
 * ---------------
 * Conversation 9225f61f (2026-09-05) asked which keywords materialshub.gr ranks for. The reply
 * came from a third-party index — two keywords, SERPs crawled seven weeks earlier — while the
 * workspace's own rank tracker had checked 129 keywords 35 minutes before and Search Console was
 * connected. Three defects at once (no tool over the data, a tool that existed but was named for a
 * niche, a reply format that hid the date), every one found by a person reading one transcript.
 * Hand-testing replies finds these one at a time and only after they ship.
 *
 * A golden case pins the expectation instead: for THIS question, THESE tools must be the source,
 * the reply must contain THESE facts, must not hedge, must not wear the analysis framework on a
 * factual question, and must cost less than THIS. One row per run in `agent_eval_runs`, so a
 * regression is a diff, not a feeling. The turn is persisted as a real conversation
 * (`/agent-hub?conversation=<id>`) so the operator can open every eval reply and read it.
 *
 * SCOPE
 * -----
 * One case per invocation: a turn is 20–60 s and the edge limit is 150 s. A batch is the caller
 * looping with the same `batch_id`. Operator-only: the service-role bearer with body
 * `user_id`/`workspace_id` (the eval runs AS that user, against that workspace's data), or a
 * platform-admin JWT (runs as the admin, in a workspace they belong to).
 *
 * The turn itself is a normal agent-chat turn — same router, same tools, same model — with one
 * flag, `eval_run: true`, which agent-chat honours only at secret level to skip long-term memory
 * promotion and next-step chips. An eval question must never become a durable "fact" about the
 * user (#370's poisoned memories), and the chips are spend nobody reads here.
 *
 * Process doc: docs/agent-evaluation.md.
 */
import { corsHeaders } from '../_shared/cors.ts';
import { jsonResponse } from '../_shared/http.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { authenticate, isPlatformOperator, userCanAccessWorkspace } from '../_shared/auth.ts';
import { shapeToolResult } from '../_shared/tool-result-shape.ts';

interface EvalCase {
  id: string;
  key: string;
  title: string;
  agent_id: string;
  question: string;
  factual: boolean;
  expect_tools_any: string[];
  expect_tools_none: string[];
  expect_reply_regex: string[];
  forbid_reply_regex: string[];
  max_credits: number | null;
  max_seconds: number | null;
  is_active: boolean;
  sort_order: number;
  notes: string | null;
}

interface TurnOutcome {
  text: string;
  routedAgent: string | null;
  model: string | null;
  toolsCalled: string[];
  toolsZero: string[];
  toolsFailed: string[];
  error: string | null;
  ms: number;
  chunkTypes: Record<string, number>;
}

/** Below the 150 s edge ceiling with room to score and persist. */
const TURN_TIMEOUT_MS = 140_000;

function pushUnique(arr: string[], v: string) {
  if (v && !arr.includes(v)) arr.push(v);
}

/**
 * Drive one agent-chat turn and fold its stream into an outcome.
 *
 * `authorization` is the caller's OWN bearer when the caller is a signed-in operator, and the
 * service key only on the service-role path. This matters more than it looks: agent-chat threads
 * the caller's user JWT into ~30 user-scoped tools (`find_records`, `manage_deal`,
 * `manage_finance`, `manage_flows`, the mention and job-research tools…), and on the service-role
 * path that JWT is EMPTY, so every one of them fails with "Empty JWT" / "No active session". The
 * first sweep (batch 20260905-…0001) scored `records.find` as a PASS on a reply that told the user
 * to sign in. A faithful run is a real user turn; the service-role path is for smoke only.
 */
async function runTurn(input: {
  supabaseUrl: string;
  authorization: string;
  asUser: boolean;
  question: string;
  agentId: string;
  userId: string;
  workspaceId: string;
  conversationId: string;
  modelOverride: string | null;
}): Promise<TurnOutcome> {
  const started = Date.now();
  const out: TurnOutcome = {
    text: '', routedAgent: null, model: null,
    toolsCalled: [], toolsZero: [], toolsFailed: [],
    error: null, ms: 0, chunkTypes: {},
  };

  let resp: Response;
  try {
    resp = await fetch(`${input.supabaseUrl}/functions/v1/agent-chat`, {
      method: 'POST',
      headers: { Authorization: input.authorization, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: input.question }],
        agentId: input.agentId,
        // On a user turn agent-chat derives the user from the JWT; body ids are honoured only at
        // secret level, so sending them there would be ignored and sending them here is wrong.
        ...(input.asUser ? {} : { user_id: input.userId }),
        workspace_id: input.workspaceId,
        conversation_id: input.conversationId,
        model_override: input.modelOverride,
        eval_run: true,
      }),
      signal: AbortSignal.timeout(TURN_TIMEOUT_MS),
    });
  } catch (e) {
    out.error = `agent-chat unreachable: ${e instanceof Error ? e.message : String(e)}`;
    out.ms = Date.now() - started;
    return out;
  }
  if (!resp.ok || !resp.body) {
    out.error = `agent-chat HTTP ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 300)}`;
    out.ms = Date.now() - started;
    return out;
  }

  // The stream is newline-delimited JSON chunks (a `data:` prefix is tolerated in case the
  // framing ever changes). Each line is one chunk; an unparseable line is skipped, not fatal.
  const handle = (line: string) => {
    const raw = line.startsWith('data:') ? line.slice(5).trim() : line;
    if (!raw) return;
    let chunk: any;
    try { chunk = JSON.parse(raw); } catch { return; }
    const type = String(chunk?.type ?? '');
    out.chunkTypes[type] = (out.chunkTypes[type] ?? 0) + 1;
    switch (type) {
      case 'tool_call':
        pushUnique(out.toolsCalled, String(chunk.tool ?? ''));
        break;
      case 'tool_result': {
        const tool = String(chunk.tool ?? '');
        pushUnique(out.toolsCalled, tool);
        // The chat path summarises the result (zeroResult/failed); the direct path sends the
        // raw payload. Read whichever this chunk carries — one derivation, in tool-result-shape.
        if (chunk.result !== undefined) {
          const shape = shapeToolResult(chunk.result);
          if (!shape.ok) pushUnique(out.toolsFailed, tool);
          else if (shape.zeroResult) pushUnique(out.toolsZero, tool);
        } else {
          if (chunk.failed) pushUnique(out.toolsFailed, tool);
          else if (chunk.zeroResult) pushUnique(out.toolsZero, tool);
        }
        break;
      }
      case 'tool_error':
        pushUnique(out.toolsFailed, String(chunk.tool ?? ''));
        break;
      case 'final_result':
        out.text = typeof chunk.text === 'string' ? chunk.text : out.text;
        out.routedAgent = typeof chunk.agentId === 'string' ? chunk.agentId : out.routedAgent;
        out.model = typeof chunk.model === 'string' ? chunk.model : out.model;
        if (chunk.error) out.error = String(chunk.errorMessage ?? chunk.text ?? 'turn error');
        break;
      case 'error':
        out.error = String(chunk.message ?? chunk.error ?? 'error');
        break;
      default:
        break;
    }
  };

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        handle(buffer.slice(0, nl).trim());
        buffer = buffer.slice(nl + 1);
      }
    }
    if (buffer.trim()) handle(buffer.trim());
  } catch (e) {
    out.error = out.error ?? `stream ended early: ${e instanceof Error ? e.message : String(e)}`;
  }
  out.ms = Date.now() - started;
  return out;
}

function compileRegex(src: string): RegExp | null {
  try { return new RegExp(src, 'i'); } catch { return null; }
}

/**
 * Every expectation a case can state, checked deterministically. No model judges a model here:
 * the verdicts are "this tool was called", "this text is present", "this text is absent",
 * "this cost". A judge model can be layered on later; it must never replace these.
 */
function scoreCase(c: EvalCase, turn: TurnOutcome, credits: number | null, hedgePattern: string | null): string[] {
  const failures: string[] = [];
  const called = new Set(turn.toolsCalled);
  const reply = turn.text || '';

  if (turn.error) failures.push(`turn error: ${turn.error}`);
  if (!reply.trim()) failures.push('empty reply');

  if (c.expect_tools_any.length > 0 && !c.expect_tools_any.some((t) => called.has(t))) {
    failures.push(
      `none of the expected tools was called [${c.expect_tools_any.join(', ')}]; ` +
      `called [${turn.toolsCalled.join(', ') || 'nothing'}]`,
    );
  }
  for (const t of c.expect_tools_any) {
    if (!called.has(t)) continue;
    if (turn.toolsFailed.includes(t)) failures.push(`expected tool ${t} failed`);
    else if (turn.toolsZero.includes(t)) failures.push(`expected tool ${t} returned nothing`);
  }
  for (const t of c.expect_tools_none) {
    if (called.has(t)) failures.push(`forbidden tool called: ${t}`);
  }
  for (const src of c.expect_reply_regex) {
    const re = compileRegex(src);
    if (!re) failures.push(`case has an invalid regex: ${src}`);
    else if (!re.test(reply)) failures.push(`reply does not match /${src}/i`);
  }
  // A factual question gets facts. The framework (MODE / Confidence) is for analysis and
  // decisions — the shared operating doctrine says so, and 9225f61f wore it on a lookup.
  const forbid = [...c.forbid_reply_regex, ...(c.factual ? ['\\bMODE: ', '\\bConfidence:'] : [])];
  for (const src of forbid) {
    const re = compileRegex(src);
    if (re && re.test(reply)) failures.push(`reply matches forbidden /${src}/i`);
  }
  if (hedgePattern) {
    const re = compileRegex(hedgePattern);
    const m = re?.exec(reply);
    if (m) failures.push(`reply hedges: "${m[0].trim().slice(0, 160)}"`);
  }
  if (c.max_seconds && turn.ms > c.max_seconds * 1000) {
    failures.push(`took ${Math.round(turn.ms / 1000)} s, limit ${c.max_seconds} s`);
  }
  if (c.max_credits != null && credits != null && credits > Number(c.max_credits)) {
    failures.push(`cost ${credits} credits, limit ${c.max_credits}`);
  }
  return failures;
}

/**
 * The turn's cost, from the ledger the turn wrote. `log_agent_usage` is fire-and-forget inside
 * agent-chat, so the rows can land a moment after the stream closes — three short waits, then
 * null (unknown, never 0).
 */
async function creditsFor(sb: any, conversationId: string): Promise<number | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data } = await sb
      .from('agent_usage_logs')
      .select('credits_debited')
      .eq('conversation_id', conversationId);
    if (Array.isArray(data) && data.length > 0) {
      const sum = data.reduce((s: number, r: any) => s + Number(r.credits_debited || 0), 0);
      return Math.round(sum * 10000) / 10000;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}

Deno.serve(withApiLogging('agent-eval', async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');

  const auth = await authenticate(req);
  if (!auth.success) throw new HttpError(401, auth.error || 'Unauthorized');
  const sb: any = auth.supabase;

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }

  // Who the eval runs AS. The service-role path names the user in the body (invariant 1: a
  // body-supplied id is trusted ONLY at secret level); a JWT caller must be a platform operator
  // and runs as themselves, in a workspace they belong to.
  let userId: string;
  let workspaceId: string;
  const asUser = auth.level === 'user';
  if (auth.level === 'secret') {
    if (typeof body.user_id !== 'string' || typeof body.workspace_id !== 'string') {
      throw new HttpError(400, 'user_id and workspace_id are required on the service-role path — the eval runs AS that user');
    }
    userId = body.user_id;
    workspaceId = body.workspace_id;
  } else if (auth.level === 'user' && auth.userId) {
    if (!(await isPlatformOperator(sb, auth.userId))) throw new HttpError(403, 'Platform operators only');
    userId = auth.userId;
    workspaceId = typeof body.workspace_id === 'string' ? body.workspace_id : '';
    if (!workspaceId || !(await userCanAccessWorkspace(sb, userId, workspaceId))) {
      throw new HttpError(404, 'Workspace not found');
    }
  } else {
    throw new HttpError(401, 'Unauthorized');
  }

  const action = typeof body.action === 'string' ? body.action : 'run';

  if (action === 'list') {
    const { data: cases, error } = await sb.from('agent_eval_cases').select('*').order('sort_order');
    if (error) throw new HttpError(500, error.message, error);
    const { data: runs } = await sb
      .from('agent_eval_runs')
      .select('case_key, passed, failures, credits, latency_ms, conversation_id, routed_agent, tools_called, created_at')
      .order('created_at', { ascending: false })
      .limit(300);
    const latest: Record<string, any> = {};
    for (const r of runs ?? []) if (!latest[r.case_key]) latest[r.case_key] = r;
    return jsonResponse({
      cases: (cases ?? []).map((c: any) => ({ ...c, last_run: latest[c.key] ?? null })),
    });
  }
  if (action !== 'run') throw new HttpError(400, `Unknown action "${action}" — use run or list`);

  let caseRow: any = null;
  if (typeof body.case_key === 'string') {
    const { data, error } = await sb.from('agent_eval_cases').select('*').eq('key', body.case_key).maybeSingle();
    if (error) throw new HttpError(500, error.message, error);
    caseRow = data;
  } else if (typeof body.case_id === 'string') {
    const { data, error } = await sb.from('agent_eval_cases').select('*').eq('id', body.case_id).maybeSingle();
    if (error) throw new HttpError(500, error.message, error);
    caseRow = data;
  }
  if (!caseRow) throw new HttpError(404, 'Case not found — pass case_key or case_id');
  const evalCase = caseRow as EvalCase;

  // Read at handler time, never at module load (secrets bootstrap populates env at entry).
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!supabaseUrl || !serviceKey) throw new HttpError(500, 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set');

  const modelOverride = typeof body.model_override === 'string' ? body.model_override : null;
  const batchId = typeof body.batch_id === 'string' ? body.batch_id : null;
  const conversationId = crypto.randomUUID();

  // Persisted as a real conversation, BEFORE the turn, so the transcript the operator opens
  // afterwards is the one the agent actually wrote into.
  await sb.from('agent_chat_conversations').upsert({
    id: conversationId,
    user_id: userId,
    agent_id: evalCase.agent_id,
    title: `[eval] ${evalCase.title}`,
    description: `Golden case ${evalCase.key}${batchId ? ` · batch ${batchId.slice(0, 8)}` : ''}`,
    message_count: 0,
  }, { onConflict: 'id', ignoreDuplicates: true });

  // The hedge regex is the SQL function's — the same one the nightly probe and the audit use.
  const { data: hedgeRow } = await sb.rpc('agent_reply_hedge_pattern');
  const hedgePattern = typeof hedgeRow === 'string' ? hedgeRow : null;

  const turn = await runTurn({
    supabaseUrl,
    authorization: asUser ? (req.headers.get('Authorization') ?? '') : `Bearer ${serviceKey}`,
    asUser,
    question: evalCase.question, agentId: evalCase.agent_id,
    userId, workspaceId, conversationId, modelOverride,
  });
  const credits = await creditsFor(sb, conversationId);
  const failures = scoreCase(evalCase, turn, credits, hedgePattern);
  const passed = failures.length === 0;

  const now = new Date().toISOString();
  await sb.from('agent_chat_messages').insert([
    {
      conversation_id: conversationId, role: 'user', content: evalCase.question,
      metadata: { eval_case: evalCase.key },
    },
    {
      conversation_id: conversationId, role: 'assistant',
      content: turn.text || (turn.error ? `Error: ${turn.error}` : ''),
      metadata: {
        agentId: turn.routedAgent ?? evalCase.agent_id,
        model: turn.model,
        responseTimeMs: turn.ms,
        eval: { case_key: evalCase.key, passed, failures, tools_called: turn.toolsCalled, session: asUser ? 'user' : 'service_role' },
      },
    },
  ]);
  await sb.from('agent_chat_conversations')
    .update({ message_count: 2, last_message_at: now, updated_at: now })
    .eq('id', conversationId);

  const { data: runRow, error: runErr } = await sb.from('agent_eval_runs').insert({
    batch_id: batchId,
    case_id: evalCase.id,
    case_key: evalCase.key,
    user_id: userId,
    workspace_id: workspaceId,
    conversation_id: conversationId,
    requested_agent: evalCase.agent_id,
    routed_agent: turn.routedAgent,
    model: turn.model,
    tools_called: turn.toolsCalled,
    tools_zero: turn.toolsZero,
    tools_failed: turn.toolsFailed,
    reply: turn.text,
    passed,
    failures,
    credits,
    latency_ms: turn.ms,
    error: turn.error,
  }).select('id').single();
  if (runErr) console.error('[agent-eval] run insert failed:', runErr.message);

  return jsonResponse({
    ok: true,
    run_id: runRow?.id ?? null,
    case_key: evalCase.key,
    title: evalCase.title,
    // A service-role run cannot exercise the user-scoped tools — say so on every result.
    session: asUser ? 'user' : 'service_role (smoke only: user-scoped tools have no JWT here)',
    passed,
    failures,
    conversation_id: conversationId,
    requested_agent: evalCase.agent_id,
    routed_agent: turn.routedAgent,
    model: turn.model,
    tools_called: turn.toolsCalled,
    tools_zero: turn.toolsZero,
    tools_failed: turn.toolsFailed,
    credits,
    latency_ms: turn.ms,
    chunk_types: turn.chunkTypes,
    reply: turn.text,
  });
}));
