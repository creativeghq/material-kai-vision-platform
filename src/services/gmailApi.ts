import { supabase } from '@/integrations/supabase/client';
import { edgeError } from '@/utils/edgeError';

export interface MailAccount { id: string; email: string; display_name: string | null; status: 'active' | 'needs_reauth'; last_error: string | null; workspace_id: string }
export interface GmailLabel { id: string; name: string; type: 'system' | 'user'; unread: number; total: number; color: string | null }
export interface GmailAddress { name: string | null; address: string | null }
export interface GmailThreadRow {
  id: string; subject: string; from: GmailAddress; participants: string[]; snippet: string; date: string | null;
  unread: boolean; starred: boolean; message_count: number; label_ids: string[];
}
export interface GmailAttachment { attachmentId: string; filename: string; mimeType: string; size: number }
export interface GmailMessage {
  id: string; label_ids: string[]; date: string | null; from: GmailAddress; to: string[]; cc: string[]; reply_to: string | null;
  subject: string; message_id: string | null; text: string | null; html: string | null; attachments: GmailAttachment[]; snippet: string;
}
export type GmailSendInput = {
  account_id: string; to: string[]; cc?: string[]; bcc?: string[]; subject?: string; body: string;
  thread_id?: string; reply_to_message_id?: string;
  attachments?: Array<{ filename: string; content_type: string; data_base64: string }>;
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
  modify: (input: { account_id: string; thread_id: string; add?: string[]; remove?: string[]; trash?: boolean }) =>
    call<{ ok: boolean }>('modify', input),
  send: (input: GmailSendInput) => call<{ ok: boolean; message_id: string; thread_id: string }>('send', input),
};
