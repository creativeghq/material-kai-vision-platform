// deno-lint-ignore-file no-explicit-any
/**
 * AI Assessment — REAL ESTATE subject. "Is this listing working, and what do I fix first?"
 *
 * Subject = one property, the direct analogue of one project.
 */
import { withApiLogging } from '../_shared/api-logger.ts';
import { handleAssessmentRequest } from '../_shared/assessment-http.ts';

Deno.serve(withApiLogging('real-estate-assessment', (req) =>
  handleAssessmentRequest(req, 'real_estate', async (supabase, _userId, body) => {
    const id = (body.property_id || body.subject_id || '').trim();
    if (!id) return null;
    const { data } = await supabase
      .from('properties').select('id, workspace_id').eq('id', id).maybeSingle();
    const ws = (data as any)?.workspace_id;
    return ws ? { subjectId: (data as any).id as string, workspaceId: ws as string } : null;
  })));
