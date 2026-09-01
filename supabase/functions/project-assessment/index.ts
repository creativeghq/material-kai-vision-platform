// deno-lint-ignore-file no-explicit-any
/**
 * AI Assessment for a project — "is this on track, and what do I do next?"
 *
 * This is the HTTP door. The work is in `_shared/project-assessment.ts`, shared with JARVIS's
 * `assess_project` tool so the button and the agent cannot produce different reports, charge
 * different credits, or miss each other's idempotency claim.
 *
 * MODES
 *   preview  — the SQL derivation only. Free, no model call, no credit. The tab renders this
 *              live, so the operator sees the signals before deciding to pay for the write-up.
 *   run      — the paid one. Reserve → start → Claude → claim → settle.
 *
 * The two gates that live HERE rather than in the shared body, because they differ per entry
 * point: tenancy binding against the verified JWT, and module entitlement.
 */
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, getUserId, userCanAccessWorkspace } from '../_shared/auth.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { assertEntitled } from '../_shared/entitlement.ts';
import {
  ASSESSMENT_MODULE_SLUG,
  previewProjectAssessment,
  runProjectAssessment,
} from '../_shared/project-assessment.ts';

interface RequestBody {
  project_id?: string;
  /**
   * The OPERATOR's calendar day, from the browser. `current_date` in Postgres is the UTC day,
   * and between local midnight and 03:00 in Greece that is YESTERDAY — on a derivation whose
   * whole job is deciding what is overdue (CLAUDE.md rule 1b). The RPC bounds it to +/-2 days so
   * a body-supplied value cannot move a verdict.
   */
  today?: string;
  mode?: 'preview' | 'run';
}

Deno.serve(withApiLogging('project-assessment', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');

  let body: RequestBody;
  try { body = (await req.json()) as RequestBody; } catch { throw new HttpError(400, 'Invalid JSON body'); }

  const projectId = (body.project_id || '').trim();
  if (!projectId) throw new HttpError(400, 'project_id is required');
  const mode = body.mode === 'run' ? 'run' : 'preview';
  const today = /^\d{4}-\d{2}-\d{2}$/.test(body.today || '') ? body.today! : null;

  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success) throw new HttpError(401, auth.error ?? 'Unauthorized');
  const userId = getUserId(auth);
  if (!userId) throw new HttpError(401, 'Unauthorized');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // Tenancy binding (invariant 1). The client above is service-role, so this check is MANDATORY
  // rather than a formality, and `project_id` arrives in the body. 404 on a mismatch, never 403 —
  // a 403 confirms the id exists.
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id, name, workspace_id')
    .eq('id', projectId)
    .maybeSingle();
  if (projErr) throw new Error(`Loading the project failed: ${projErr.message}`);
  if (!project) throw new HttpError(404, 'Project not found');
  const workspaceId: string | null = (project as any).workspace_id ?? null;
  if (!workspaceId) throw new HttpError(400, 'This project has no workspace, so it cannot be assessed.');
  if (!(await userCanAccessWorkspace(supabase, userId, workspaceId))) {
    throw new HttpError(404, 'Project not found');
  }

  // Module entitlement at the API boundary — the page guard is UX, this is the line.
  const ent = await assertEntitled(supabase, workspaceId, ASSESSMENT_MODULE_SLUG);
  if (!ent.ok) return ent.response;

  const json = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

  if (mode === 'preview') {
    return json({ ok: true, mode: 'preview', snapshot: await previewProjectAssessment(supabase, projectId, today) });
  }

  try {
    const result = await runProjectAssessment(supabase, { projectId, workspaceId, userId, today });
    return json({ mode: 'run', ...result });
  } catch (err) {
    // A refused wallet is a 402 the frontend routes to a top-up, not a 500 that reads as a bug.
    // The shared body has already refunded the ceiling and named the failure on the row.
    if ((err as { code?: string })?.code === 'insufficient_credits') {
      throw new HttpError(402, err instanceof Error ? err.message : 'Not enough credits');
    }
    throw err;
  }
}));
