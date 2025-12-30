/**
 * Email Service
 * Handles email sending via Amazon SES through Supabase Edge Functions
 *
 * IMPORTANT: AWS credentials are stored as Supabase Secrets, NOT in environment variables
 * All email operations go through the email-api Edge Function which has access to secrets
 */

import { supabase } from '@/integrations/supabase/client';

// Types
export interface EmailDomain {
  id: string;
  domain: string;
  verification_status: 'pending' | 'verified' | 'failed';
  verification_token?: string;
  dkim_tokens?: string[];
  ses_identity_arn?: string;
  is_default: boolean;
  bounce_rate: number;
  complaint_rate: number;
  reputation_status: 'healthy' | 'warning' | 'critical';
  daily_quota: number;
  max_send_rate: number;
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
  sent_at?: string;
  delivered_at?: string;
  opened_at?: string;
  clicked_at?: string;
}

export class EmailService {
  /**
   * Send an email via the email-api Edge Function
   */
  async sendEmail(options: SendEmailOptions): Promise<{ messageId: string; logId: string }> {
    try {
      const { data, error } = await supabase.functions.invoke('email-api', {
        body: {
          action: 'send',
          ...options,
        },
      });

      if (error) {
        console.error('Edge function error:', error);
        // Provide more helpful error message
        const errorMessage = error.message || 'Failed to send email';
        throw new Error(errorMessage);
      }

      if (!data || !data.messageId) {
        throw new Error('Invalid response from email service');
      }

      return data;
    } catch (error: any) {
      console.error('Error sending email:', error);

      // Re-throw with more context
      if (error.message?.includes('FunctionsRelayError')) {
        throw new Error('Email service unavailable. Please check edge function deployment.');
      } else if (error.message?.includes('FunctionsHttpError')) {
        throw new Error('Email service error. Please check AWS SES configuration.');
      }

      throw error;
    }
  }

  /**
   * Get all verified email domains (from database and SES)
   */
  async getDomains(): Promise<EmailDomain[]> {
    // Fetch from database
    const { data: dbDomains, error } = await supabase
      .from('email_domains')
      .select('*')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching email domains:', error);
      throw new Error('Failed to fetch email domains');
    }

    // Fetch from SES
    try {
      const { data: sesData, error: sesError } = await supabase.functions.invoke('email-api', {
        method: 'POST',
        body: { action: 'list-ses-domains' },
      });

      if (sesError) {
        console.error('Error fetching SES domains:', sesError);
        // Return database domains if SES fetch fails
        return dbDomains || [];
      }

      const sesDomains = sesData?.domains || [];

      // Merge SES domains with database domains
      // Add SES domains that are not in the database
      const dbDomainNames = new Set((dbDomains || []).map(d => d.domain));
      const newSesDomains = sesDomains
        .filter((sd: any) => !dbDomainNames.has(sd.domain))
        .map((sd: any) => ({
          id: `ses-${sd.domain}`,
          domain: sd.domain,
          verification_status: sd.verificationStatus === 'Success' ? 'verified' :
                              sd.verificationStatus === 'Failed' ? 'failed' : 'pending',
          verification_token: sd.verificationToken,
          is_default: false,
          bounce_rate: 0,
          complaint_rate: 0,
          daily_quota: 0,
          reputation_status: 'healthy',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }));

      return [...(dbDomains || []), ...newSesDomains];
    } catch (error) {
      console.error('Error fetching SES domains:', error);
      // Return database domains if SES fetch fails
      return dbDomains || [];
    }
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
   * Verify a domain with Amazon SES via Edge Function
   */
  async verifyDomain(domain: string): Promise<{ verificationToken: string }> {
    try {
      const { data, error } = await supabase.functions.invoke('email-api', {
        body: {
          action: 'verify-domain',
          domain,
        },
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error verifying domain:', error);
      throw error;
    }
  }

  /**
   * Check domain verification status via Edge Function
   */
  async checkDomainVerification(domain: string): Promise<{ isVerified: boolean }> {
    try {
      const { data, error } = await supabase.functions.invoke('email-api', {
        body: {
          action: 'check-domain',
          domain,
        },
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error checking domain verification:', error);
      throw error;
    }
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

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.emailType) {
      query = query.eq('email_type', filters.emailType);
    }
    if (filters?.fromDate) {
      query = query.gte('created_at', filters.fromDate.toISOString());
    }
    if (filters?.toDate) {
      query = query.lte('created_at', filters.toDate.toISOString());
    }
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

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
    try {
      const { data, error } = await supabase.functions.invoke('email-api', {
        body: {
          action: 'analytics',
          dateRange,
        },
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error getting analytics:', error);
      throw error;
    }
  }

  /**
   * Get SES sending statistics via Edge Function
   */
  async getSendingStats(): Promise<{
    max24HourSend: number;
    maxSendRate: number;
    sentLast24Hours: number;
  }> {
    try {
      const { data, error } = await supabase.functions.invoke('email-api', {
        body: {
          action: 'sending-stats',
        },
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error getting sending stats:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const emailService = new EmailService();

