import { supabase } from '@/integrations/supabase/client';

/**
 * Multi-Tenant Inbox client. Thin wrapper over the single `inbox-api` edge function
 * (action-discriminated). JWT actions use the caller's session; token actions (the public
 * customer thread) send the anon key — the function's token branch is service-role and
 * short-circuits before JWT auth.
 *
 * Directional ACL lives server-side in inbox-api; this client just shapes calls. Reads for
 * realtime go directly against the inbox_* tables (RLS gates them to active participants).
 */

export type InboxThreadType = 'internal' | 'customer' | 'upstream';
/** `email` is inbound via Cloudflare Email Routing → `email-webhooks` (#342); outbound stays Resend. */
export type InboxChannel = 'internal' | 'whatsapp' | 'email' | 'social';
export type InboxThreadStatus = 'open' | 'snoozed' | 'closed';
export type InboxMessageType = 'text' | 'system' | 'agent' | 'note';
export type InboxParticipantType = 'member' | 'customer' | 'agent';

/** A workspace-scoped conversation label (colored chip). `color` is a palette key (see LABEL_COLORS). */
export interface InboxLabel {
  id: string;
  name: string;
  color: string;
  created_at?: string;
}

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
  archived_at?: string | null;
  /** Denormalized snippet of the latest visible message (for mailbox list rows). */
  last_message_preview?: string | null;
  unread?: boolean;
  /** Labels assigned to this thread (returned by list_threads). */
  labels?: InboxLabel[];
  /**
   * Human assignees — active `member` participants, resolved to names by list_threads.
   * Assignment is a participant row rather than a column on the thread, so this is the only
   * place the mailbox list learns who owns a conversation.
   */
  assignees?: InboxThreadAssignee[];
}

export interface InboxThreadAssignee {
  user_id: string;
  name: string;
  thread_role: string;
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

/**
 * A user's inbound email address (#342). One per user on the shared receiving domain — mail sent
 * to it lands in `workspace_id`'s Inbox as a `channel='email'` thread.
 */
export interface UserEmailAddress {
  id: string;
  full_address: string;
  workspace_id: string;
  /** Let the assistant answer on this address without a member's involvement. */
  auto_reply_enabled: boolean;
  agent_ref: string | null;
  is_active: boolean;
}

// ── Order intake (#342) ──
// A PROPOSAL read out of a customer conversation. It lives on the thread's metadata and nothing
// exists in `orders` until a member approves it.

export type IntakeMatchMethod = 'mivaa' | 'ilike' | 'visual' | 'manual' | 'none';

export interface IntakeItem {
  line_no: number;
  /** The customer's own words, kept so a reviewer can check the reading against the source. */
  raw_text: string;
  product_id: string | null;
  match_method: IntakeMatchMethod;
  match_confidence: number | null;
  candidates?: Array<{ product_id: string; name: string; score: number | null }>;
  description: string;
  quantity: number;
  /** Ex-VAT. Null = nothing could price it; a flagged gap, never a guess. */
  unit_price: number | null;
  unit_cost: number | null;
  measurement_unit_code: string | null;
  vat_percent: number | null;
  unit_price_source: 'resolver' | 'manual';
  needs_review: boolean;
}

export interface IntakeConfirmation {
  channel: 'whatsapp' | 'whatsapp_template' | 'email' | 'none';
  status: 'sent' | 'failed' | 'unavailable';
  at: string;
  detail?: string | null;
}

export interface OrderIntake {
  status: 'pending_review' | 'approved' | 'rejected';
  channel: string;
  source_message_id: string | null;
  customer_contact_id: string | null;
  customer_company_id: string | null;
  currency: string;
  confidence: number | null;
  requested_delivery_date: string | null;
  notes: string | null;
  order_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  confirmation?: IntakeConfirmation | null;
  items: IntakeItem[];
  created_at: string;
  updated_at: string;
}

/** Sum of the lines, for DISPLAY only — `recompute_order_totals` is the authoritative total. */
export interface IntakeTotals { net: number; priced: number; unpriced: number }

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
  /** Start a conversation with a customer (CRM contact). Returns a share link when they have no account. */
  createCustomerThread(input: { workspace_id: string; contact_id: string; subject?: string; message?: string }) {
    return call<{ thread_id: string; share_url: string | null; has_account: boolean }>('create_customer_thread', input);
  },
  /** Get-or-create the public /i/:token link for an existing customer thread. */
  createShareLink(thread_id: string) {
    return call<{ url: string }>('create_share_link', { thread_id });
  },
  listThreads(filters: {
    channel?: InboxChannel; thread_type?: InboxThreadType; status?: InboxThreadStatus;
    scope?: 'all'; archived?: boolean; label_id?: string;
  } = {}) {
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
  setAgent(thread_id: string, agent_state: 'off' | 'active', agent_id?: string) {
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

  // ── Labels (owner/admin manage; any member assigns) ──
  listLabels(workspace_id: string) {
    return call<{ labels: InboxLabel[] }>('list_labels', { workspace_id });
  },
  createLabel(workspace_id: string, name: string, color: string) {
    return call<{ label: InboxLabel }>('create_label', { workspace_id, name, color });
  },
  updateLabel(label_id: string, changes: { name?: string; color?: string }) {
    return call<{ label: InboxLabel }>('update_label', { label_id, ...changes });
  },
  deleteLabel(label_id: string) {
    return call<{ ok: boolean }>('delete_label', { label_id });
  },
  setThreadLabels(thread_id: string, label_ids: string[]) {
    return call<{ ok: boolean; label_ids: string[] }>('set_thread_labels', { thread_id, label_ids });
  },

  // ── Archive (soft-delete → 30-day restore window → purge) ──
  archiveThread(thread_id: string) {
    return call<{ ok: boolean }>('archive_thread', { thread_id });
  },
  restoreThread(thread_id: string) {
    return call<{ ok: boolean }>('restore_thread', { thread_id });
  },

  // ── AI "help me write" — a draft reply for a member to review/edit/send ──
  suggestReply(thread_id: string) {
    return call<{ draft: string }>('suggest_reply', { thread_id });
  },

  // ── Inbound email address (#342) — one per user, on the shared receiving domain ──

  /**
   * This user's inbound address, allocating one on first read. There is no "create it" step —
   * a member who opens the Inbox can receive mail immediately. `local_part` is only needed on the
   * rare second call, when the derived handle turned out to belong to someone else.
   */
  getMyEmailAddress(workspace_id: string, local_part?: string) {
    return call<{
      address: UserEmailAddress | null;
      domain: string;
      can_allocate: boolean;
      /** Set when nothing was allocated and the user has to choose — not an error. */
      conflict?: 'taken' | 'invalid';
      /** The handle we derived and could not have, so the UI can prefill something close to it. */
      suggested_local_part?: string;
      invalid_reason?: 'empty' | 'shape' | 'plus' | 'reserved';
    }>('get_my_email_address', { workspace_id, local_part });
  },
  setEmailAddressSettings(changes: {
    auto_reply_enabled?: boolean;
    is_active?: boolean;
    agent_ref?: string | null;
    workspace_id?: string;
  }) {
    return call<{ address: UserEmailAddress }>('set_email_address_settings', changes);
  },

  // ── Order intake (#342) — members only; the workspace comes from the thread, never the body ──

  /** The proposal on a thread, its display total, and whether this member may approve it. */
  getThreadIntake(thread_id: string) {
    return call<{ intake: OrderIntake | null; totals: IntakeTotals | null; can_approve: boolean }>(
      'get_thread_intake', { thread_id },
    );
  },
  /** Assign the customer / currency / notes. Changing the party re-resolves every line's price. */
  updateIntake(thread_id: string, changes: {
    customer_contact_id?: string | null;
    customer_company_id?: string | null;
    currency?: string;
    notes?: string | null;
    requested_delivery_date?: string | null;
  }) {
    return call<{ intake: OrderIntake; totals: IntakeTotals }>('update_intake', { thread_id, ...changes });
  },
  /** Replace the lines wholesale — fix one, drop one, add one. */
  updateIntakeItems(thread_id: string, items: Array<Partial<IntakeItem>>) {
    return call<{ intake: OrderIntake; totals: IntakeTotals }>('update_intake_items', { thread_id, items });
  },
  /** Catalog search for repointing a line (same MIVAA → ilike ladder the extraction uses). */
  searchIntakeProducts(thread_id: string, query: string) {
    return call<{ candidates: Array<{ product_id: string; name: string; score: number | null }> }>(
      'search_intake_products', { thread_id, query },
    );
  },
  /**
   * Approve → a DRAFT sales order ("Pre-order"). Idempotent: a second call returns the same order.
   * `confirmation` reports whether the customer was actually told (#342 §4a) — approval never
   * rolls back because a message failed, so the caller must surface this rather than assume.
   */
  approveIntake(thread_id: string) {
    return call<{
      order_id: string;
      order_number: string | null;
      confirmation: IntakeConfirmation;
      intake: OrderIntake | null;
    }>('approve_intake', { thread_id });
  },
  rejectIntake(thread_id: string, reason?: string) {
    return call<{ intake: OrderIntake }>('reject_intake', { thread_id, reason });
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

/**
 * Label color palette — the single source of truth shared by the chip renderer and the label
 * editor. `key` is what's stored in `inbox_labels.color`; `chip` is the Tailwind class set for a
 * pill (works in both themes); `dot` tints the small swatch in the picker.
 */
export const LABEL_COLORS: Array<{ key: string; label: string; chip: string; dot: string }> = [
  { key: 'slate',   label: 'Slate',   chip: 'bg-slate-500/15 text-slate-300 border-slate-500/30',       dot: 'bg-slate-400' },
  { key: 'rose',    label: 'Rose',    chip: 'bg-rose-500/15 text-rose-300 border-rose-500/30',          dot: 'bg-rose-400' },
  { key: 'amber',   label: 'Amber',   chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30',       dot: 'bg-amber-400' },
  { key: 'emerald', label: 'Emerald', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', dot: 'bg-emerald-400' },
  { key: 'sky',     label: 'Sky',     chip: 'bg-sky-500/15 text-sky-300 border-sky-500/30',             dot: 'bg-sky-400' },
  { key: 'violet',  label: 'Violet',  chip: 'bg-violet-500/15 text-violet-300 border-violet-500/30',    dot: 'bg-violet-400' },
  { key: 'cyan',    label: 'Cyan',    chip: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',          dot: 'bg-cyan-400' },
  { key: 'teal',    label: 'Teal',    chip: 'bg-teal-500/15 text-teal-300 border-teal-500/30',          dot: 'bg-teal-400' },
];

export function labelChipClass(color: string | null | undefined): string {
  return (LABEL_COLORS.find((c) => c.key === color) || LABEL_COLORS[0]).chip;
}

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
