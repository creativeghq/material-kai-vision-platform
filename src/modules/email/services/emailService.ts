/**
 * Email Service
 * Handles email sending via Resend through Supabase Edge Functions.
 *
 * IMPORTANT: RESEND_API_KEY is stored as a Supabase Secret, NOT in environment variables.
 * All email operations go through the email-api Edge Function which has access to secrets.
 */

import { supabase } from '@/integrations/supabase/client';
import { edgeError } from '@/utils/edgeError';

// Types
export interface EmailDomain {
  id: string;
  domain: string;
  verification_status: 'pending' | 'verified' | 'failed';
  verification_token?: string;
  dkim_tokens?: string[];
  is_default: boolean;
  bounce_rate: number;
  complaint_rate: number;
  reputation_score?: number;
}

export interface EmailTemplate {
  id: string;
  name: string;
  slug: string;
  description?: string;
  subject_template: string;
  html_template: string;
  text_template?: string;
  react_code?: string;
  variables: string[];
  category: 'transactional' | 'marketing' | 'notification';
  is_active: boolean;
}

export interface SendEmailOptions {
  to: string | string[];
  from?: string;
  fromName?: string;
  subject: string;
  html?: string;
  text?: string;
  templateSlug?: string;
  variables?: Record<string, string>;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  /** Resend attachments — base64 content (no data: prefix). */
  attachments?: Array<{ filename: string; content: string }>;
  tags?: Record<string, string>;
  emailType?: 'transactional' | 'marketing' | 'notification';
  priority?: number;
  scheduledAt?: Date;
  /** Bind the send to a workspace so its OWN Resend BYOK key + verified sender is used. */
  workspaceId?: string;
  /** Fail closed (503 `workspace_sender_required`) instead of falling back to the platform
   *  sender when the workspace hasn't configured its own Resend. Set for all tenant business mail. */
  requireWorkspaceSender?: boolean;
}

/** Structured error codes email-api returns so callers can branch (e.g. open the Connect-email modal). */
export type EmailSendErrorCode =
  | 'workspace_sender_required'
  | 'provider_not_configured'
  | 'workspace_email_quota_exceeded'
  | 'unknown';

/** Thrown by emailService.sendEmail. Carries the machine-readable `code` from email-api so UI
 *  can react — notably `workspace_sender_required` → prompt the user to connect their own email. */
export class EmailSendError extends Error {
  code: EmailSendErrorCode;
  constructor(message: string, code: EmailSendErrorCode) {
    super(message);
    this.name = 'EmailSendError';
    this.code = code;
  }
}

/** True when a send failed only because the workspace has no BYOK Resend configured yet. */
export function isSenderNotConfigured(err: unknown): err is EmailSendError {
  return err instanceof EmailSendError && err.code === 'workspace_sender_required';
}

export interface EmailLog {
  id: string;
  message_id?: string;
  to_email: string;
  from_email: string;
  subject: string;
  status: 'queued' | 'sent' | 'delivered' | 'bounced' | 'complained' | 'failed';
  email_type?: string;
  sent_at?: string;
  delivered_at?: string;
  opened_at?: string;
  clicked_at?: string;
}

export class EmailService {
  /**
   * Send an email via the email-api Edge Function (Resend)
   */
  async sendEmail(options: SendEmailOptions): Promise<{ messageId: string; logId: string }> {
    // email-api reads snake_case `workspace_id`; the rest of the options pass through as-is.
    const { workspaceId, ...rest } = options;
    const { data, error } = await supabase.functions.invoke('email-api', {
      body: {
        action: 'send',
        ...rest,
        ...(workspaceId ? { workspace_id: workspaceId } : {}),
      },
    });

    // Non-2xx from email-api is masked by the SDK — the real reason + machine code live in the
    // response body (error.context). Unwrap it so callers can branch on `code`.
    if (error) {
      let bodyErr: string | undefined;
      let code: EmailSendErrorCode = 'unknown';
      try {
        const body = await (error as any)?.context?.json?.();
        bodyErr = body?.error ?? body?.message;
        if (body?.code) code = body.code as EmailSendErrorCode;
      } catch { /* body not JSON — fall through */ }
      console.error('Email send failed:', code, bodyErr ?? error.message);
      throw new EmailSendError(bodyErr || error.message || 'Failed to send email', code);
    }

    if (!data?.success) {
      throw new EmailSendError(data?.error || 'Failed to send email', (data?.code as EmailSendErrorCode) || 'unknown');
    }
    if (!data.messageId) {
      throw new EmailSendError('Invalid response from email service', 'unknown');
    }
    return data;
  }

  /**
   * Get all email domains from the database
   */
  async getDomains(): Promise<EmailDomain[]> {
    const { data, error } = await supabase
      .from('email_domains')
      .select('*')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching email domains:', error);
      throw new Error('Failed to fetch email domains');
    }

    return data || [];
  }

  /**
   * Get default email domain
   */
  async getDefaultDomain(): Promise<EmailDomain | null> {
    const { data, error } = await supabase
      .from('email_domains')
      .select('*')
      .eq('is_default', true)
      .eq('verification_status', 'verified')
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching default domain:', error);
      return null;
    }

    return data;
  }

  /**
   * Add a domain to the database (verification is done in the Resend dashboard)
   */
  async addDomain(domain: string): Promise<{ message: string }> {
    const { data, error } = await supabase.functions.invoke('email-api', {
      body: { action: 'add-domain', domain },
    });

    if (error) throw await edgeError(error);
    return data;
  }

  /**
   * Mark a domain as verified after confirming in the Resend dashboard
   */
  async markDomainVerified(domain: string): Promise<void> {
    const { error } = await supabase.functions.invoke('email-api', {
      body: { action: 'mark-domain-verified', domain },
    });

    if (error) throw await edgeError(error);
  }

  /**
   * Sync domains from Resend into the local database
   */
  async syncDomains(): Promise<{ added: number; updated: number; total: number }> {
    const { data, error } = await supabase.functions.invoke('email-api', {
      body: { action: 'sync-domains' },
    });

    if (error) throw await edgeError(error);
    if (!data?.success) throw new Error(data?.error || 'Failed to sync domains');
    return data;
  }

  /**
   * Get email logs with filtering
   */
  async getEmailLogs(filters?: {
    status?: string;
    emailType?: string;
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
  }): Promise<EmailLog[]> {
    let query = supabase
      .from('email_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.emailType) query = query.eq('email_type', filters.emailType);
    if (filters?.fromDate) query = query.gte('created_at', filters.fromDate.toISOString());
    if (filters?.toDate) query = query.lte('created_at', filters.toDate.toISOString());
    if (filters?.limit) query = query.limit(filters.limit);

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching email logs:', error);
      throw new Error('Failed to fetch email logs');
    }

    return data || [];
  }

  /**
   * Get email analytics via Edge Function
   */
  async getAnalytics(dateRange?: { start: string; end: string }): Promise<{
    totalSent: number;
    totalDelivered: number;
    totalBounced: number;
    totalComplained: number;
    deliveryRate: number;
    bounceRate: number;
    complaintRate: number;
  }> {
    const { data, error } = await supabase.functions.invoke('email-api', {
      body: { action: 'analytics', dateRange },
    });

    if (error) throw error;
    return data;
  }

  /** Per-workspace Resend BYOK config STATUS (finance-manager only). Never returns the API
   *  key — only whether one is set (`has_api_key`) + the effective platform-controlled cap. */
  async getWorkspaceConfig(workspaceId: string): Promise<{
    from_email: string | null;
    from_name: string | null;
    reply_to: string | null;
    enabled: boolean;
    has_api_key: boolean;
    effective_daily_limit: number;
    sent_today: number;
    /** Which sender a real send resolves to right now: own Resend key or the platform default. */
    source: 'workspace' | 'platform';
    /** The platform default sender (global email_settings) — shown when source = 'platform'. */
    platform_from_email: string | null;
    platform_from_name: string | null;
    platform_reply_to: string | null;
  } | null> {
    const { data, error } = await supabase.rpc('get_workspace_email_config_status', { p_workspace_id: workspaceId });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return {
      from_email: row.from_email ?? null,
      from_name: row.from_name ?? null,
      reply_to: row.reply_to ?? null,
      enabled: row.enabled ?? true,
      has_api_key: !!row.has_api_key,
      effective_daily_limit: row.effective_daily_limit ?? 0,
      sent_today: row.sent_today ?? 0,
      source: row.source === 'workspace' ? 'workspace' : 'platform',
      platform_from_email: row.platform_from_email ?? null,
      platform_from_name: row.platform_from_name ?? null,
      platform_reply_to: row.platform_reply_to ?? null,
    };
  }

  /** Send a test email to `to` using this workspace's resolved sender (BYOK when configured).
   *  Surfaces EmailSendError (incl. `workspace_sender_required`) so the caller can react. */
  async sendTestEmail(workspaceId: string, to: string): Promise<{ messageId: string }> {
    const html = `<div style="font-family:'Open Sans',Arial,sans-serif;font-size:14px;line-height:1.6;color:#222">
      <p>This is a test email from your workspace's email sender.</p>
      <p>If you received this, your sending identity (From address${''}, name and Reply-To) is working. 🎉</p>
    </div>`;
    return this.sendEmail({
      to,
      subject: 'Test email — your sender is working',
      html,
      text: 'This is a test email from your workspace email sender. If you received this, your sender is working.',
      emailType: 'transactional',
      workspaceId,
      requireWorkspaceSender: true,
    });
  }

  /** Save this workspace's Resend BYOK config. The API key is only written when a new value is
   *  provided — a blank key preserves the stored one (the masked form never wipes a secret). */
  async saveWorkspaceConfig(workspaceId: string, input: { apiKey?: string; fromEmail: string; fromName?: string | null; replyTo?: string | null; enabled: boolean }): Promise<void> {
    const payload: Record<string, any> = {
      workspace_id: workspaceId,
      from_email: input.fromEmail || null,
      from_name: input.fromName || null,
      reply_to: input.replyTo || null,
      enabled: input.enabled,
      updated_at: new Date().toISOString(),
    };
    if (input.apiKey && input.apiKey.trim()) {
      payload.resend_api_key = input.apiKey.trim();
    }
    const { error } = await supabase.from('workspace_email_config').upsert(payload, { onConflict: 'workspace_id' });
    if (error) throw error;
  }
}

// Export singleton instance
export const emailService = new EmailService();
