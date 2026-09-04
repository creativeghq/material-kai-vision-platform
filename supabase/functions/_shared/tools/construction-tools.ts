/**
 * Construction Tools — agent-chat surface for the contractor money chain.
 *
 * The whole construction build (cost codes, priced schedule, CVR, variations, applications,
 * retention, tendering) shipped with NOTHING the agent could reach. On this platform that is a
 * structural gap rather than a nicety: an operator's habit is to ask, and a feature the agent
 * cannot see does not exist to them.
 *
 * Tools:
 *   - project_cvr             — value against cost per cost code, and the job's margin
 *   - project_applications    — what has been claimed, certified, paid and retained
 *   - list_variations         — changes to scope, and which are not yet agreed
 *   - tender_status           — packages out, bids in, and what is waiting on a decision
 *
 * EVERY FIGURE COMES FROM SQL. These tools call `get_project_cvr`,
 * `get_project_applications` and `get_project_retention` and format the result — they never add
 * anything up. A second implementation of a money quantity inside a tool would be the fifth copy
 * of the defect anti-regression rule 1 exists to stop, and it would be the copy a model quotes to
 * somebody out loud.
 *
 * All four are READ-ONLY. Nothing here raises a variation, certifies an application or awards a
 * package: those move real money and belong behind the human-in-the-loop gate, not behind a
 * sentence a model decided to act on.
 *
 * Cost discipline: all four are plain DB reads — 0 credits. Module-gated on `projects`.
 */

// `tool` is typed non-generically ON PURPOSE — see the note in project-tools.ts. Inferring it
// pulls @langchain/core's generic graph into every module that defines a tool, which is what makes
// agent-chat exceed the edge typecheck gate's memory ceiling.
const { tool } = await import('npm:@langchain/core@1.2.9/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  ) => any;
};
const { z } = await import('npm:zod@3.25.76');

const MODULE_SLUG = 'projects';

import { serviceClient as svcClient } from '../supabase-client.ts';
import { moduleGate } from './module-gate.ts';
import { resolveProjectId as sbResolveProjectId } from '../assessment.ts';

/**
 * The shared workspace-scoped resolver (#395, invariant 1). Deliberately the same one
 * `project-tools` and `assessment` use — two copies of a tenancy check is how that hole gets
 * reopened one file over.
 */
async function resolveProject(
  userId: string, workspaceId: string | null, projectId?: string, projectName?: string,
): Promise<string | null> {
  return await sbResolveProjectId(svcClient(), userId, workspaceId, projectId, projectName);
}

const notFound = (name?: string) => JSON.stringify({
  success: false,
  error: name
    ? `No project matching "${name}". Use find_project to look it up first.`
    : 'Name or id the project — use find_project if you are not sure which one.',
});

const money = (v: unknown) => Number(v ?? 0);

// ───────────────────────────────────────────────────────────────────────────
// 1) project_cvr
// ───────────────────────────────────────────────────────────────────────────

export const createProjectCvrTool = (
  userId: string,
  workspaceId: string | null,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ project_id, project_name }: { project_id?: string; project_name?: string }) => {
      const denied = await moduleGate(workspaceId, MODULE_SLUG);
      if (denied) return denied;

      const id = await resolveProject(userId, workspaceId, project_id, project_name);
      if (!id) return notFound(project_name);

      onChunk?.({ type: 'tool_progress', status: 'Reading the cost report…', timestamp: Date.now() });

      const sb = svcClient();
      const { data, error } = await sb.rpc('get_project_cvr', { p_project_id: id });
      if (error) return JSON.stringify({ success: false, error: error.message });

      const rows = (data ?? []) as Array<Record<string, unknown>>;
      // Summed from the SQL's own per-row totals. Never rebuilt from the components beside them.
      // The accumulator is typed explicitly: `Record<string, unknown>` rows make the seed's
      // properties `unknown` to the edge typechecker otherwise.
      const totals = rows.reduce<{ value: number; cost: number; margin: number }>(
        (a, r) => ({
          value: a.value + money(r.total_value),
          cost: a.cost + money(r.total_cost),
          margin: a.margin + money(r.margin),
        }),
        { value: 0, cost: 0, margin: 0 },
      );
      const uncoded = rows.find((r) => r.cost_code_id === null);

      return JSON.stringify({
        success: true,
        project_id: id,
        url: `/projects/${id}?tab=finance`,
        totals,
        // Stated rather than left for the reader to notice: money with no cost code is money the
        // report cannot attribute, and it is the number that says the report is incomplete.
        uncoded_value: uncoded ? money(uncoded.total_value) : 0,
        uncoded_cost: uncoded ? money(uncoded.total_cost) : 0,
        by_code: rows.map((r) => ({
          code: r.code ?? null,
          name: r.name ?? 'Not coded',
          contracted: money(r.contracted_value),
          variations: money(r.variation_value),
          value: money(r.total_value),
          actual_cost: money(r.actual_cost),
          committed_cost: money(r.committed_cost),
          cost: money(r.total_cost),
          margin: money(r.margin),
          // Null means there is no value to take a percentage of — a different fact from 0%.
          margin_pct: r.margin_pct === null ? null : Number(r.margin_pct),
        })),
      });
    },
    {
      name: 'project_cvr',
      description:
        'Cost value reconciliation for one construction project: contracted value plus approved '
        + 'client variations against actual cost, open commitments and approved subcontractor '
        + 'variations, broken down by cost code with the margin on each. Use this to answer "how '
        + 'is this job doing", "are we making money on it", or "where is the margin going". Only '
        + 'APPROVED variations are counted — anything still being argued about is excluded, so do '
        + 'not describe the result as the final account.',
      schema: z.object({
        project_id: z.string().optional().describe('The project id, when you already have it'),
        project_name: z.string().optional().describe('The project name, if you do not have the id'),
      }),
    },
  );
};

// ───────────────────────────────────────────────────────────────────────────
// 2) project_applications
// ───────────────────────────────────────────────────────────────────────────

export const createProjectApplicationsTool = (
  userId: string,
  workspaceId: string | null,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ project_id, project_name }: { project_id?: string; project_name?: string }) => {
      const denied = await moduleGate(workspaceId, MODULE_SLUG);
      if (denied) return denied;

      const id = await resolveProject(userId, workspaceId, project_id, project_name);
      if (!id) return notFound(project_name);

      onChunk?.({ type: 'tool_progress', status: 'Reading the payment applications…', timestamp: Date.now() });

      const sb = svcClient();
      const [{ data: apps, error }, { data: ret }] = await Promise.all([
        sb.rpc('get_project_applications', { p_project_id: id }),
        sb.rpc('get_project_retention', { p_project_id: id }),
      ]);
      if (error) return JSON.stringify({ success: false, error: error.message });

      const rows = (apps ?? []) as Array<Record<string, unknown>>;
      const retention = (ret ?? {}) as Record<string, unknown>;

      return JSON.stringify({
        success: true,
        project_id: id,
        url: `/projects/${id}?tab=finance`,
        // A certified application has been AGREED and NOT PAID. Reported as outstanding, because
        // calling it settled makes a job that is owed everything look square.
        outstanding: rows
          .filter((r) => r.status !== 'paid')
          .reduce((s, r) => s + (r.certified_amount === null ? money(r.net_due) : money(r.certified_amount)), 0),
        retention_held: money(retention.held),
        retention_released: money(retention.released),
        retention_outstanding: money(retention.outstanding),
        applications: rows.map((r) => ({
          reference: r.reference,
          valued_to: r.period_to,
          status: r.status,
          gross_to_date: money(r.gross_valuation),
          retention_held: money(r.retention_cumulative),
          claimed: money(r.net_due),
          // Null while unanswered rather than 0 — nobody has disagreed yet.
          certified: r.certified_amount === null ? null : money(r.certified_amount),
          variance: r.variance === null ? null : money(r.variance),
          due_on: r.due_on,
        })),
      });
    },
    {
      name: 'project_applications',
      description:
        'Applications for payment on a construction project, with retention. Shows what was '
        + 'claimed, what the payer certified, the difference between them, and how much retention '
        + 'is held and released. Use for "what are we owed", "has it been certified", "how much '
        + 'retention is still held". Applications are CUMULATIVE — each states the work done to '
        + 'date and what is due is the difference from what was certified before, so never add '
        + 'the claims together.',
      schema: z.object({
        project_id: z.string().optional().describe('The project id, when you already have it'),
        project_name: z.string().optional().describe('The project name, if you do not have the id'),
      }),
    },
  );
};

// ───────────────────────────────────────────────────────────────────────────
// 3) list_variations
// ───────────────────────────────────────────────────────────────────────────

export const createListVariationsTool = (
  userId: string,
  workspaceId: string | null,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ project_id, project_name, only_undecided }: {
      project_id?: string; project_name?: string; only_undecided?: boolean;
    }) => {
      const denied = await moduleGate(workspaceId, MODULE_SLUG);
      if (denied) return denied;

      const id = await resolveProject(userId, workspaceId, project_id, project_name);
      if (!id) return notFound(project_name);

      onChunk?.({ type: 'tool_progress', status: 'Reading the variation register…', timestamp: Date.now() });

      const sb = svcClient();
      let q = sb
        .from('project_variations')
        .select('reference, direction, title, origin, status, value, currency, time_impact_days, raised_on, decided_at')
        .eq('project_id', id);
      if (only_undecided) q = q.in('status', ['draft', 'submitted']);
      const { data, error } = await q.order('direction').order('reference');
      if (error) return JSON.stringify({ success: false, error: error.message });

      const rows = (data ?? []) as Array<Record<string, unknown>>;
      const approved = rows.filter((r) => r.status === 'approved');

      return JSON.stringify({
        success: true,
        project_id: id,
        url: `/projects/${id}?tab=finance`,
        // Two totals, never one. A client variation is money IN and a supplier variation money
        // OUT; netting them is the defect anti-regression rule 1 exists to prevent.
        approved_to_client: approved.filter((r) => r.direction === 'client').reduce((s, r) => s + money(r.value), 0),
        approved_to_subcontractors: approved.filter((r) => r.direction === 'supplier').reduce((s, r) => s + money(r.value), 0),
        undecided_count: rows.filter((r) => r.status === 'draft' || r.status === 'submitted').length,
        variations: rows.map((r) => ({
          reference: r.reference,
          direction: r.direction === 'client' ? 'to the client' : 'to a subcontractor',
          title: r.title,
          why: r.origin,
          status: r.status,
          value: money(r.value),
          currency: r.currency,
          extra_days: Number(r.time_impact_days ?? 0),
          raised_on: r.raised_on,
          decided_at: r.decided_at,
        })),
      });
    },
    {
      name: 'list_variations',
      description:
        'Variations on a construction project: agreed changes to the scope, in both directions. '
        + 'Use for "what extras are on this job", "what has the client not agreed yet", "how much '
        + 'have the subcontractors claimed". Client and subcontractor variations are reported '
        + 'SEPARATELY and must never be added together — one is money coming in and the other '
        + 'money going out. Only approved ones reach the cost report; the rest are a pipeline.',
      schema: z.object({
        project_id: z.string().optional().describe('The project id, when you already have it'),
        project_name: z.string().optional().describe('The project name, if you do not have the id'),
        only_undecided: z.boolean().optional()
          .describe('Only those still draft or submitted — the ones needing a decision'),
      }),
    },
  );
};

// ───────────────────────────────────────────────────────────────────────────
// 4) tender_status
// ───────────────────────────────────────────────────────────────────────────

export const createTenderStatusTool = (
  userId: string,
  workspaceId: string | null,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ project_id, project_name }: { project_id?: string; project_name?: string }) => {
      const denied = await moduleGate(workspaceId, MODULE_SLUG);
      if (denied) return denied;

      const id = await resolveProject(userId, workspaceId, project_id, project_name);
      if (!id) return notFound(project_name);

      onChunk?.({ type: 'tool_progress', status: 'Reading the tender packages…', timestamp: Date.now() });

      const sb = svcClient();
      const { data: packages, error } = await sb
        .from('tender_packages')
        .select('id, reference, name, status, currency, due_at, awarded_order_id')
        .eq('project_id', id)
        .order('reference');
      if (error) return JSON.stringify({ success: false, error: error.message });

      const pkgs = (packages ?? []) as Array<Record<string, unknown>>;
      if (pkgs.length === 0) {
        return JSON.stringify({ success: true, project_id: id, packages: [], count: 0 });
      }

      const { data: bids } = await sb
        .from('tender_bids')
        .select('package_id, status, sent_at, company_id, crm_companies(name)')
        .in('package_id', pkgs.map((p) => p.id as string));

      const byPackage = new Map<string, Array<Record<string, unknown>>>();
      for (const b of (bids ?? []) as Array<Record<string, unknown>>) {
        const k = String(b.package_id);
        byPackage.set(k, [...(byPackage.get(k) ?? []), b]);
      }

      return JSON.stringify({
        success: true,
        project_id: id,
        url: `/projects/${id}?tab=finance`,
        count: pkgs.length,
        packages: pkgs.map((p) => {
          const bs = byPackage.get(String(p.id)) ?? [];
          return {
            reference: p.reference,
            name: p.name,
            status: p.status,
            bids_due: p.due_at,
            awarded: p.status === 'awarded',
            // Sent but silent is the state a buyer chases, so it is reported rather than folded
            // into a single "invited" count.
            invited: bs.filter((b) => b.status === 'invited').length,
            awaiting_reply: bs.filter((b) => b.status === 'invited' && b.sent_at).length,
            not_yet_sent: bs.filter((b) => b.status === 'invited' && !b.sent_at).length,
            received: bs.filter((b) => b.status === 'received').length,
            declined: bs.filter((b) => b.status === 'declined').length,
            bidders: bs.map((b) => ({
              name: (b.crm_companies as { name?: string } | null)?.name ?? 'Unnamed',
              status: b.status,
              enquiry_sent: !!b.sent_at,
            })),
          };
        }),
      });
    },
    {
      name: 'tender_status',
      description:
        'Tender packages on a construction project: what is out to subcontractors, who has been '
        + 'asked, who has replied, and what has been awarded. Use for "where are we on the '
        + 'plumbing tender", "who has not come back yet", "what still needs awarding". Reports '
        + 'separately whether an enquiry has actually been SENT versus merely invited, because a '
        + 'subcontractor who was never emailed is not late.',
      schema: z.object({
        project_id: z.string().optional().describe('The project id, when you already have it'),
        project_name: z.string().optional().describe('The project name, if you do not have the id'),
      }),
    },
  );
};
