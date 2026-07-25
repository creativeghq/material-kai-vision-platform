/**
 * dashboard-insights
 *
 * Generates a short, personalised set of AI insights for the home dashboard's
 * "AI Insights" panel, derived from a live snapshot of the caller's workspace
 * activity (projects, finance / AR, tasks, inbox, quotes).
 *
 * Design goals (per product spec):
 *  - **Cached for 15 days** per (user, workspace) in `dashboard_insights_cache`.
 *    A warm cache returns instantly without an LLM call.
 *  - **Never errors** — if the LLM call fails (credits, timeout, bad output) we
 *    fall back to a deterministic, numbers-driven insight set built from the same
 *    snapshot, cached with a SHORT TTL so the next visit re-attempts the AI path.
 *    The endpoint always returns 200 with usable insights (except auth failures).
 *
 * Auth: user JWT. Body: { workspace_id: string, force?: boolean }.
 * Response: { insights, model, source: 'ai'|'fallback', generated_at, expires_at, cached }.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { authenticate } from '../_shared/auth.ts';
import { generateStructuredWithClaude, z } from '../_shared/ai-client.ts';
// deno-lint-ignore no-explicit-any
type SB = any;

const CACHE_TTL_DAYS = 15;
const FALLBACK_TTL_HOURS = 12; // self-heal: re-attempt AI sooner when a fallback was cached
const INSIGHTS_MODEL = 'claude-haiku-4-5';

const TONES = ['info', 'positive', 'warning', 'tip'] as const;
type Tone = typeof TONES[number];

const InsightsSchema = z.object({
  headline: z.string().describe('One short, friendly sentence summarising the workspace state right now.'),
  insights: z
    .array(
      z.object({
        title: z.string().describe('3-6 word label'),
        body: z.string().describe('One or two concrete sentences using the provided numbers.'),
        tone: z.enum(TONES),
      }),
    )
    .min(2)
    .max(5),
});
type Insights = z.infer<typeof InsightsSchema>;

interface Snapshot {
  workspace_name: string;
  generated_for: string; // ISO date
  projects: {
    active: number;
    total: number;
    next: Array<{ name: string; status: string; deadline: string | null }>;
  };
  finance: {
    currency: string;
    outstanding_total: number;
    outstanding_count: number;
    overdue_count: number;
  };
  tasks: { due_soon: number; overdue: number; open_total: number };
  inbox: { open_threads: number };
  quotes: { open: number; recent_30d: number };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// ── Stats gathering (each block is independently fault-tolerant) ──────────────
async function gatherSnapshot(admin: SB, userId: string, workspaceId: string): Promise<Snapshot> {
  const now = Date.now();
  const in7d = new Date(now + 7 * 864e5).toISOString();
  const todayStart = new Date(new Date().toISOString().slice(0, 10)).toISOString();
  const since30d = new Date(now - 30 * 864e5).toISOString();

  const snap: Snapshot = {
    workspace_name: 'your workspace',
    generated_for: new Date().toISOString().slice(0, 10),
    projects: { active: 0, total: 0, next: [] },
    finance: { currency: 'EUR', outstanding_total: 0, outstanding_count: 0, overdue_count: 0 },
    tasks: { due_soon: 0, overdue: 0, open_total: 0 },
    inbox: { open_threads: 0 },
    quotes: { open: 0, recent_30d: 0 },
  };

  const tasks: Array<Promise<unknown>> = [];

  // Workspace name
  tasks.push(
    admin
      .from('workspaces')
      .select('name')
      .eq('id', workspaceId)
      .maybeSingle()
      .then(({ data }: { data: { name?: string } | null }) => {
        if (data?.name) snap.workspace_name = data.name;
      })
      .catch(() => {}),
  );

  // Projects (active list + totals)
  tasks.push(
    admin
      .from('projects')
      .select('name, status, deadline')
      .eq('workspace_id', workspaceId)
      .in('status', ['planning', 'in_progress', 'on_hold'])
      .order('deadline', { ascending: true, nullsFirst: false })
      .limit(50)
      .then(({ data }: { data: Array<{ name: string; status: string; deadline: string | null }> | null }) => {
        const rows = data ?? [];
        snap.projects.active = rows.length;
        snap.projects.next = rows.slice(0, 3);
      })
      .catch(() => {}),
  );
  tasks.push(
    admin
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .then(({ count }: { count: number | null }) => {
        snap.projects.total = count ?? 0;
      })
      .catch(() => {}),
  );

  // Finance — outstanding AR
  tasks.push(
    admin
      .from('invoices')
      .select('amount_due, due_at, status, currency')
      .eq('workspace_id', workspaceId)
      .in('status', ['issued', 'partially_paid', 'overdue'])
      .limit(1000)
      .then(({ data }: { data: Array<{ amount_due: number | null; due_at: string | null; status: string; currency: string }> | null }) => {
        const rows = data ?? [];
        let total = 0;
        let overdue = 0;
        for (const r of rows) {
          total += Number(r.amount_due ?? 0);
          if (r.status === 'overdue' || (r.due_at && new Date(r.due_at).getTime() < now)) overdue++;
          if (r.currency) snap.finance.currency = r.currency;
        }
        snap.finance.outstanding_total = Math.round(total * 100) / 100;
        snap.finance.outstanding_count = rows.length;
        snap.finance.overdue_count = overdue;
      })
      .catch(() => {}),
  );

  // Tasks assigned to the caller
  tasks.push(
    admin
      .from('project_tasks')
      .select('due_date, status')
      .eq('assignee_id', userId)
      .in('status', ['todo', 'in_progress', 'blocked'])
      .limit(500)
      .then(({ data }: { data: Array<{ due_date: string | null; status: string }> | null }) => {
        const rows = data ?? [];
        snap.tasks.open_total = rows.length;
        for (const r of rows) {
          if (!r.due_date) continue;
          if (r.due_date < todayStart) snap.tasks.overdue++;
          else if (r.due_date <= in7d) snap.tasks.due_soon++;
        }
      })
      .catch(() => {}),
  );

  // Inbox — open threads in the workspace
  tasks.push(
    admin
      .from('inbox_threads')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('status', 'open')
      .then(({ count }: { count: number | null }) => {
        snap.inbox.open_threads = count ?? 0;
      })
      .catch(() => {}),
  );

  // Quotes — open + recent
  tasks.push(
    admin
      .from('quotes')
      .select('status, created_at')
      .eq('workspace_id', workspaceId)
      .limit(1000)
      .then(({ data }: { data: Array<{ status: string; created_at: string }> | null }) => {
        const rows = data ?? [];
        const closed = new Set(['accepted', 'rejected', 'expired', 'cancelled', 'converted']);
        snap.quotes.open = rows.filter((r) => !closed.has((r.status || '').toLowerCase())).length;
        snap.quotes.recent_30d = rows.filter((r) => r.created_at >= since30d).length;
      })
      .catch(() => {}),
  );

  await Promise.allSettled(tasks);
  return snap;
}

// ── AI prompt ─────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are the analytics assistant for an interior-design and building-materials B2B platform.
Given a JSON snapshot of ONE user's workspace activity, write a short, friendly, specific set of dashboard insights.
Rules:
- Use ONLY the numbers in the snapshot. Never invent products, names, brands, or figures that are not present.
- Be concrete: cite the actual counts/amounts. Format money with the snapshot's currency.
- Each insight body is one or two sentences, plain and actionable.
- Choose tone: "warning" for things needing attention (overdue invoices/tasks), "positive" for good momentum,
  "tip" for an actionable suggestion, "info" for neutral context.
- If the workspace is nearly empty, encourage a clear first action (add materials, create a project) with a "tip".
- 2 to 5 insights. The headline is a single friendly sentence.`;

function buildPrompt(snap: Snapshot): string {
  return `Workspace activity snapshot (JSON):\n${JSON.stringify(snap, null, 2)}\n\nWrite the dashboard insights now.`;
}

// ── Deterministic fallback (used when the LLM path fails) ──────────────────────
function fmtMoney(n: number, currency: string): string {
  const sym = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency === 'GBP' ? '£' : `${currency} `;
  return `${sym}${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function buildFallbackInsights(snap: Snapshot): Insights {
  const out: Insights['insights'] = [];
  const f = snap.finance;

  if (f.overdue_count > 0) {
    out.push({
      title: 'Overdue invoices',
      body: `${f.overdue_count} invoice${f.overdue_count !== 1 ? 's are' : ' is'} past due — chase payment to keep cash flow healthy.`,
      tone: 'warning',
    });
  }
  if (f.outstanding_total > 0) {
    out.push({
      title: 'Outstanding receivables',
      body: `${fmtMoney(f.outstanding_total, f.currency)} is awaiting payment across ${f.outstanding_count} invoice${f.outstanding_count !== 1 ? 's' : ''}.`,
      tone: f.overdue_count > 0 ? 'warning' : 'info',
    });
  }
  if (snap.tasks.overdue > 0) {
    out.push({
      title: 'Tasks overdue',
      body: `You have ${snap.tasks.overdue} task${snap.tasks.overdue !== 1 ? 's' : ''} past their due date and ${snap.tasks.due_soon} due this week.`,
      tone: 'warning',
    });
  } else if (snap.tasks.due_soon > 0) {
    out.push({
      title: 'Tasks this week',
      body: `${snap.tasks.due_soon} task${snap.tasks.due_soon !== 1 ? 's are' : ' is'} due in the next 7 days.`,
      tone: 'info',
    });
  }
  if (snap.projects.active > 0) {
    const nextName = snap.projects.next[0]?.name;
    out.push({
      title: 'Active projects',
      body: nextName
        ? `${snap.projects.active} project${snap.projects.active !== 1 ? 's are' : ' is'} in progress — “${nextName}” is next up.`
        : `${snap.projects.active} project${snap.projects.active !== 1 ? 's are' : ' is'} currently in progress.`,
      tone: 'positive',
    });
  }
  if (snap.inbox.open_threads > 0) {
    out.push({
      title: 'Inbox needs attention',
      body: `${snap.inbox.open_threads} open conversation${snap.inbox.open_threads !== 1 ? 's are' : ' is'} waiting in your inbox.`,
      tone: 'info',
    });
  }
  if (snap.quotes.open > 0) {
    out.push({
      title: 'Open quotes',
      body: `${snap.quotes.open} quote${snap.quotes.open !== 1 ? 's are' : ' is'} open — follow up to move them toward acceptance.`,
      tone: 'tip',
    });
  }

  if (out.length === 0) {
    out.push({
      title: 'Get started',
      body: 'Add materials to your catalog or create your first project to start seeing tailored insights here.',
      tone: 'tip',
    });
    out.push({
      title: 'Explore the platform',
      body: 'Use the Agent Hub to compare specs across manufacturers, or browse Discover for new materials and factories.',
      tone: 'info',
    });
  }

  const headline =
    f.overdue_count > 0 || snap.tasks.overdue > 0
      ? 'A few items need your attention today.'
      : snap.projects.active > 0
        ? `${snap.projects.active} active project${snap.projects.active !== 1 ? 's' : ''} and your workspace is looking healthy.`
        : `Welcome to ${snap.workspace_name}.`;

  return { headline, insights: out.slice(0, 5) };
}

// ── Handler ─────────────────────────────────────────────────────────────────
serve(
  withApiLogging('dashboard-insights', async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    const auth = await authenticate(req, { requireUser: true });
    if (!auth.success || !auth.userId) return json({ error: auth.error || 'Unauthorized' }, 401);
    const userId = auth.userId;
    const admin = auth.supabase;

    let body: { workspace_id?: string; force?: boolean } = {};
    try {
      body = await req.json();
    } catch {
      /* empty body */
    }
    const workspaceId = body.workspace_id;
    const force = body.force === true;
    if (!workspaceId) return json({ error: 'workspace_id required' }, 400);

    // Authorize: the caller must be an active member of this workspace.
    const { data: member } = await admin
      .from('workspace_members')
      .select('role')
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .eq('status', 'active')
      .maybeSingle();
    if (!member) return json({ error: 'Not a member of this workspace' }, 403);

    // Warm cache?
    if (!force) {
      const { data: cached } = await admin
        .from('dashboard_insights_cache')
        .select('insights, model, source, generated_at, expires_at')
        .eq('user_id', userId)
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      if (cached && new Date(cached.expires_at).getTime() > Date.now()) {
        return json({ ...cached, cached: true });
      }
    }

    const snapshot = await gatherSnapshot(admin, userId, workspaceId);

    // ── Credit metering: debit before the Haiku call (only reached on a cache
    // miss — a warm cache returned above). If the caller is out of credits we
    // silently serve the deterministic fallback (this endpoint never errors).
    const INSIGHTS_CREDIT_COST = 1;
    let charged = false;
    {
      const { data: dd, error: de } = await admin.rpc('debit_credits', {
        p_user_id: userId,
        p_amount: INSIGHTS_CREDIT_COST,
        p_operation_type: 'dashboard_insights',
        p_description: 'Dashboard AI insights',
        p_metadata: { workspace_id: workspaceId },
        p_workspace_id: workspaceId,
      });
      const drow = Array.isArray(dd) ? dd[0] : dd;
      charged = !de && !!drow?.success;
    }

    let insights: Insights;
    let model: string | null = null;
    let source: 'ai' | 'fallback' = 'ai';
    if (!charged) {
      // No credits (or debit failed) → deterministic fallback, no charge.
      insights = buildFallbackInsights(snapshot);
      source = 'fallback';
    } else {
      try {
        const result = await generateStructuredWithClaude(buildPrompt(snapshot), InsightsSchema, {
          model: INSIGHTS_MODEL,
          systemPrompt: SYSTEM_PROMPT,
          temperature: 0.5,
          maxTokens: 900,
          task: 'dashboard_insights',
        });
        insights = result.output;
        model = result.model;
        if (!insights?.insights?.length) throw new Error('empty insights');
      } catch (err) {
        console.error('[dashboard-insights] AI generation failed, using deterministic fallback:', err);
        // Refund — the AI path failed; we deliver the deterministic fallback instead.
        try {
          await admin.rpc('refund_credits', {
            p_user_id: userId,
            p_amount: INSIGHTS_CREDIT_COST,
            p_operation_type: 'dashboard_insights_refund',
            p_description: 'Dashboard AI insights refund (fallback)',
            p_metadata: { workspace_id: workspaceId },
            p_workspace_id: workspaceId,
          });
        } catch (e) { console.warn('[dashboard-insights] refund failed:', e); }
        insights = buildFallbackInsights(snapshot);
        source = 'fallback';
      }
    }

    const ttlMs = source === 'ai' ? CACHE_TTL_DAYS * 864e5 : FALLBACK_TTL_HOURS * 36e5;
    const generatedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();

    // Best-effort cache write (never block the response on a cache failure).
    try {
      await admin.from('dashboard_insights_cache').upsert(
        {
          user_id: userId,
          workspace_id: workspaceId,
          insights,
          stats: snapshot,
          model,
          source,
          generated_at: generatedAt,
          expires_at: expiresAt,
        },
        { onConflict: 'user_id,workspace_id' },
      );
    } catch (err) {
      console.error('[dashboard-insights] cache upsert failed:', err);
    }

    return json({ insights, model, source, generated_at: generatedAt, expires_at: expiresAt, cached: false });
  }),
);
