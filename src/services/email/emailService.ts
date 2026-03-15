/**
 * Email Service
 * Handles email sending via Resend through Supabase Edge Functions.
 *
 * IMPORTANT: RESEND_API_KEY is stored as a Supabase Secret, NOT in environment variables.
 * All email operations go through the email-api Edge Function which has access to secrets.
 */

import { supabase } from '@/integrations/supabase/client';

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
  tags?: Record<string, string>;
  emailType?: 'transactional' | 'marketing' | 'notification';
  priority?: number;
  scheduledAt?: Date;
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
    try {
      const { data, error } = await supabase.functions.invoke('email-api', {
        body: { action: 'send', ...options },
      });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message || 'Failed to send email');
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to send email');
      }

      if (!data.messageId) {
        throw new Error('Invalid response from email service');
      }

      return data;
    } catch (error: any) {
      console.error('Error sending email:', error);

      if (error.message?.includes('FunctionsRelayError')) {
        throw new Error('Email service unavailable. Please check edge function deployment.');
      } else if (error.message?.includes('FunctionsHttpError')) {
        throw new Error('Email service error. Please check Resend configuration.');
      }

      throw error;
    }
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

    if (error) throw error;
    return data;
  }

  /**
   * Mark a domain as verified after confirming in the Resend dashboard
   */
  async markDomainVerified(domain: string): Promise<void> {
    const { error } = await supabase.functions.invoke('email-api', {
      body: { action: 'mark-domain-verified', domain },
    });

    if (error) throw error;
  }

  /**
   * Sync domains from Resend into the local database
   */
  async syncDomains(): Promise<{ added: number; updated: number; total: number }> {
    const { data, error } = await supabase.functions.invoke('email-api', {
      body: { action: 'sync-domains' },
    });

    if (error) throw error;
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
}

// Export singleton instance
export const emailService = new EmailService();
