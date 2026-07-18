/**
 * Tech Radar Tools — Pepper's (product-business agent) "background brain".
 *
 * The idea: we run a solution that works one way today. Feed that to the radar
 * and it researches the CURRENT tech landscape — libraries, frameworks, infra,
 * services, architectural patterns, AND AI models — and proposes concrete
 * improvements, scored with the ThoughtWorks ring vocabulary
 * (adopt / trial / assess / hold).
 *
 * Tools (registered on `kai` today; mirrored onto Pepper's allowed_tools so the
 * Agent-Fabric dispatcher inherits them when it lands):
 *   - review_solution   — one-shot deep review of a solution → ringed findings
 *   - track_tech_radar  — "keep watching this": creates a background_agents cron
 *                         monitor so the review re-runs and surfaces NEW deltas
 *   - list_tech_radar   — read tracked subjects + their latest findings
 *   - update_finding    — accept / dismiss / progress a finding (keeps it actionable)
 *
 * Research runs via Claude's built-in web_search (same as b2b_manufacturer_search,
 * no extra API key) + a structured-output pass. Internal flow = no credit debit
 * (mirrors price/mention/job internal monitoring); cost is still logged to
 * ai_usage_logs for the operations dashboard.
 */

const { tool } = await import('npm:@langchain/core@1.1.15/tools');
const { z } = await import('npm:zod@3.24.0');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = () => Deno.env.get('ANTHROPIC_API_KEY');

const RESEARCH_MODEL = 'claude-sonnet-4-6';   // tech judgement benefits from reasoning
const RING_VALUES   = ['adopt', 'trial', 'assess', 'hold'] as const;
const CATEGORY_VALUES = ['models', 'libraries', 'frameworks', 'infra', 'services', 'patterns', 'tooling', 'other'] as const;
const LEVEL_VALUES  = ['low', 'medium', 'high'] as const;

// ───────────────────────────────────────────────────────────────────────────
// Shared types + helpers
// ───────────────────────────────────────────────────────────────────────────

export interface TechRadarSubject {
  id?: string;
  workspace_id?: string | null;
  title: string;
  component?: string | null;
  repo?: string | null;
  current_approach: string;
  constraints?: string | null;
}

export interface TechRadarFinding {
  title: string;
  category: string;
  ring: string;
  rationale: string;
  recommendation?: string;
  effort?: string;
  impact?: string;
  evidence?: Array<{ title?: string; url?: string; note?: string }>;
}

export function svcClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

async function sha1Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-1', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── Anthropic structured-output schema for the findings ──────────────────────
const SUBMIT_FINDINGS_TOOL = {
  name: 'submit_findings',
  description: 'Return the technology-radar findings for the reviewed solution.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'One-paragraph verdict on the current approach.' },
      findings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title:          { type: 'string', description: 'The suggested tool/approach, imperative voice e.g. "Replace EasyOCR with dots.ocr".' },
            category:       { type: 'string', enum: CATEGORY_VALUES as unknown as string[] },
            ring:           { type: 'string', enum: RING_VALUES as unknown as string[], description: 'adopt=do it now, trial=pilot on a slice, assess=worth a spike, hold=avoid/keep current.' },
            rationale:      { type: 'string', description: 'Why it is better FOR THIS solution given its constraints.' },
            recommendation: { type: 'string', description: 'Concrete next step.' },
            effort:         { type: 'string', enum: LEVEL_VALUES as unknown as string[], description: 'Migration cost.' },
            impact:         { type: 'string', enum: LEVEL_VALUES as unknown as string[], description: 'Expected upside.' },
            evidence: {
              type: 'array',
              items: {
                type: 'object',
                properties: { title: { type: 'string' }, url: { type: 'string' }, note: { type: 'string' } },
              },
            },
          },
          required: ['title', 'category', 'ring', 'rationale'],
        },
      },
    },
    required: ['summary', 'findings'],
  },
};

function anthropicHeaders(beta?: string): HeadersInit {
  const h: Record<string, string> = {
    'x-api-key': ANTHROPIC_API_KEY() || '',
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json',
  };
  if (beta) h['anthropic-beta'] = beta;
  return h;
}

// ───────────────────────────────────────────────────────────────────────────
// Research core — used by the tool AND the cron runner
// ───────────────────────────────────────────────────────────────────────────

export interface ResearchOutput {
  summary: string;
  findings: TechRadarFinding[];
  inputTokens: number;
  outputTokens: number;
  rawCostUsd: number;
}

/**
 * Two-pass research: (1) web_search landscape scan, (2) structured findings.
 * Throws on missing key / hard API failure so callers can record the error.
 */
export async function researchSolution(
  s: TechRadarSubject,
  opts: { maxWebUses?: number } = {},
): Promise<ResearchOutput> {
  if (!ANTHROPIC_API_KEY()) throw new Error('ANTHROPIC_API_KEY not configured');
  const maxWebUses = opts.maxWebUses ?? 6;

  const ctx = [
    `Title: ${s.title}`,
    s.component ? `Component/area: ${s.component}` : '',
    s.repo ? `Repo: ${s.repo}` : '',
    `How it works TODAY: ${s.current_approach}`,
    s.constraints ? `Hard constraints to respect: ${s.constraints}` : '',
  ].filter(Boolean).join('\n');

  // ── Pass 1: landscape scan with web_search ────────────────────────────────
  const researchPrompt =
    `You are a senior staff engineer running a technology-radar scan (it is 2026).\n\n` +
    `We currently run this solution:\n${ctx}\n\n` +
    `Research the CURRENT technology landscape for this solution. Find newer or better ` +
    `libraries, frameworks, services, infrastructure, architectural patterns, AND AI models ` +
    `that could improve it on any axis: quality, cost, latency, operational simplicity, or ` +
    `fewer dependencies. Respect the stated constraints. For each candidate, note maturity, ` +
    `who uses it in production, licensing, and rough cost. Be specific and cite source URLs. ` +
    `Call out where staying on the current approach is genuinely the right call.`;

  const r1 = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: anthropicHeaders('web-search-2025-03-05'),
    body: JSON.stringify({
      model: RESEARCH_MODEL,
      max_tokens: 4096,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: maxWebUses }],
      messages: [{ role: 'user', content: researchPrompt }],
    }),
  });
  if (!r1.ok) throw new Error(`web_search pass failed: ${r1.status} ${(await r1.text()).slice(0, 200)}`);
  const d1 = await r1.json();
  const researchText = (d1.content as any[])?.filter((b) => b.type === 'text').map((b) => b.text).join('\n') || '';
  const in1 = d1?.usage?.input_tokens ?? 0;
  const out1 = d1?.usage?.output_tokens ?? 0;

  // ── Pass 2: structure into ringed findings ────────────────────────────────
  const r2 = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: anthropicHeaders(),
    body: JSON.stringify({
      model: RESEARCH_MODEL,
      max_tokens: 4096,
      tools: [SUBMIT_FINDINGS_TOOL],
      tool_choice: { type: 'tool', name: 'submit_findings' },
      messages: [{
        role: 'user',
        content:
          `Solution under review:\n${ctx}\n\n` +
          `Research notes from a web scan:\n${researchText}\n\n` +
          `Convert this into concrete radar findings. Use rings honestly: most ideas are ` +
          `'assess' or 'trial'; reserve 'adopt' for clear wins and 'hold' for things to avoid ` +
          `or where the current approach should stay. Skip anything not materially better than today.`,
      }],
    }),
  });
  if (!r2.ok) throw new Error(`structuring pass failed: ${r2.status} ${(await r2.text()).slice(0, 200)}`);
  const d2 = await r2.json();
  const toolBlock = (d2.content as any[])?.find((b) => b.type === 'tool_use' && b.name === 'submit_findings');
  const parsed = toolBlock?.input ?? { summary: '', findings: [] };
  const in2 = d2?.usage?.input_tokens ?? 0;
  const out2 = d2?.usage?.output_tokens ?? 0;

  // Cost: Sonnet 4.6 $3/$15 per MTok + web_search surcharge (~$0.01/use).
  const inputTokens = in1 + in2;
  const outputTokens = out1 + out2;
  const rawCostUsd =
    (inputTokens / 1_000_000) * 3.0 +
    (outputTokens / 1_000_000) * 15.0 +
    maxWebUses * 0.01;

  const findings: TechRadarFinding[] = Array.isArray(parsed.findings) ? parsed.findings : [];
  return { summary: String(parsed.summary || ''), findings, inputTokens, outputTokens, rawCostUsd };
}

/**
 * Persist findings with cross-run dedupe. Returns which are new this run.
 * dedupe_hash = sha1(subject_id|lower(title)) so the same idea across weekly
 * runs collapses to one row (is_new flips false on the repeat).
 */
export async function persistFindings(
  sb: ReturnType<typeof svcClient>,
  subjectId: string,
  workspaceId: string | null,
  findings: TechRadarFinding[],
  runId: string | null,
): Promise<{ newCount: number; total: number; rows: any[] }> {
  const rows: any[] = [];
  let newCount = 0;

  for (const f of findings) {
    const title = String(f.title || '').trim();
    if (!title) continue;
    const dedupe_hash = await sha1Hex(`${subjectId}|${title.toLowerCase()}`);

    // Was it seen before? (existing row → not new)
    const { data: existing } = await sb
      .from('tech_radar_findings')
      .select('id')
      .eq('subject_id', subjectId)
      .eq('dedupe_hash', dedupe_hash)
      .maybeSingle();

    const isNew = !existing;
    if (isNew) newCount++;

    const payload = {
      subject_id:     subjectId,
      workspace_id:   workspaceId,
      title,
      category:       CATEGORY_VALUES.includes(f.category as any) ? f.category : 'other',
      ring:           RING_VALUES.includes(f.ring as any) ? f.ring : 'assess',
      rationale:      String(f.rationale || ''),
      recommendation: f.recommendation ?? null,
      effort:         LEVEL_VALUES.includes(f.effort as any) ? f.effort : null,
      impact:         LEVEL_VALUES.includes(f.impact as any) ? f.impact : null,
      evidence:       Array.isArray(f.evidence) ? f.evidence : [],
      is_new:         isNew,
      dedupe_hash,
      run_id:         runId,
    };

    // Upsert on (subject_id, dedupe_hash). On conflict refresh ring/rationale
    // (the landscape may have moved) but DO NOT reset a human-set status.
    const { data: up } = await sb
      .from('tech_radar_findings')
      .upsert(payload, { onConflict: 'subject_id,dedupe_hash' })
      .select('*')
      .maybeSingle();
    if (up) rows.push(up);
  }
  return { newCount, total: rows.length, rows };
}

/**
 * Full review of one subject: research → persist → update cadence + cost.
 * Shared by review_solution (on-demand) and the tech-radar cron runner.
 */
export async function runRadarForSubject(
  sb: ReturnType<typeof svcClient>,
  subject: any,
  opts: { runId?: string | null } = {},
): Promise<{ summary: string; newCount: number; total: number; rows: any[]; rawCostUsd: number }> {
  const research = await researchSolution({
    id: subject.id,
    workspace_id: subject.workspace_id,
    title: subject.title,
    component: subject.component,
    repo: subject.repo,
    current_approach: subject.current_approach,
    constraints: subject.constraints,
  });

  const persisted = await persistFindings(
    sb, subject.id, subject.workspace_id ?? null, research.findings, opts.runId ?? null,
  );

  // Volatility cadence: quiet run → stretch the interval; new findings → reset.
  const intervalH = Number(subject.review_interval_hours ?? 168);
  const quiet = persisted.newCount === 0;
  const consecutiveQuiet = quiet ? Number(subject.consecutive_quiet_runs ?? 0) + 1 : 0;
  const stretchH = quiet ? Math.min(intervalH * (1 + consecutiveQuiet), 720) : intervalH;
  const nextReview = new Date(Date.now() + stretchH * 3600_000).toISOString();

  await sb.from('tech_radar_subjects').update({
    last_reviewed_at: new Date().toISOString(),
    next_review_at: nextReview,
    consecutive_quiet_runs: consecutiveQuiet,
    last_review_cost_usd: research.rawCostUsd,
  }).eq('id', subject.id);

  return { summary: research.summary, ...persisted, rawCostUsd: research.rawCostUsd };
}

async function logUsage(sb: ReturnType<typeof svcClient>, userId: string | null, cost: number, meta: Record<string, unknown>) {
  try {
    await sb.from('ai_usage_logs').insert({
      user_id: userId,
      operation_type: 'tech_radar_review',
      model_name: RESEARCH_MODEL,
      api_provider: 'anthropic',
      raw_cost_usd: cost,
      markup_multiplier: 1,
      billed_cost_usd: cost,
      credits_debited: 0,
      metadata: { feature: 'tech_radar', ...meta },
      created_at: new Date().toISOString(),
    });
  } catch (e) { console.warn('[tech-radar] usage log failed:', e); }
}

// cron-schedule helper: pick a daily/weekly cron from an interval-in-hours
function cronForInterval(hours: number): string {
  if (hours <= 24) return '0 9 * * *';        // daily 09:00 UTC
  if (hours <= 24 * 7) return '0 9 * * 1';     // weekly Monday 09:00 UTC
  return '0 9 1 * *';                          // monthly 1st 09:00 UTC
}

// ───────────────────────────────────────────────────────────────────────────
// 1) review_solution
// ───────────────────────────────────────────────────────────────────────────

export const createReviewSolutionTool = (
  userId: string,
  workspaceId: string,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ subject_id, title, component, repo, current_approach, constraints, save }) => {
      const sb = svcClient();
      onChunk?.({ type: 'tool_progress', status: `Tech-radar review: ${title || subject_id}…`, timestamp: Date.now() });

      // Resolve or build the subject. Scope by workspace_id so a subject_id from
      // another tenant returns "not found" (BOLA guard — CLAUDE.md invariant 1).
      let subject: any = null;
      if (subject_id) {
        const { data } = await sb.from('tech_radar_subjects').select('*')
          .eq('id', subject_id).eq('workspace_id', workspaceId).maybeSingle();
        if (!data) return JSON.stringify({ success: false, error: 'subject not found' });
        subject = data;
      } else {
        if (!title || !current_approach) {
          return JSON.stringify({ success: false, error: 'Provide subject_id, or both title and current_approach.' });
        }
        if (save) {
          const { data, error } = await sb.from('tech_radar_subjects').insert({
            workspace_id: workspaceId, created_by: userId,
            title, component: component ?? null, repo: repo ?? null,
            current_approach, constraints: constraints ?? null,
          }).select('*').single();
          if (error) return JSON.stringify({ success: false, error: error.message });
          subject = data;
        } else {
          subject = { id: null, workspace_id: workspaceId, title, component, repo, current_approach, constraints };
        }
      }

      try {
        let result;
        if (subject.id) {
          result = await runRadarForSubject(sb, subject, { runId: null });
        } else {
          // ephemeral (not saved) — research only, no persistence
          const research = await researchSolution(subject);
          result = { summary: research.summary, newCount: research.findings.length, total: research.findings.length, rows: research.findings, rawCostUsd: research.rawCostUsd };
        }
        await logUsage(sb, userId, result.rawCostUsd, { subject_id: subject.id, title: subject.title, finding_count: result.total });

        onChunk?.({
          type: 'tech_radar_findings',
          subject: { id: subject.id, title: subject.title, component: subject.component },
          summary: result.summary,
          findings: result.rows,
          new_count: result.newCount,
          saved: !!subject.id,
          timestamp: Date.now(),
        });

        return JSON.stringify({
          success: true,
          subject_id: subject.id,
          saved: !!subject.id,
          summary: result.summary,
          findings: result.rows,
          new_findings: result.newCount,
          hint: subject.id
            ? 'Findings saved. Say "keep watching this" to set up a background monitor.'
            : 'One-shot review (not saved). Pass save=true to track it.',
        });
      } catch (e) {
        return JSON.stringify({ success: false, error: e instanceof Error ? e.message : 'review failed' });
      }
    },
    {
      name: 'review_solution',
      description:
        'Run a Tech Radar review of a solution/component: deep-research the current tech landscape ' +
        '(libraries, frameworks, infra, services, patterns, AND AI models) and return concrete, ' +
        'ring-scored improvement ideas (adopt/trial/assess/hold). Pass an existing subject_id, or ' +
        'describe a new one with title + current_approach (set save=true to start tracking it).',
      schema: z.object({
        subject_id:       z.string().optional().describe('Existing tech_radar_subjects.id to re-review'),
        title:            z.string().optional().describe('Name of the solution, e.g. "PDF OCR pipeline"'),
        component:        z.string().optional().describe('Short area slug, e.g. "ocr", "image-embeddings"'),
        repo:             z.string().optional().describe('owner/repo if relevant'),
        current_approach: z.string().optional().describe('How it works TODAY: models, libraries, infra, the X way'),
        constraints:      z.string().optional().describe('Budget/latency/compat constraints to respect'),
        save:             z.boolean().optional().describe('Persist as a tracked subject (default false)'),
      }),
    },
  );
};

// ───────────────────────────────────────────────────────────────────────────
// 2) track_tech_radar — create the background monitor
// ───────────────────────────────────────────────────────────────────────────

export const createTrackTechRadarTool = (
  userId: string,
  workspaceId: string,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ action, subject_id, title, component, repo, current_approach, constraints, review_interval_hours }) => {
      const sb = svcClient();

      // Vague request → mount the setup modal instead of guessing fields.
      if (action === 'open_form') {
        onChunk?.({
          type: 'tech_radar_form_open',
          prefill: { title, component, repo, current_approach, constraints },
          timestamp: Date.now(),
        });
        return JSON.stringify({ success: true, form_opened: true, message: 'Opened the Tech Radar form for the user to fill in.' });
      }

      // Resolve subject by id or title — always workspace-scoped (BOLA guard:
      // a subject_id from another tenant must not resolve). CLAUDE.md invariant 1.
      let subject: any = null;
      if (subject_id) {
        const { data } = await sb.from('tech_radar_subjects').select('*')
          .eq('id', subject_id).eq('workspace_id', workspaceId).maybeSingle();
        subject = data;
      } else if (title) {
        const { data } = await sb.from('tech_radar_subjects').select('*')
          .eq('workspace_id', workspaceId).ilike('title', title).maybeSingle();
        subject = data;
      }

      if (action === 'create') {
        if (!subject) {
          if (!title || !current_approach) {
            return JSON.stringify({ success: false, error: 'Need title + current_approach to create a subject.' });
          }
          const { data, error } = await sb.from('tech_radar_subjects').insert({
            workspace_id: workspaceId, created_by: userId,
            title, component: component ?? null, repo: repo ?? null, current_approach,
            constraints: constraints ?? null,
            review_interval_hours: review_interval_hours ?? 168,
            next_review_at: new Date().toISOString(),  // due immediately on first tick
          }).select('*').single();
          if (error) return JSON.stringify({ success: false, error: error.message });
          subject = data;
        }

        // Create the background_agents cron monitor (reuses agent-scheduler-cron)
        const intervalH = Number(subject.review_interval_hours ?? 168);
        const { data: agent, error: aErr } = await sb.from('background_agents').insert({
          name: `Tech Radar — ${subject.title}`,
          description: `Watches the tech landscape for "${subject.title}" and surfaces new improvement ideas.`,
          agent_type: 'tech-radar',
          trigger_type: 'cron',
          schedule: cronForInterval(intervalH),
          model: RESEARCH_MODEL,
          config: { subject_id: subject.id },
          enabled: true,
          workspace_id: workspaceId,
          created_by: userId,
        }).select('id').single();
        if (aErr) return JSON.stringify({ success: false, error: `monitor create failed: ${aErr.message}` });

        await sb.from('tech_radar_subjects').update({ monitor_agent_id: agent.id, is_active: true }).eq('id', subject.id);

        onChunk?.({ type: 'tech_radar_monitor', action: 'created', subject_id: subject.id, title: subject.title, schedule: cronForInterval(intervalH), timestamp: Date.now() });
        return JSON.stringify({ success: true, subject_id: subject.id, monitor_agent_id: agent.id, schedule: cronForInterval(intervalH), message: `Now watching "${subject.title}". It runs on a ${intervalH <= 24 ? 'daily' : intervalH <= 168 ? 'weekly' : 'monthly'} cadence and only surfaces NEW ideas.` });
      }

      if (!subject) return JSON.stringify({ success: false, error: 'subject not found by id or title' });

      if (action === 'pause' || action === 'resume') {
        const enabled = action === 'resume';
        if (subject.monitor_agent_id) {
          await sb.from('background_agents').update({ enabled }).eq('id', subject.monitor_agent_id);
        }
        await sb.from('tech_radar_subjects').update({ is_active: enabled }).eq('id', subject.id);
        return JSON.stringify({ success: true, subject_id: subject.id, paused: !enabled });
      }

      if (action === 'delete') {
        if (subject.monitor_agent_id) await sb.from('background_agents').delete().eq('id', subject.monitor_agent_id);
        await sb.from('tech_radar_subjects').delete().eq('id', subject.id);
        return JSON.stringify({ success: true, deleted: subject.id });
      }

      return JSON.stringify({ success: false, error: `unknown action: ${action}` });
    },
    {
      name: 'track_tech_radar',
      description:
        'Set up or manage a background Tech Radar monitor for a solution. action=create starts ' +
        'watching (creates the subject if needed + a cron monitor that re-runs the review and ' +
        'surfaces only NEW ideas). action=pause/resume/delete manage it. Use when the user says ' +
        '"keep watching this", "monitor X", "stop watching", etc. When the user is vague and you ' +
        'lack title + current_approach, call action="open_form" to mount the setup modal instead of guessing.',
      schema: z.object({
        action:                z.enum(['create', 'pause', 'resume', 'delete', 'open_form']),
        subject_id:            z.string().optional(),
        title:                 z.string().optional(),
        component:             z.string().optional(),
        repo:                  z.string().optional(),
        current_approach:      z.string().optional(),
        constraints:           z.string().optional(),
        review_interval_hours: z.number().optional().describe('Cadence: <=24 daily, <=168 weekly, else monthly. Default 168.'),
      }),
    },
  );
};

// ───────────────────────────────────────────────────────────────────────────
// 3) list_tech_radar
// ───────────────────────────────────────────────────────────────────────────

export const createListTechRadarTool = (
  userId: string,
  workspaceId: string,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ subject_id, ring, only_new }) => {
      const sb = svcClient();

      if (subject_id) {
        // Workspace-scope the subject lookup so cross-tenant subject_ids 404 (BOLA guard).
        const { data: subject } = await sb.from('tech_radar_subjects').select('*')
          .eq('id', subject_id).eq('workspace_id', workspaceId).maybeSingle();
        if (!subject) return JSON.stringify({ success: false, error: 'subject not found' });
        let q = sb.from('tech_radar_findings').select('*')
          .eq('subject_id', subject_id).eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false });
        if (ring) q = q.eq('ring', ring);
        if (only_new) q = q.eq('is_new', true);
        const { data: findings } = await q.limit(50);
        onChunk?.({ type: 'tech_radar_list', subject, findings: findings ?? [], timestamp: Date.now() });
        return JSON.stringify({ success: true, subject, findings: findings ?? [] });
      }

      const { data: subjects } = await sb.from('tech_radar_subjects')
        .select('id, title, component, is_active, monitor_agent_id, last_reviewed_at, next_review_at')
        .eq('workspace_id', workspaceId).order('updated_at', { ascending: false }).limit(50);

      onChunk?.({ type: 'tech_radar_list', subjects: subjects ?? [], timestamp: Date.now() });
      return JSON.stringify({ success: true, subjects: subjects ?? [] });
    },
    {
      name: 'list_tech_radar',
      description: 'List tracked Tech Radar subjects, or (with subject_id) the findings for one. Filter by ring or only_new.',
      schema: z.object({
        subject_id: z.string().optional(),
        ring:       z.enum(['adopt', 'trial', 'assess', 'hold']).optional(),
        only_new:   z.boolean().optional(),
      }),
    },
  );
};

// ───────────────────────────────────────────────────────────────────────────
// 4) update_finding — keep findings actionable (not inert)
// ───────────────────────────────────────────────────────────────────────────

export const createUpdateFindingTool = (
  userId: string,
  workspaceId: string,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ finding_id, status }) => {
      const sb = svcClient();
      const { data, error } = await sb.from('tech_radar_findings')
        .update({ status, is_new: false }).eq('id', finding_id).eq('workspace_id', workspaceId)
        .select('id, title, status').maybeSingle();
      if (error) return JSON.stringify({ success: false, error: error.message });
      if (!data) return JSON.stringify({ success: false, error: 'finding not found in this workspace' });
      return JSON.stringify({ success: true, finding: data });
    },
    {
      name: 'update_finding',
      description: 'Set the status of a Tech Radar finding: accepted / dismissed / in_progress / done / reviewed.',
      schema: z.object({
        finding_id: z.string(),
        status:     z.enum(['reviewed', 'accepted', 'dismissed', 'in_progress', 'done']),
      }),
    },
  );
};
