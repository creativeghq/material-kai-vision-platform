/**
 * Project requests — threaded, status-tracked questions / change requests / approvals raised
 * against a project or one of its surfaces (WS7 #285).
 *
 * Notifications are NEVER sent from here. Both events are emitted through Flows
 * (`project_request_raised` / `project_request_answered`), each backed by a seeded active locked
 * default flow, so an admin can pause, retarget or extend delivery without a deploy — see
 * docs/flows-notification-system.md.
 */
import { supabase } from '@/integrations/supabase/client';
import { flowEventService } from '@/services/flows/flowEventService';

// The value-sets live in an import-free module so they can be tested without a Supabase client
// (this file constructs one at module load). Re-exported so existing imports keep working.
export {
  REQUEST_KINDS,
  REQUEST_STATUSES,
  REQUEST_CLOSED_STATUSES,
  REVIEW_DECISIONS,
  TEAM_FACING_KINDS,
  CLOSING_REVIEW_DECISIONS,
  isTeamFacing,
} from '../requestVocabulary';
export type {
  RequestTargetType, RequestKind, RequestStatus, ReviewDecision,
} from '../requestVocabulary';

import {
  isTeamFacing, CLOSING_REVIEW_DECISIONS, REQUEST_CLOSED_STATUSES,
  type RequestTargetType, type RequestKind, type RequestStatus, type ReviewDecision,
} from '../requestVocabulary';

export interface ProjectRequest {
  id: string;
  project_id: string;
  target_type: RequestTargetType;
  target_id: string | null;
  kind: RequestKind;
  title: string;
  body: string | null;
  status: RequestStatus;
  approval_decision: 'approved' | 'declined' | null;
  /** Register number — 'RFI-003'. Assigned by the DB for team-facing kinds, null for the rest. */
  reference: string | null;
  /** When the answer is needed. An RFI without one is just a question. */
  due_at: string | null;
  /** Submittals only, pinned there by `project_requests_review_only_on_submittal`. */
  review_decision: ReviewDecision | null;
  /** Submittal resubmissions. Rev 0 is the first issue. */
  revision: number;
  /**
   * The drawing REVISION this request is about, when it is about one.
   *
   * The revision rather than the document, so the question keeps meaning what it meant when it was
   * asked: pointing at the document would silently re-aim every open RFI at whatever was issued
   * since, and nobody would have edited a thing.
   */
  drawing_revision_id: string | null;
  /** Joined for display — which sheet, which issue, and whether it is still the current one. */
  drawing?: RequestDrawingCitation | null;
  assignee_id: string | null;
  client_visible: boolean;
  raised_by: string | null;
  raised_by_name: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

/**
 * What the register needs to SHOW about a cited drawing. `is_current` is the load-bearing one: an
 * RFI answered against a superseded sheet may have been answered about the wrong drawing, and that
 * is a fact worth putting on the screen rather than leaving the reader to cross-check the register.
 */
export interface RequestDrawingCitation {
  id: string;
  rev_label: string;
  is_current: boolean;
  drawing_number: string | null;
  title: string;
}

/** One candidate duplicate, as `find_similar_project_requests` derives it. */
export interface SimilarRequest {
  id: string;
  reference: string | null;
  kind: RequestKind;
  title: string;
  status: RequestStatus;
  created_at: string;
  resolved_at: string | null;
  /** Trigram similarity of the titles, 0–1. Ranking only — never a verdict. */
  score: number;
  /** True when both name the same SHEET (any issue of it), which is most of the evidence. */
  same_drawing: boolean;
  drawing_number: string | null;
  rev_label: string | null;
  /** The last reply on the hit. On a resolved one this IS the answer being asked for again. */
  last_answer: string | null;
}

export interface ProjectRequestMessage {
  id: string;
  request_id: string;
  author_id: string | null;
  author_name: string | null;
  body: string;
  is_from_client: boolean;
  created_at: string;
}

export interface ProjectRequestWithMessages extends ProjectRequest {
  messages: ProjectRequestMessage[];
}

export interface NewRequest {
  project_id: string;
  target_type?: RequestTargetType;
  target_id?: string | null;
  kind?: RequestKind;
  title: string;
  body?: string | null;
  client_visible?: boolean;
  assignee_id?: string | null;
  due_at?: string | null;
  drawing_revision_id?: string | null;
}

/**
 * The workspace a project belongs to. `project_requests` stores only `project_id`, and an event
 * without a workspace_id is invisible to `workspace_flow_preferences` — flow-engine reads the
 * overlay only inside `if (workspaceId && …)`, so the tenant's off switch silently does nothing
 * and a workspace-owned automation on this trigger can never match. Best-effort by design: losing
 * the lookup must never cost the reply the user just posted.
 */
async function projectWorkspaceId(projectId: string | null | undefined): Promise<string | null> {
  if (!projectId) return null;
  try {
    const { data } = await (supabase as any)
      .from('projects').select('workspace_id').eq('id', projectId).single();
    return (data as { workspace_id?: string } | null)?.workspace_id ?? null;
  } catch {
    return null;
  }
}

export const projectRequestsService = {
  async list(projectId: string): Promise<ProjectRequestWithMessages[]> {
    const { data, error } = await (supabase as any)
      .from('project_requests')
      // The cited sheet comes back with the row rather than as a second read: the register renders
      // "A-201 rev C" beside the question, and a per-row lookup would make that N+1 requests for a
      // string that is already one join away.
      .select(
        '*, messages:project_request_messages(*), '
        + 'drawing:project_document_revisions(id, rev_label, is_current, document:project_documents(drawing_number, title))',
      )
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return ((data || []) as any[]).map((r) => ({
      ...r,
      drawing: r.drawing
        ? {
            id: r.drawing.id,
            rev_label: r.drawing.rev_label,
            is_current: r.drawing.is_current,
            drawing_number: r.drawing.document?.drawing_number ?? null,
            title: r.drawing.document?.title ?? '',
          }
        : null,
      messages: ((r.messages || []) as ProjectRequestMessage[])
        .slice()
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    })) as ProjectRequestWithMessages[];
  },

  async create(input: NewRequest): Promise<ProjectRequest> {
    const { data: { user } } = await supabase.auth.getUser();
    const raiserName = user?.user_metadata?.full_name || user?.email || null;

    const { data, error } = await (supabase as any)
      .from('project_requests')
      .insert({
        project_id: input.project_id,
        target_type: input.target_type ?? 'project',
        target_id: input.target_id ?? null,
        kind: input.kind ?? 'question',
        title: input.title,
        body: input.body ?? null,
        // Team-facing kinds default to INTERNAL. An RFI is a question to the architect about a
        // problem in their information; defaulting it visible would publish the project's open
        // problems to the customer, which is what `client_visible ?? true` would have done.
        client_visible: input.client_visible ?? !isTeamFacing(input.kind ?? 'question'),
        assignee_id: input.assignee_id ?? null,
        due_at: input.due_at ?? null,
        drawing_revision_id: input.drawing_revision_id ?? null,
        // `reference` is deliberately absent: the DB assigns it inside the same statement, so
        // there is no create-then-number pair a retry could run twice.
        raised_by: user?.id ?? null,
        raised_by_name: raiserName,
      })
      .select()
      .single();
    if (error) throw error;
    const row = data as ProjectRequest;

    // Notify the project owner. Resolved here because the flow needs a concrete recipient.
    const { data: project } = await (supabase as any)
      .from('projects').select('user_id, name, workspace_id').eq('id', input.project_id).single();

    flowEventService.emit('project_request_raised', {
      user_id: project?.user_id ?? null,
      workspace_id: project?.workspace_id ?? null,
      title: `New request on ${project?.name || 'a project'}`,
      body: `${raiserName || 'Someone'}: ${row.title}`,
      type: 'project_request',
      action_url: `/projects/${input.project_id}?tab=requests&request=${row.id}`,
      request_id: row.id,
      project_id: input.project_id,
      project_name: project?.name ?? null,
      kind: row.kind,
      raised_by_name: raiserName,
    });

    return row;
  },

  async addMessage(request: ProjectRequest, body: string, isFromClient: boolean): Promise<ProjectRequestMessage> {
    const { data: { user } } = await supabase.auth.getUser();
    const authorName = user?.user_metadata?.full_name || user?.email || null;
    const { data, error } = await (supabase as any)
      .from('project_request_messages')
      .insert({
        request_id: request.id,
        author_id: user?.id ?? null,
        author_name: authorName,
        body,
        is_from_client: isFromClient,
      })
      .select()
      .single();
    if (error) throw error;

    // A reply from the team is the "answered" event; a client's own reply is not.
    if (!isFromClient && request.raised_by && request.raised_by !== user?.id) {
      flowEventService.emit('project_request_answered', {
        user_id: request.raised_by,
        workspace_id: await projectWorkspaceId(request.project_id),
        title: 'Your request has a reply',
        body: `${authorName || 'The team'}: ${body.slice(0, 160)}`,
        type: 'project_request',
        action_url: `/projects/${request.project_id}?tab=requests&request=${request.id}`,
        request_id: request.id,
        project_id: request.project_id,
      });
    }

    return data as ProjectRequestMessage;
  },

  async setStatus(request: ProjectRequest, status: RequestStatus): Promise<void> {
    const { error } = await (supabase as any)
      .from('project_requests').update({ status }).eq('id', request.id);
    if (error) throw error;

    if (REQUEST_CLOSED_STATUSES.includes(status) && request.raised_by) {
      flowEventService.emit('project_request_answered', {
        user_id: request.raised_by,
        workspace_id: await projectWorkspaceId(request.project_id),
        title: status === 'resolved' ? 'Your request was resolved' : 'Your request was closed',
        body: request.title,
        type: 'project_request',
        action_url: `/projects/${request.project_id}?tab=requests&request=${request.id}`,
        request_id: request.id,
        project_id: request.project_id,
      });
    }
  },

  /**
   * Record the decision on an approval request. The DB refuses a decision on any other kind, so
   * "approved" can never end up on a plain question.
   */
  async setApproval(request: ProjectRequest, decision: 'approved' | 'declined'): Promise<void> {
    const { error } = await (supabase as any)
      .from('project_requests')
      .update({ approval_decision: decision, status: 'resolved' })
      .eq('id', request.id);
    if (error) throw error;

    if (request.raised_by) {
      flowEventService.emit('project_request_answered', {
        user_id: request.raised_by,
        title: decision === 'approved' ? 'Your approval request was approved' : 'Your approval request was declined',
        body: request.title,
        type: 'project_request',
        action_url: `/projects/${request.project_id}?tab=requests&request=${request.id}`,
        request_id: request.id,
        project_id: request.project_id,
      });
    }
  },

  /**
   * Record a submittal's verdict, and move the status with it in ONE write.
   *
   * The two belong together: `project_requests_submittal_resolved_needs_decision` refuses a
   * resolved submittal with no verdict, so setting them separately means a first write that the
   * database rejects or a window where the register shows a closed submittal nobody decided.
   *
   * `revise_and_resubmit` is NOT a closing verdict — it reopens and bumps the revision, because
   * the whole point of tracking submittals is knowing which ones are still going round.
   */
  async setReviewDecision(request: ProjectRequest, decision: ReviewDecision): Promise<void> {
    if (request.kind !== 'submittal') {
      throw new Error('Only a submittal carries a review decision.');
    }
    const closing = CLOSING_REVIEW_DECISIONS.includes(decision);
    const { error } = await (supabase as any)
      .from('project_requests')
      .update({
        review_decision: decision,
        status: closing ? 'resolved' : 'open',
        revision: closing ? request.revision : request.revision + 1,
      })
      .eq('id', request.id);
    if (error) throw error;
  },

  /**
   * Requests on this project that look like the same question.
   *
   * ADVISORY, always. It returns candidates for a person to judge and never blocks the write —
   * a check that refused would eventually suppress a real question on a Friday afternoon, and an
   * unasked RFI costs far more than a duplicate one. The ranking rule lives in SQL so the offer
   * and any later report cannot disagree about what "similar" means.
   *
   * Failing this lookup must never cost the request: a duplicate check that throws would stop
   * somebody raising a question, which is the exact outcome it exists to avoid.
   */
  async findSimilar(
    projectId: string,
    title: string,
    drawingRevisionId?: string | null,
    excludeId?: string | null,
  ): Promise<SimilarRequest[]> {
    if (!title.trim()) return [];
    try {
      const { data, error } = await (supabase as any).rpc('find_similar_project_requests', {
        p_project_id: projectId,
        p_title: title.trim(),
        p_drawing_revision_id: drawingRevisionId ?? null,
        p_exclude_id: excludeId ?? null,
      });
      if (error) throw error;
      return (data || []) as SimilarRequest[];
    } catch {
      return [];
    }
  },

  /** Point an existing request at a drawing revision, or clear the citation with null. */
  async setDrawingRevision(requestId: string, revisionId: string | null): Promise<void> {
    const { error } = await (supabase as any)
      .from('project_requests').update({ drawing_revision_id: revisionId }).eq('id', requestId);
    if (error) throw error;
  },

  /** The date an answer is needed by. Cleared with null. */
  async setDueAt(requestId: string, dueAt: string | null): Promise<void> {
    const { error } = await (supabase as any)
      .from('project_requests').update({ due_at: dueAt || null }).eq('id', requestId);
    if (error) throw error;
  },

  async setAssignee(requestId: string, assigneeId: string | null): Promise<void> {
    const { error } = await (supabase as any)
      .from('project_requests').update({ assignee_id: assigneeId }).eq('id', requestId);
    if (error) throw error;
  },

  async remove(id: string): Promise<void> {
    const { error } = await (supabase as any).from('project_requests').delete().eq('id', id);
    if (error) throw error;
  },
};
