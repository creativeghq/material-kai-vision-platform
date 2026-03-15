/**
 * Email API Edge Function
 * Handles email sending, domain management, and analytics via Resend
 *
 * Authentication:
 * - Secret key (apikey header): Full admin access
 * - User JWT (Authorization header): User-specific operations
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { captureException } from '../_shared/sentry.ts';
import { renderReactEmailTemplate, renderTemplateWithVariables, generatePlainTextFromReactEmail } from '../_shared/react-email-renderer.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';

interface SendEmailRequest {
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
}

async function sendViaResend(payload: {
  from: string;
  to: string[];
  subject: string;
  html?: string;
  text?: string;
  cc?: string[];
  bcc?: string[];
  reply_to?: string;
  tags?: Array<{ name: string; value: string }>;
}): Promise<string> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('Resend API error response:', JSON.stringify({ status: res.status, data }));
    throw new Error(data.message || data.name || `Resend API error: ${res.status} - ${JSON.stringify(data)}`);
  }

  return data.id as string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const auth = await authenticate(req);
    if (!auth.success) {
      throw new Error(auth.error || 'Unauthorized');
    }

    const user = auth.user;

    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();
    const requestBody = req.method === 'POST' ? await req.json() : {};
    const action = requestBody.action || path;

    switch (action) {
      case 'send': {
        if (req.method !== 'POST') throw new Error('Method not allowed');

        const body: SendEmailRequest = requestBody;

        let htmlBody = body.html;
        let textBody = body.text;
        let subject = body.subject;
        let templateId: string | undefined;

        if (body.templateSlug) {
          const { data: template, error: templateError } = await supabaseClient
            .from('email_templates')
            .select('*')
            .eq('slug', body.templateSlug)
            .eq('is_active', true)
            .single();

          if (templateError || !template) {
            throw new Error(`Template not found: ${body.templateSlug}`);
          }

          templateId = template.id;
          const variables = body.variables || {};
          subject = renderTemplateWithVariables(template.subject || body.subject, variables);

          if (template.react_code) {
            try {
              htmlBody = await renderReactEmailTemplate(template.react_code, variables);
              if (!textBody) {
                textBody = generatePlainTextFromReactEmail(htmlBody);
              }
            } catch (error) {
              console.error('Error rendering React Email template, falling back to HTML:', error);
              if (template.html_content) {
                htmlBody = renderTemplateWithVariables(template.html_content, variables);
              } else {
                throw new Error('Failed to render email template');
              }
            }
          } else if (template.html_content) {
            htmlBody = renderTemplateWithVariables(template.html_content, variables);
            if (template.text_content) {
              textBody = renderTemplateWithVariables(template.text_content, variables);
            }
          } else {
            throw new Error('Template has no content');
          }
        }

        if (!htmlBody && !textBody) {
          throw new Error('Either html or text body must be provided');
        }

        // Get default sender settings
        let defaultFromEmail = 'noreply@example.com';
        let defaultFromName = 'Material Kai';

        try {
          const { data: emailSettings } = await supabaseClient
            .from('email_settings')
            .select('setting_key, setting_value')
            .in('setting_key', ['default_from_email', 'default_from_name']);

          if (emailSettings) {
            emailSettings.forEach((setting: { setting_key: string; setting_value: string }) => {
              if (setting.setting_key === 'default_from_email') defaultFromEmail = setting.setting_value;
              else if (setting.setting_key === 'default_from_name') defaultFromName = setting.setting_value;
            });
          }
        } catch (error) {
          console.error('Error loading email settings, using defaults:', error);
        }

        const fromEmail = body.from || defaultFromEmail;
        const fromName = body.fromName || defaultFromName;
        const fromAddress = fromName ? `${fromName} <${fromEmail}>` : fromEmail;
        const toAddresses = Array.isArray(body.to) ? body.to : [body.to];

        // Get domain for tracking
        const domain = fromEmail.split('@')[1];
        const { data: domainData } = await supabaseClient
          .from('email_domains')
          .select('id')
          .eq('domain', domain)
          .single();

        // Create email log
        const { data: logData, error: logError } = await supabaseClient
          .from('email_logs')
          .insert({
            template_id: templateId,
            domain_id: domainData?.id,
            from_email: fromEmail,
            from_name: fromName,
            to_email: toAddresses[0],
            cc_emails: body.cc,
            bcc_emails: body.bcc,
            reply_to: body.replyTo,
            subject,
            html_body: htmlBody,
            text_body: textBody,
            status: 'queued',
            email_type: body.emailType || 'transactional',
            tags: body.tags || {},
            variables: body.variables || {},
            created_by: user.id,
          })
          .select()
          .single();

        if (logError) throw new Error(`Failed to create email log: ${logError.message}`);

        // Send via Resend
        const tags = Object.entries(body.tags || {}).map(([name, value]) => ({ name, value }));
        tags.push({ name: 'type', value: body.emailType || 'transactional' });

        const messageId = await sendViaResend({
          from: fromAddress,
          to: toAddresses,
          subject,
          html: htmlBody,
          text: textBody,
          cc: body.cc,
          bcc: body.bcc,
          reply_to: body.replyTo,
          tags,
        });

        // Update log with Resend message ID
        await supabaseClient
          .from('email_logs')
          .update({ message_id: messageId, status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', logData.id);

        return new Response(
          JSON.stringify({ success: true, messageId, logId: logData.id }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'domains': {
        if (req.method !== 'GET' && req.method !== 'POST') throw new Error('Method not allowed');

        const { data, error } = await supabaseClient
          .from('email_domains')
          .select('*')
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: false });

        if (error) throw new Error(`Failed to fetch domains: ${error.message}`);

        return new Response(
          JSON.stringify({ success: true, domains: data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'add-domain': {
        if (req.method !== 'POST') throw new Error('Method not allowed');

        const isAdmin = user.user_metadata?.role === 'admin';
        if (!isAdmin) throw new Error('Unauthorized: Admin access required');

        const { domain } = requestBody;
        if (!domain) throw new Error('Domain is required');

        const { data, error } = await supabaseClient
          .from('email_domains')
          .insert({
            domain,
            verification_status: 'pending',
            created_by: user.id,
          })
          .select()
          .single();

        if (error) throw new Error(`Failed to add domain: ${error.message}`);

        return new Response(
          JSON.stringify({
            success: true,
            domain: data,
            message: 'Domain added. Verify it in your Resend dashboard at resend.com/domains, then mark it verified here.',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'mark-domain-verified': {
        if (req.method !== 'POST') throw new Error('Method not allowed');

        const isAdmin = user.user_metadata?.role === 'admin';
        if (!isAdmin) throw new Error('Unauthorized: Admin access required');

        const { domain } = requestBody;
        if (!domain) throw new Error('Domain is required');

        const { error } = await supabaseClient
          .from('email_domains')
          .update({ verification_status: 'verified' })
          .eq('domain', domain);

        if (error) throw new Error(`Failed to update domain: ${error.message}`);

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'logs': {
        if (req.method !== 'GET' && req.method !== 'POST') throw new Error('Method not allowed');

        const status = url.searchParams.get('status');
        const emailType = url.searchParams.get('emailType');
        const limit = parseInt(url.searchParams.get('limit') || '50');

        let query = supabaseClient
          .from('email_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (status) query = query.eq('status', status);
        if (emailType) query = query.eq('email_type', emailType);

        const { data, error } = await query;
        if (error) throw new Error(`Failed to fetch logs: ${error.message}`);

        return new Response(
          JSON.stringify({ success: true, logs: data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'analytics': {
        let fromDate: string | null = null;
        let toDate: string | null = null;

        if (req.method === 'GET') {
          fromDate = url.searchParams.get('fromDate');
          toDate = url.searchParams.get('toDate');
        } else if (req.method === 'POST') {
          const dateRange = requestBody.dateRange;
          if (dateRange) {
            fromDate = dateRange.start || null;
            toDate = dateRange.end || null;
          }
        }

        let query = supabaseClient.from('email_analytics').select('*');
        if (fromDate) query = query.gte('date', fromDate);
        if (toDate) query = query.lte('date', toDate);

        const { data, error } = await query;
        if (error) throw new Error(`Failed to fetch analytics: ${error.message}`);

        const totals = (data || []).reduce(
          (acc, row) => ({
            totalSent: acc.totalSent + (row.total_sent || 0),
            totalDelivered: acc.totalDelivered + (row.total_delivered || 0),
            totalBounced: acc.totalBounced + (row.total_bounced || 0),
            totalComplained: acc.totalComplained + (row.total_complained || 0),
            totalOpened: acc.totalOpened + (row.total_opened || 0),
            totalClicked: acc.totalClicked + (row.total_clicked || 0),
          }),
          { totalSent: 0, totalDelivered: 0, totalBounced: 0, totalComplained: 0, totalOpened: 0, totalClicked: 0 }
        );

        const deliveryRate = totals.totalSent > 0 ? (totals.totalDelivered / totals.totalSent) * 100 : 0;
        const bounceRate = totals.totalSent > 0 ? (totals.totalBounced / totals.totalSent) * 100 : 0;
        const complaintRate = totals.totalSent > 0 ? (totals.totalComplained / totals.totalSent) * 100 : 0;
        const openRate = totals.totalDelivered > 0 ? (totals.totalOpened / totals.totalDelivered) * 100 : 0;
        const clickRate = totals.totalOpened > 0 ? (totals.totalClicked / totals.totalOpened) * 100 : 0;

        return new Response(
          JSON.stringify({
            success: true,
            totalSent: totals.totalSent,
            totalDelivered: totals.totalDelivered,
            totalBounced: totals.totalBounced,
            totalComplained: totals.totalComplained,
            totalOpened: totals.totalOpened,
            totalClicked: totals.totalClicked,
            deliveryRate: parseFloat(deliveryRate.toFixed(2)),
            bounceRate: parseFloat(bounceRate.toFixed(2)),
            complaintRate: parseFloat(complaintRate.toFixed(2)),
            openRate: parseFloat(openRate.toFixed(2)),
            clickRate: parseFloat(clickRate.toFixed(2)),
            dailyData: data,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        throw new Error('Invalid endpoint');
    }
  } catch (error) {
    console.error('Error:', error);

    await captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: { function: 'email-api' },
      extra: { error_message: error instanceof Error ? error.message : String(error) },
    });

    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
