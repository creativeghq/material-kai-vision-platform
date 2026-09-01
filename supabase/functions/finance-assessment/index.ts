/**
 * AI Assessment — FINANCE subject. "How are the books, and what do I fix first?"
 *
 * The subject IS the workspace: there is no finance record, so the id never comes from the body.
 * It is resolved from the caller's own active workspace, which also means this door cannot be
 * pointed at another tenant's books by a request that names one.
 */
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { handleAssessmentRequest } from '../_shared/assessment-http.ts';
import { listUserWorkspaceIds } from '../_shared/auth.ts';

Deno.serve(withApiLogging('finance-assessment', (req) =>
  handleAssessmentRequest(req, 'finance', async (supabase, userId, body) => {
    const ids = await listUserWorkspaceIds(supabase, userId);
    if (!ids || ids.length === 0) throw new HttpError(400, 'You are not a member of any workspace.');
    // A member of several workspaces may name which one; it still has to be one of theirs, and
    // `handleAssessmentRequest` re-checks membership before anything is derived.
    const asked = (body.subject_id || '').trim();
    const chosen = asked && ids.includes(asked) ? asked : ids[0];
    return { subjectId: chosen, workspaceId: chosen };
  })));
