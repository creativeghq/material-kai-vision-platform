import { supabase } from '@/integrations/supabase/client';
import { edgeError } from '@/utils/edgeError';
import type { MailOpens } from '@/pages/Inbox/components/OpenTracking';

export interface MailAccount {
  id: string; email: string; display_name: string | null; status: 'active' | 'needs_reauth'; last_error: string | null;
  workspace_id: string; is_shared: boolean; is_owner: boolean; picture_url: string | null;
}
export interface GmailThreadMeta {
  contact: { id: string; name: string | null; email: string | null; phone: string | null; position: string | null; companies: Array<{ id: string; name: string }> } | null;
  contact_linked: boolean; contact_suggested: boolean;
  assignee_user_id: string | null; snoozed_until: string | null;
  remind_at?: string | null; remind_note?: string | null; remind_if_no_reply?: boolean;
  shared: boolean; members: Array<{ user_id: string; name: string }>;
}
export interface GmailLabel { id: string; name: string; type: 'system' | 'user'; unread: number; total: number; color: string | null }
export interface GmailAddress { name: string | null; address: string | null; photo_url?: string | null }
export interface GmailThreadRow {
  id: string; subject: string; from: GmailAddress; participants: string[]; snippet: string; date: string | null;
  unread: boolean; starred: boolean; message_count: number; label_ids: string[]; has_attachment?: boolean;
  contact_id: string | null; contact_name: string | null; assignee_user_id: string | null; snoozed_until: string | null;
  remind_at?: string | null; remind_note?: string | null;
}
export interface GmailAttachment { attachmentId: string; filename: string; mimeType: string; size: number }
export interface GmailMessage {
  id: string; label_ids: string[]; date: string | null; from: GmailAddress; to: GmailAddress[]; cc: GmailAddress[]; reply_to: string | null;
  subject: string; message_id: string | null; text: string | null; html: string | null; attachments: GmailAttachment[]; snippet: string;
  opens?: MailOpens | null;
}
export type GmailSendInput = {
  account_id: string; to: string[]; cc?: string[]; bcc?: string[]; subject?: string; body: string;
  thread_id?: string; reply_to_message_id?: string;
  attachments?: Array<{ filename: string; content_type: string; data_base64: string }>;
  track_opens?: boolean;
};

async function call<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('gmail-api', { body: { action, ...payload } });
  if (error) throw await edgeError(error, `Gmail: ${action} failed`);
  if (data && typeof data === 'object' && 'error' in data && data.error) throw new Error(String(data.error));
  return data as T;
}

export const gmailApi = {
  status: (workspace_id: string) => call<{ configured: boolean; accounts: MailAccount[] }>('status', { workspace_id }),
  connect: (workspace_id: string, login_hint?: string) => call<{ auth_url: string }>('connect', { workspace_id, login_hint }),
  disconnect: (account_id: string) => call<{ ok: boolean }>('disconnect', { account_id }),
  labels: (account_id: string) => call<{ labels: GmailLabel[] }>('labels', { account_id }),
  threads: (input: { account_id: string; label_id?: string; q?: string; page_token?: string }) =>
    call<{ threads: GmailThreadRow[]; next_page_token: string | null; estimate: number | null }>('threads', input),
  thread: (account_id: string, thread_id: string, mark_read = true) =>
    call<{ id: string; account_email: string; messages: GmailMessage[] }>('thread', { account_id, thread_id, mark_read }),
  attachment: (account_id: string, message_id: string, attachment_id: string) =>
    call<{ data_base64: string; size: number | null }>('attachment', { account_id, message_id, attachment_id }),
  modify: (input: { account_id: string; thread_id: string; add?: string[]; remove?: string[]; trash?: boolean; untrash?: boolean }) =>
    call<{ ok: boolean; verified?: boolean; detail?: string }>('modify', input),
  snoozed: (account_id: string) =>
    call<{ threads: GmailThreadRow[]; next_page_token: null; estimate: number }>('snoozed', { account_id }),
  threadMeta: (account_id: string, thread_id: string, sender?: string | null) =>
    call<GmailThreadMeta>('thread_meta', { account_id, thread_id, sender }),
  linkContact: (input: { account_id: string; thread_id: string; contact_id: string | null; subject?: string; sender?: string }) =>
    call<{ ok: boolean }>('link_contact', input),
  createContact: (input: { account_id: string; thread_id: string; email: string; name?: string }) =>
    call<{ ok: boolean; contact_id: string; created: boolean }>('create_contact', input),
  snooze: (input: { account_id: string; thread_id: string; until: string | null; subject?: string }) =>
    call<{ ok: boolean; snoozed_until: string | null }>('snooze', input),
  remind: (input: { account_id: string; thread_id: string; at: string | null; note?: string; if_no_reply?: boolean; subject?: string }) =>
    call<{ ok: boolean; remind_at: string | null }>('remind', input),
  reminders: (account_id: string) =>
    call<{ threads: GmailThreadRow[]; next_page_token: null; estimate: number }>('reminders', { account_id }),
  assign: (account_id: string, thread_id: string, user_id: string | null) => call<{ ok: boolean }>('assign', { account_id, thread_id, user_id }),
  members: (account_id: string) => call<{ is_shared: boolean; member_ids: string[] }>('members', { account_id }),
  share: (account_id: string, is_shared: boolean, member_ids: string[]) =>
    call<{ ok: boolean; is_shared: boolean; member_ids: string[] }>('share', { account_id, is_shared, member_ids }),
  assist: (account_id: string, thread_id: string, mode: 'summary' | 'draft' | 'actions' | 'ask' | 'rewrite' | 'shorten' | 'formal', instruction?: string, text?: string) =>
    call<{ text: string; mode: string }>('assist', { account_id, thread_id, mode, instruction, text }),
  schedule: (input: GmailSendInput & { send_at: string }) =>
    call<{ ok: boolean; scheduled: { id: string; send_at: string } }>('schedule', input),
  send: (input: GmailSendInput) => call<{ ok: boolean; message_id: string; thread_id: string; tracked: boolean }>('send', input),
};
