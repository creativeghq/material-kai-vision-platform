import { supabase } from '@/integrations/supabase/client';

/**
 * #209 — Multi-Tenant Inbox client. Thin wrapper over the single `inbox-api` edge function
 * (action-discriminated). JWT actions use the caller's session; token actions (the public
 * customer thread) send the anon key — the function's token branch is service-role and
 * short-circuits before JWT auth.
 *
 * Directional ACL lives server-side in inbox-api; this client just shapes calls. Reads for
 * realtime go directly against the inbox_* tables (RLS gates them to active participants).
 */

export type InboxThreadType = 'internal' | 'customer' | 'upstream';
export type InboxChannel = 'internal' | 'whatsapp';
export type InboxThreadStatus = 'open' | 'snoozed' | 'closed';
export type InboxMessageType = 'text' | 'system' | 'agent' | 'note';
export type InboxParticipantType = 'member' | 'customer' | 'agent';

export interface InboxThread {
  id: string;
  workspace_id: string;
  thread_type: InboxThreadType;
  channel: InboxChannel;
  subject: string | null;
  status: InboxThreadStatus;
  created_by: string | null;
  last_message_at: string;
  metadata: Record<string, unknown>;
  agent_id: string | null;
  agent_state: string;
  created_at: string;
  unread?: boolean;
}

export interface InboxParticipant {
  id: string;
  thread_id: string;
  participant_type: InboxParticipantType;
  user_id: string | null;
  contact_id: string | null;
  agent_id: string | null;
  workspace_id: string | null;
  thread_role: 'owner' | 'agent' | 'participant';
  status: 'active' | 'left' | 'removed';
  last_read_at: string | null;
}

export interface InboxAttachment {
  storage_bucket?: string;
  storage_object_path?: string;
  // Channel attachments (e.g. WhatsApp/Zernio) arrive as an external URL with no storage path.
  url?: string;
  name?: string;
  content_type?: string;
  size?: number;
}

export interface InboxMessage {
  id: string;
  thread_id: string;
  sender_participant_id: string | null;
  body: string | null;
  attachments: InboxAttachment[];
  message_type: InboxMessageType;
  metadata: Record<string, unknown>;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}

export interface WhatsAppWindow {
  open: boolean;
  last_inbound_at: string | null;
  expires_at: string | null;
}

export interface InboxContactContext {
  id: string;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  company: string | null;
  position: string | null;
  country: string | null;
  country_code: string | null;
  city: string | null;
  lead_source: string | null;
  lead_status: string | null;
  is_client: boolean | null;
  vat_number: string | null;
  tags: string[] | null;
  user_id: string | null;
  created_at: string;
}

export interface InboxCompanyContext {
  id: string;
  name: string | null;
  website: string | null;
  city: string | null;
  country: string | null;
  vat_number: string | null;
  industry: string | null;
}

export interface InboxQuoteRef {
  id: string;
  quote_number: string | null;
  name: string | null;
  status: string | null;
  grand_total: number | null;
  currency: string | null;
  created_at: string;
}

export interface InboxProjectRef {
  id: string;
  name: string | null;
  status: string | null;
  budget_amount: number | null;
  budget_currency: string | null;
  created_at: string;
}

export interface InboxInvoiceRef {
  id: string;
  number: string | null;
  amount_due: number;
  currency: string | null;
  status: string | null;
  due_at: string | null;
}

/** Rolled-up finance figures for the customer on the thread (from `invoices`). */
export interface InboxCustomerMetrics {
  currency: string;
  lifetime_value: number;
  open_balance: number;
  invoice_count: number;
  open_count: number;
}

export interface InboxThreadContext {
  contact: InboxContactContext | null;
  company: InboxCompanyContext | null;
  quotes: InboxQuoteRef[];
  projects: InboxProjectRef[];
  /** Open invoices for the customer (amount_due > 0). Absent on older API responses. */
  invoices?: InboxInvoiceRef[];
  /** Lifetime value + open balance. Absent on older API responses / internal threads. */
  metrics?: InboxCustomerMetrics | null;
}

/** Per-workspace AI-assistant config (workspaces.settings.inbox_agent). Both default true server-side. */
export interface InboxAgentSettings {
  /** Auto-engage the assistant so it first-responds on new customer threads. */
  auto_respond: boolean;
  /** Allow the assistant to answer the customer's own account/billing questions (statement, invoices). */
  allow_account_data: boolean;
}

export interface NewParticipantInput {
  type: InboxParticipantType;
  user_id?: string;
  contact_id?: string;
  agent_id?: string;
}

/** A base64 attachment to upload, or an already-stored reference to pass through. */
export type AttachmentInput =
  | { filename: string; content_type: string; data_base64: string }
  | InboxAttachment;

async function call<T = unknown>(action: string, payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('inbox-api', {
    body: { action, ...payload },
  });
  if (error) {
    // Surface the server-side message when present (HttpError shape: { error }).
    const ctx = (error as { context?: { error?: string } }).context;
    throw new Error(ctx?.error || error.message || 'Inbox request failed');
  }
  if (data && (data as { error?: string }).error) throw new Error((data as { error: string }).error);
  return data as T;
}

export const inboxApi = {
  // ── JWT actions ──
  createThread(input: {
    thread_type: InboxThreadType;
    workspace_id: string;
    channel?: InboxChannel;
    subject?: string;
    participants?: NewParticipantInput[];
    metadata?: Record<string, unknown>;
  }) {
    return call<{ thread: InboxThread }>('create_thread', input);
  },
  listThreads(filters: { channel?: InboxChannel; thread_type?: InboxThreadType; status?: InboxThreadStatus; scope?: 'all' } = {}) {
    return call<{ threads: InboxThread[] }>('list_threads', filters);
  },
  getThread(thread_id: string) {
    return call<{
      thread: InboxThread;
      participants: InboxParticipant[];
      messages: InboxMessage[];
      whatsapp_window: WhatsAppWindow | null;
    }>('get_thread', { thread_id });
  },
  sendMessage(input: { thread_id: string; body?: string; attachments?: AttachmentInput[]; message_type?: 'text' | 'note' }) {
    return call<{ message: InboxMessage }>('send_message', input);
  },
  getThreadContext(thread_id: string) {
    return call<InboxThreadContext>('get_thread_context', { thread_id });
  },
  addParticipant(input: { thread_id: string } & NewParticipantInput) {
    return call<{ participant: InboxParticipant }>('add_participant', input as unknown as Record<string, unknown>);
  },
  removeParticipant(thread_id: string, participant_id: string) {
    return call<{ ok: boolean }>('remove_participant', { thread_id, participant_id });
  },
  markRead(thread_id: string) {
    return call<{ ok: boolean }>('mark_read', { thread_id });
  },
  setStatus(thread_id: string, status: InboxThreadStatus) {
    return call<{ ok: boolean }>('set_status', { thread_id, status });
  },
  setAgent(thread_id: string, agent_state: 'off' | 'suggesting' | 'active', agent_id?: string) {
    return call<{ ok: boolean; agent_state: string }>('set_agent', { thread_id, agent_state, agent_id });
  },
  getAgentSettings(workspace_id: string) {
    return call<{ settings: InboxAgentSettings; can_edit: boolean; reply_cost: number }>(
      'get_agent_settings', { workspace_id },
    );
  },
  setAgentSettings(workspace_id: string, changes: Partial<InboxAgentSettings>) {
    return call<{ settings: InboxAgentSettings }>('set_agent_settings', { workspace_id, ...changes });
  },

  // ── Token actions (public customer thread) ──
  tokenGetThread(token: string) {
    return call<{
      thread: { id: string; subject: string | null; status: InboxThreadStatus; channel: InboxChannel };
      messages: InboxMessage[];
      participants: Pick<InboxParticipant, 'id' | 'participant_type' | 'thread_role'>[];
      claimed: boolean;
    }>('token_get_thread', { token });
  },
  tokenSendMessage(input: { token: string; body?: string; attachments?: AttachmentInput[] }) {
    return call<{ message: { id: string; created_at: string } }>('token_send_message', input);
  },
  tokenClaim(token: string, user_id: string) {
    return call<{ ok: boolean; thread_id: string }>('token_claim', { token, user_id });
  },
};

/** Resolve a viewable URL for an attachment: signed private-storage URL, or external channel URL. */
export async function signInboxAttachment(att: InboxAttachment): Promise<string | null> {
  if (att.storage_bucket && att.storage_object_path) {
    const { data } = await supabase.storage
      .from(att.storage_bucket)
      .createSignedUrl(att.storage_object_path, 3600);
    if (data?.signedUrl) return data.signedUrl;
  }
  return att.url ?? null;
}
