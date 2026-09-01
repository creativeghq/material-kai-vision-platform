// deno-lint-ignore-file no-explicit-any
/**
 * AI Assessment — PROJECT subject. "Is this project on track, and what do I do next?"
 *
 * The door only resolves the subject; everything after that (JWT, tenancy, entitlement,
 * preview/run, the 402 mapping) is `_shared/assessment-http.ts`, and the work itself is
 * `_shared/assessment.ts` — shared with the finance and real-estate doors and with the agent
 * toolkits, so no two entry points can produce different reports or charge differently.
 */
import { withApiLogging } from '../_shared/api-logger.ts';
import { handleAssessmentRequest } from '../_shared/assessment-http.ts';

Deno.serve(withApiLogging('project-assessment', (req) =>
  handleAssessmentRequest(req, 'project', async (supabase, _userId, body) => {
    const id = (body.project_id || body.subject_id || '').trim();
    if (!id) return null;
    const { data } = await supabase
      .from('projects').select('id, workspace_id').eq('id', id).maybeSingle();
    const ws = (data as any)?.workspace_id;
    // A project with no workspace cannot be assessed: every tenancy check, index and RLS
    // predicate downstream keys on it.
    return ws ? { subjectId: (data as any).id as string, workspaceId: ws as string } : null;
  })));
