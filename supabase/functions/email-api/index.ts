/**
 * Email API Edge Function
 * Handles email sending, domain management, and analytics
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SESClient, SendEmailCommand, VerifyDomainIdentityCommand, GetIdentityVerificationAttributesCommand, ListIdentitiesCommand } from 'npm:@aws-sdk/client-ses@3';
import { SESv2Client, GetAccountCommand } from 'npm:@aws-sdk/client-sesv2@3';
import { captureException, captureMessage } from '../_shared/sentry.ts';
import { renderReactEmailTemplate, renderTemplateWithVariables, generatePlainTextFromReactEmail } from '../_shared/react-email-renderer.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

interface VerifyDomainRequest {
  domain: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Initialize SES clients
    const sesClient = new SESClient({
      region: Deno.env.get('AWS_REGION') || 'us-east-1',
      credentials: {
        accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID') || '',
        secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY') || '',
      },
    });

    const sesV2Client = new SESv2Client({
      region: Deno.env.get('AWS_REGION') || 'us-east-1',
      credentials: {
        accessKeyId: Deno.env.get('AWS_ACCESS_KEY_ID') || '',
        secretAccessKey: Deno.env.get('AWS_SECRET_ACCESS_KEY') || '',
      },
    });

    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();

    // Parse request body to check for action parameter
    const requestBody = req.method === 'POST' ? await req.json() : {};
    const action = requestBody.action || path;

    // Route handling
    switch (action) {
      case 'send': {
        if (req.method !== 'POST') {
          throw new Error('Method not allowed');
        }

        const body: SendEmailRequest = requestBody;
        
        // Get template if specified
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

          // Render subject with variables
          subject = renderTemplateWithVariables(template.subject || body.subject, variables);

          // Try to render React Email template first, fall back to HTML template
          if (template.react_code) {
            try {
              htmlBody = await renderReactEmailTemplate(template.react_code, variables);
              // Generate plain text from rendered HTML if not provided
              if (!textBody) {
                textBody = generatePlainTextFromReactEmail(htmlBody);
              }
            } catch (error) {
              console.error('Error rendering React Email template, falling back to HTML:', error);
              // Fall back to HTML template if React rendering fails
              if (template.html_content) {
                htmlBody = renderTemplateWithVariables(template.html_content, variables);
              } else {
                throw new Error('Failed to render email template');
              }
            }
          } else if (template.html_content) {
            // Legacy HTML template rendering
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

        // Get default sender settings from database
        let defaultFromEmail = 'noreply@example.com';
        let defaultFromName = 'Material Kai';

        try {
          const { data: emailSettings } = await supabaseClient
            .from('email_settings')
            .select('setting_key, setting_value')
            .in('setting_key', ['default_from_email', 'default_from_name']);

          if (emailSettings) {
            emailSettings.forEach((setting) => {
              if (setting.setting_key === 'default_from_email') {
                defaultFromEmail = setting.setting_value;
              } else if (setting.setting_key === 'default_from_name') {
                defaultFromName = setting.setting_value;
              }
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

        if (logError) {
          throw new Error(`Failed to create email log: ${logError.message}`);
        }

        // Send via SES
        const configSetName = Deno.env.get('SES_CONFIGURATION_SET_NAME');
        const command = new SendEmailCommand({
          Source: fromAddress,
          Destination: {
            ToAddresses: toAddresses,
            CcAddresses: body.cc,
            BccAddresses: body.bcc,
          },
          Message: {
            Subject: { Data: subject },
            Body: {
              Html: htmlBody ? { Data: htmlBody } : undefined,
              Text: textBody ? { Data: textBody } : undefined,
            },
          },
          ReplyToAddresses: body.replyTo ? [body.replyTo] : undefined,
          // Only include ConfigurationSetName if it's configured
          ...(configSetName ? { ConfigurationSetName: configSetName } : {}),
          Tags: [
            { Name: 'environment', Value: Deno.env.get('ENVIRONMENT') || 'production' },
            { Name: 'type', Value: body.emailType || 'transactional' },
          ],
        });

        const response = await sesClient.send(command);
        const messageId = response.MessageId || '';

        // Update log
        await supabaseClient
          .from('email_logs')
          .update({
            message_id: messageId,
            status: 'sent',
            sent_at: new Date().toISOString(),
          })
          .eq('id', logData.id);

        return new Response(
          JSON.stringify({ success: true, messageId, logId: logData.id }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'verify-domain': {
        if (req.method !== 'POST') {
          throw new Error('Method not allowed');
        }

        // Check if user is admin
        const isAdmin = user.user_metadata?.role === 'admin';
        if (!isAdmin) {
          throw new Error('Unauthorized: Admin access required');
        }

        const body: VerifyDomainRequest = requestBody;

        // Verify domain with SES
        const verifyCommand = new VerifyDomainIdentityCommand({ Domain: body.domain });
        const verifyResponse = await sesClient.send(verifyCommand);
        const verificationToken = verifyResponse.VerificationToken || '';

        // Store in database
        const { data, error } = await supabaseClient
          .from('email_domains')
          .insert({
            domain: body.domain,
            verification_status: 'pending',
            verification_token: verificationToken,
            created_by: user.id,
          })
          .select()
          .single();

        if (error) {
          throw new Error(`Failed to store domain: ${error.message}`);
        }

        return new Response(
          JSON.stringify({ success: true, domain: data, verificationToken }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'check-domain': {
        if (req.method !== 'POST') {
          throw new Error('Method not allowed');
        }

        const body: { domain: string } = requestBody;

        // Check verification status with SES
        const command = new GetIdentityVerificationAttributesCommand({
          Identities: [body.domain],
        });
        const response = await sesClient.send(command);

        const attributes = response.VerificationAttributes?.[body.domain];
        const status = attributes?.VerificationStatus;

        let verificationStatus: 'pending' | 'verified' | 'failed' = 'pending';
        if (status === 'Success') {
          verificationStatus = 'verified';
        } else if (status === 'Failed') {
          verificationStatus = 'failed';
        }

        // Update database
        await supabaseClient
          .from('email_domains')
          .update({ verification_status: verificationStatus })
          .eq('domain', body.domain);

        return new Response(
          JSON.stringify({ success: true, status: verificationStatus }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'domains': {
        // Accept both GET and POST (Supabase functions.invoke uses POST)
        if (req.method !== 'GET' && req.method !== 'POST') {
          throw new Error('Method not allowed');
        }

        const { data, error } = await supabaseClient
          .from('email_domains')
          .select('*')
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: false });

        if (error) {
          throw new Error(`Failed to fetch domains: ${error.message}`);
        }

        return new Response(
          JSON.stringify({ success: true, domains: data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'list-ses-domains': {
        // Accept both GET and POST (Supabase functions.invoke uses POST)
        if (req.method !== 'POST' && req.method !== 'GET') {
          throw new Error('Method not allowed');
        }

        // Check if user is admin
        const isAdmin = user.user_metadata?.role === 'admin';
        if (!isAdmin) {
          throw new Error('Unauthorized: Admin access required');
        }

        // List all identities from SES
        const listCommand = new ListIdentitiesCommand({
          IdentityType: 'Domain',
        });
        const listResponse = await sesClient.send(listCommand);
        const domains = listResponse.Identities || [];

        // Get verification status for all domains
        const verifyCommand = new GetIdentityVerificationAttributesCommand({
          Identities: domains,
        });
        const verifyResponse = await sesClient.send(verifyCommand);

        const sesDomains = domains.map(domain => ({
          domain,
          verificationStatus: verifyResponse.VerificationAttributes?.[domain]?.VerificationStatus || 'Pending',
          verificationToken: verifyResponse.VerificationAttributes?.[domain]?.VerificationToken,
        }));

        return new Response(
          JSON.stringify({ success: true, domains: sesDomains }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'logs': {
        // Accept both GET and POST (Supabase functions.invoke uses POST)
        if (req.method !== 'GET' && req.method !== 'POST') {
          throw new Error('Method not allowed');
        }

        const status = url.searchParams.get('status');
        const emailType = url.searchParams.get('emailType');
        const limit = parseInt(url.searchParams.get('limit') || '50');

        let query = supabaseClient
          .from('email_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (status) {
          query = query.eq('status', status);
        }
        if (emailType) {
          query = query.eq('email_type', emailType);
        }

        const { data, error } = await query;

        if (error) {
          throw new Error(`Failed to fetch logs: ${error.message}`);
        }

        return new Response(
          JSON.stringify({ success: true, logs: data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'analytics': {
        // Accept both GET and POST requests
        // GET: query params (fromDate, toDate)
        // POST: body params (dateRange: { start, end })
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

        if (fromDate) {
          query = query.gte('date', fromDate);
        }
        if (toDate) {
          query = query.lte('date', toDate);
        }

        const { data, error } = await query;

        if (error) {
          throw new Error(`Failed to fetch analytics: ${error.message}`);
        }

        // Aggregate totals
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

        // Return data directly (not nested in 'analytics' property) to match frontend expectations
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

      case 'sending-stats': {
        // Accept both GET and POST (Supabase functions.invoke uses POST)
        if (req.method !== 'GET' && req.method !== 'POST') {
          throw new Error('Method not allowed');
        }

        const command = new GetAccountCommand({});
        const response = await sesV2Client.send(command);

        return new Response(
          JSON.stringify({
            success: true,
            stats: {
              max24HourSend: response.SendQuota?.Max24HourSend || 0,
              maxSendRate: response.SendQuota?.MaxSendRate || 0,
              sentLast24Hours: response.SendQuota?.SentLast24Hours || 0,
            },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        throw new Error('Invalid endpoint');
    }
  } catch (error) {
    console.error('Error:', error);

    // Send error to Sentry
    await captureException(error instanceof Error ? error : new Error(String(error)), {
      tags: {
        function: 'email-api',
        endpoint: 'email-api',
      },
      extra: {
        error_message: error instanceof Error ? error.message : String(error),
      },
    });

    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

