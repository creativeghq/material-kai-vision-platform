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

export type RequestTargetType = 'project' | 'moodboard' | 'client_view' | 'room' | 'sheet' | 'product';
export type RequestKind = 'question' | 'change_request' | 'approval_request' | 'info_request';
export type RequestStatus = 'open' | 'answered' | 'resolved' | 'wont_do';

export const REQUEST_KINDS: RequestKind[] = ['question', 'change_request', 'approval_request', 'info_request'];
export const REQUEST_STATUSES: RequestStatus[] = ['open', 'answered', 'resolved', 'wont_do'];

/** Statuses that mean the request no longer needs a reply. Mirrors the SQL trigger. */
export const REQUEST_CLOSED_STATUSES: RequestStatus[] = ['resolved', 'wont_do'];

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
  assignee_id: string | null;
  client_visible: boolean;
  raised_by: string | null;
  raised_by_name: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
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
}

export const projectRequestsService = {
  async list(projectId: string): Promise<ProjectRequestWithMessages[]> {
    const { data, error } = await (supabase as any)
      .from('project_requests')
      .select('*, messages:project_request_messages(*)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return ((data || []) as any[]).map((r) => ({
      ...r,
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
        client_visible: input.client_visible ?? true,
        assignee_id: input.assignee_id ?? null,
        raised_by: user?.id ?? null,
        raised_by_name: raiserName,
      })
      .select()
      .single();
    if (error) throw error;
    const row = data as ProjectRequest;

    // Notify the project owner. Resolved here because the flow needs a concrete recipient.
    const { data: project } = await (supabase as any)
      .from('projects').select('user_id, name').eq('id', input.project_id).single();

    flowEventService.emit('project_request_raised', {
      user_id: project?.user_id ?? null,
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
