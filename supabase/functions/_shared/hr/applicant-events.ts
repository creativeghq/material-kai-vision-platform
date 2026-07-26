// Shared applicant-stage Flow emitter — used by BOTH the admin path (hr-api/expansion.ts) and the
// PUBLIC careers apply path (hr-careers). Extracted so a real inbound application through the
// public page fires the same owner/admin notification + `hr.applicant_stage_changed` automation an
// admin-created one does (they had drifted: the public path emitted nothing).
import { emitFlowEventToWorkspaceRoles } from '../flow-events.ts';

export async function emitApplicantStage(
  supabase: any,
  workspaceId: string,
  applicationId: string,
  fromStage: string | null,
  toStage: string,
): Promise<void> {
  try {
    const { data: a } = await supabase.from('hr_applications')
      .select('candidate:hr_candidates!hr_applications_candidate_id_fkey ( id, name, email ), posting:hr_job_postings!hr_applications_job_posting_id_fkey ( id, title )')
      .eq('id', applicationId).maybeSingle();
    const cand = (a as any)?.candidate, post = (a as any)?.posting;
    await emitFlowEventToWorkspaceRoles(workspaceId, ['owner', 'admin'], 'hr.applicant_stage_changed',
      (recipientUserId: string) => ({
        user_id: recipientUserId,
        workspace_id: workspaceId, application_id: applicationId, from_stage: fromStage, to_stage: toStage,
        candidate_id: cand?.id ?? null, candidate_name: cand?.name ?? null, candidate_email: cand?.email ?? null,
        job_posting_id: post?.id ?? null, job_title: post?.title ?? null,
        title: `Applicant: ${cand?.name ?? 'candidate'} → ${toStage}`,
        body: `${cand?.name ?? 'A candidate'} moved to "${toStage}"${post?.title ? ` for ${post.title}` : ''}.`,
        action_url: '/hr?tab=recruitment', type: 'hr.applicant_stage_changed',
      }));
  } catch { /* flow emit is best-effort — never block the stage change */ }
}
