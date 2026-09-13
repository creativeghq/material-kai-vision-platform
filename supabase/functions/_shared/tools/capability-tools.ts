/**
 * The capability ledger, as a tool.
 *
 * This exists so the agent can check what the workspace can actually do BEFORE it advertises
 * something. Today it offers a tool, the tool hits a gate, and the user gets an apology or an
 * answer from memory about a feature that was never connected.
 */

// deno-lint-ignore-file no-explicit-any

// Same shape as stock-tools.ts, and for the reason stated there: `tool` is typed NON-generically
// on purpose. Inferring it pulls @langchain/core's generic graph into every module that defines a
// tool, which is what pushes agent-chat past 12 GB and out of the edge typecheck gate.
const { tool } = await import('npm:@langchain/core@1.2.9/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  ) => any;
};
const { z } = await import('npm:zod@3.25.76');

interface CapabilityCtx {
  // deno-lint-ignore no-explicit-any
  supabase: any;
  workspaceId: string | null;
}

/** Ordered worst-first: a ledger that leads with what works buries the reason someone opened it. */
const SEVERITY: Record<string, number> = {
  failed: 0, never_run: 1, not_connected: 2, no_data: 3, not_entitled: 4, unknown: 5, working: 6,
};

export const createWorkspaceCapabilitiesTool = (
  _userId: string, onChunk?: (chunk: any) => void, ctx?: CapabilityCtx,
) => {
  return tool(
    async ({ only_problems }) => {
      if (!ctx?.workspaceId) {
        return JSON.stringify({ success: false, error: 'No active workspace for this conversation.' });
      }
      onChunk?.({ type: 'tool_progress', status: 'Checking what this workspace can do…', timestamp: Date.now() });

      const { data, error } = await ctx.supabase.rpc('get_workspace_capabilities', {
        p_workspace_id: ctx.workspaceId,
      });
      if (error) return JSON.stringify({ success: false, error: error.message });

      const rows = ((data as any[]) || []).slice().sort(
        (a, b) => (SEVERITY[a.status] ?? 9) - (SEVERITY[b.status] ?? 9) || String(a.area).localeCompare(b.area),
      );
      const problems = rows.filter((r) => r.status !== 'working');
      const shown = only_problems ? problems : rows;

      onChunk?.({
        type: 'workspace_capabilities',
        items: shown,
        working: rows.length - problems.length,
        total: rows.length,
        timestamp: Date.now(),
      });

      return JSON.stringify({
        success: true,
        total: rows.length,
        working: rows.length - problems.length,
        // The model gets the STATED REASON per row, so it can answer "why can't I…" with the
        // platform's own words instead of guessing or apologising.
        items: shown.map((r) => ({
          key: r.key, area: r.area, label: r.label, status: r.status,
          detail: r.detail, since: r.since, destination: r.destination,
        })),
      });
    },
    {
      name: 'workspace_capabilities',
      description: 'What this workspace can actually do right now, and where it cannot, the stated reason. '
        + 'Each row is one of: working, no_data (ran, nothing configured to find), failed (ran, the upstream '
        + 'refused — UNKNOWN, not zero), never_run, not_connected, not_entitled (module not active), or unknown. '
        + 'Call this BEFORE telling someone a feature is unavailable or broken, and before promising one that '
        + 'may not be connected — it carries the reason and often a destination to fix it.',
      schema: z.object({
        only_problems: z.boolean().optional().describe('Return only the capabilities that are not working (default false).'),
      }),
    },
  );
};
