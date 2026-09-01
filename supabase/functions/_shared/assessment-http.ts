// deno-lint-ignore-file no-explicit-any
/**
 * The HTTP door every AI Assessment function stands behind.
 *
 * There are three functions rather than one because each is sold as its own module and each
 * resolves its subject differently — a project id from the body, the workspace from the session,
 * a property id from the body. Everything AFTER that is identical, so it lives here: the JWT, the
 * tenancy binding, the entitlement gate, the preview/run split, and the 402 mapping.
 *
 * Kept out of `_shared/assessment.ts` on purpose: that module is imported by the agent toolkit
 * inside `agent-chat`, and it should not drag the auth and api-logger graph in with it.
 */
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from './cors.ts';
import { authenticate, getUserId, userCanAccessWorkspace } from './auth.ts';
import { HttpError } from './api-logger.ts';
import { assertEntitled } from './entitlement.ts';
import {
  ASSESSMENT_SUBJECT_MODULE,
  previewAssessment,
  runAssessment,
  type AssessmentSubject,
} from './assessment.ts';

export interface AssessmentRequestBody {
  project_id?: string;
  property_id?: string;
  subject_id?: string;
  /**
   * The OPERATOR's calendar day. `current_date` in Postgres is the UTC day, and between local
   * midnight and 03:00 in Greece that is YESTERDAY — on a derivation that decides what is
   * overdue (CLAUDE.md rule 1b). The RPC bounds it to +/-2 days.
   */
  today?: string;
  mode?: 'preview' | 'run';
}

/**
 * @param resolveSubject given the verified user and the parsed body, return the subject id and
 *   the workspace that owns it, or null when there is no such subject FOR THIS CALLER. Returning
 *   null becomes a 404 — never a 403, which would confirm the id exists.
 */
export async function handleAssessmentRequest(
  req: Request,
  subjectType: AssessmentSubject,
  resolveSubject: (
    supabase: any,
    userId: string,
    body: AssessmentRequestBody,
  ) => Promise<{ subjectId: string; workspaceId: string } | null>,
): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');

  let body: AssessmentRequestBody;
  try { body = (await req.json()) as AssessmentRequestBody; } catch { throw new HttpError(400, 'Invalid JSON body'); }

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

  const subject = await resolveSubject(supabase, userId, body);
  if (!subject) throw new HttpError(404, 'Not found');

  // Tenancy binding (invariant 1). The client above is service-role, so this check is MANDATORY
  // rather than a formality — the subject id arrives in the request body.
  if (!(await userCanAccessWorkspace(supabase, userId, subject.workspaceId))) {
    throw new HttpError(404, 'Not found');
  }

  // Module entitlement at the API boundary — the page guard is UX, this is the line.
  const ent = await assertEntitled(supabase, subject.workspaceId, ASSESSMENT_SUBJECT_MODULE[subjectType]);
  if (!ent.ok) return ent.response;

  const json = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

  if (mode === 'preview') {
    return json({
      ok: true,
      mode: 'preview',
      subject_type: subjectType,
      subject_id: subject.subjectId,
      snapshot: await previewAssessment(supabase, subjectType, subject.subjectId, today),
    });
  }

  try {
    const result = await runAssessment(supabase, {
      subjectType,
      subjectId: subject.subjectId,
      workspaceId: subject.workspaceId,
      userId,
      today,
    });
    return json({ mode: 'run', ...result });
  } catch (err) {
    // A refused wallet is a 402 the frontend routes to a top-up, not a 500 that reads as a bug.
    // The shared body has already refunded the ceiling and named the failure on the row.
    if ((err as { code?: string })?.code === 'insufficient_credits') {
      throw new HttpError(402, err instanceof Error ? err.message : 'Not enough credits');
    }
    throw err;
  }
}
