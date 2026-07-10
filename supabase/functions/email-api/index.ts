/**
 * Email API Edge Function
 * Handles email sending, domain management, and analytics via Resend
 *
 * Authentication:
 * - Secret key (apikey header): Full admin access
 * - User JWT (Authorization header): User-specific operations
 */

import { createClient } from '@supabase/supabase-js';
import { renderReactEmailTemplate, renderTemplateWithVariables, generatePlainTextFromReactEmail } from '../_shared/react-email-renderer.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, isAdminAccess, userCanAccessWorkspace } from '../_shared/auth.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { notConfiguredResponse } from '../_shared/api-provider-errors.ts';
import { resolveWorkspaceEmailSender, checkWorkspaceSendQuota } from '../_shared/email-sender.ts';

const resendApiKey = () => Deno.env.get('RESEND_API_KEY') || '';

interface SendEmailRequest {
  to: string | string[];
  from?: string;
  fromName?: string;
  subject: string;
  html?: string;
  text?: string;
  templateSlug?: string;
  /** Overrides the template's subject_template when a templateSlug is used (variables still rendered).
   *  Marketing campaigns pass the campaign's own subject_line here so it wins over the template subject. */
  subjectOverride?: string;
  variables?: Record<string, string>;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  tags?: Record<string, string>;
  emailType?: 'transactional' | 'marketing' | 'notification';
  /** Resend attachments — base64 content (no data: prefix). */
  attachments?: Array<{ filename: string; content: string }>;
  /** When set, the send uses this workspace's BYOK Resend key + sender (workspace_email_config)
   *  and counts against its platform-controlled daily cap. Omit for platform/system sends. */
  workspace_id?: string;
  /** #255 marketing sends: require the resolved sender to be the workspace's OWN Resend (BYOK) —
   *  NO platform-key fallback. Returns 503 (code=workspace_sender_required) when the workspace has
   *  no verified BYOK config, so the campaign never goes out from the platform domain. */
  requireWorkspaceSender?: boolean;
}

async function sendViaResend(apiKey: string, payload: {
  from: string;
  to: string[];
  subject: string;
  html?: string;
  text?: string;
  cc?: string[];
  bcc?: string[];
  reply_to?: string;
  tags?: Array<{ name: string; value: string }>;
  attachments?: Array<{ filename: string; content: string }>;
}): Promise<string> {
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

Deno.serve(withApiLogging('email-api', async (req) => {
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

        // Gate freeform send: a regular authenticated user must NOT be able to send arbitrary
        // email (any to/subject/html) from the platform's verified domain — that's spam/phishing
        // + domain-reputation risk. Server-to-server callers (Flows, quote/alert dispatchers) use
        // the admin secret → isAdminAccess; interactive callers must be an operator.
        if (!isAdminAccess(auth)) {
          const opAuth = await authenticate(req, { allowedRoles: ['admin', 'super_admin', 'owner'] });
          if (!opAuth.success) {
            return new Response(
              JSON.stringify({ success: false, error: 'Email send requires operator privileges' }),
              { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
          }
        }

        const body: SendEmailRequest = requestBody;

        // Pentest #250 H4: body.workspace_id selects WHOSE Resend key + verified sender
        // domain is used. Without binding it to the caller, a workspace-A owner could
        // send from workspace B's verified domain — billed to B's key, counted against
        // B's quota, stamped to B. Require membership when a workspace_id is supplied
        // (server-to-server admin-secret callers are exempt — trusted system sends).
        if (!isAdminAccess(auth) && body.workspace_id) {
          if (!(await userCanAccessWorkspace(supabaseClient, auth.userId, body.workspace_id))) {
            return new Response(
              JSON.stringify({ success: false, error: 'Not authorized for the requested workspace sender' }),
              { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
          }
        }

        // Resolve the Resend key + sender: the workspace's own BYOK config wins when set,
        // otherwise the platform key + global email_settings sender.
        const sender = await resolveWorkspaceEmailSender(supabaseClient, body.workspace_id);

        // #255 marketing BYOK-only gate: fail closed when strict and the resolved sender fell back
        // to the platform key/domain. A workspace that hasn't configured its own verified Resend
        // MUST NOT send marketing from the shared platform domain.
        if (body.requireWorkspaceSender && sender.source !== 'workspace') {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'This workspace must configure its own Resend account (API key + verified sender) before sending marketing email.',
              code: 'workspace_sender_required',
            }),
            { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }

        // Pre-flight: require a Resend API key. Without this, sendViaResend()
        // throws deep inside the send pipeline and surfaces as an opaque 500.
        // Returning 503 with code='provider_not_configured' lets the frontend
        // surface a meaningful "ask your admin to set this" message.
        if (!sender.apiKey) {
          return notConfiguredResponse(
            {
              provider: 'Resend',
              envVarHint: 'Set RESEND_API_KEY on the host, paste it',
              settingsPath: '/admin/modules/email/settings → Keys (or your workspace email settings)',
            },
            corsHeaders,
          );
        }

        // Enforce the platform-controlled per-workspace daily send cap (no-op for system sends
        // that carry no workspace_id).
        const quota = await checkWorkspaceSendQuota(supabaseClient, body.workspace_id);
        if (!quota.allowed) {
          return new Response(
            JSON.stringify({
              success: false,
              error: `Daily email limit reached for this workspace (${quota.used}/${quota.limit}). Try again tomorrow.`,
              code: 'workspace_email_quota_exceeded',
              used: quota.used,
              limit: quota.limit,
            }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }

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
            throw new HttpError(404, `Template not found: ${body.templateSlug}`);
          }

          templateId = template.id;
          const variables = body.variables || {};
          // NB: schema columns are subject_template / html_template / text_template
          // (this used to reference template.subject / .html_content / .text_content
          // which silently fell through to the caller-supplied html — confusing the
          // first send-email path that doesn't pre-render a fallback).
          // subjectOverride (campaign subject_line) wins over the template's own subject when supplied.
          subject = renderTemplateWithVariables(body.subjectOverride || template.subject_template || body.subject, variables);

          // Pentest #250 C11: react_code is executed via import() in the edge worker
          // (arbitrary JS + all platform secrets). Only ever run it for platform-authored
          // SYSTEM templates — never tenant-authored ones. The DB trigger already blocks
          // non-operators from writing react_code/is_system; this is defense-in-depth.
          if (template.react_code && template.is_system === true) {
            try {
              htmlBody = await renderReactEmailTemplate(template.react_code, variables);
              if (!textBody) {
                textBody = generatePlainTextFromReactEmail(htmlBody);
              }
            } catch (error) {
              console.error('Error rendering React Email template, falling back to HTML:', error);
              if (template.html_template) {
                htmlBody = renderTemplateWithVariables(template.html_template, variables);
              } else {
                throw new Error('Failed to render email template');
              }
            }
          } else if (template.html_template) {
            htmlBody = renderTemplateWithVariables(template.html_template, variables);
            if (template.text_template) {
              textBody = renderTemplateWithVariables(template.text_template, variables);
            }
          } else {
            throw new Error('Template has no content');
          }
        }

        if (!htmlBody && !textBody) {
          throw new Error('Either html or text body must be provided');
        }

        // Sender comes from the resolved BYOK/platform config (see resolveWorkspaceEmailSender).
        // We deliberately do NOT fall back to a bogus `noreply@example.com` — that domain is
        // unverified, so Resend rejects it (and a silent fallback masks a real misconfiguration).
        // If neither the request nor the resolved config supplies a real sender, fail loudly.
        const fromEmail = body.from || sender.fromEmail;
        if (!fromEmail) {
          throw new Error(
            'No sender address configured. Set a workspace sender (workspace_email_config) or ' +
            '`default_from_email` in email_settings, or pass `from` in the request.',
          );
        }
        const fromName = body.fromName || sender.fromName;
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
            workspace_id: body.workspace_id ?? null,
            // Server-to-server callers (Flows send_email, send-quote-email, price/
            // mention alerts, …) authenticate with the secret key and carry no user,
            // so auth.user is null. created_by is nullable for exactly these system
            // sends — guard it so the whole send doesn't 500 on `null.id`.
            created_by: user?.id ?? null,
          })
          .select()
          .single();

        // Guard BOTH the error and a null row: a successful insert whose RETURNING
        // row is hidden by RLS yields logData=null with no error. Without this guard
        // the code would send the email and then 500 on `logData.id` (reading 'id'
        // of null) — emailing the recipient but reporting failure to the caller.
        if (logError || !logData) {
          throw new HttpError(500, `Failed to create email log: ${logError?.message ?? 'insert returned no row (check email_logs RLS)'}`);
        }

        // Send via Resend
        const tags = Object.entries(body.tags || {}).map(([name, value]) => ({ name, value }));
        if (!tags.some(t => t.name === 'type')) {
          tags.push({ name: 'type', value: body.emailType || 'transactional' });
        }

        const messageId = await sendViaResend(sender.apiKey, {
          from: fromAddress,
          to: toAddresses,
          subject,
          html: htmlBody,
          text: textBody,
          cc: body.cc,
          bcc: body.bcc,
          reply_to: body.replyTo,
          tags,
          attachments: body.attachments,
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

        const adminAuth = await authenticate(req, { allowedRoles: ['admin', 'super_admin', 'owner'] });
        if (!adminAuth.success) throw new Error('Unauthorized: Admin access required');

        const { domain } = requestBody;
        if (!domain) throw new Error('Domain is required');

        const { data, error } = await supabaseClient
          .from('email_domains')
          .insert({
            domain,
            verification_status: 'pending',
            created_by: user?.id ?? null,
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

        const adminAuth = await authenticate(req, { allowedRoles: ['admin', 'super_admin', 'owner'] });
        if (!adminAuth.success) throw new Error('Unauthorized: Admin access required');

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
        const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10), 1), 1000);

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

      case 'sync-domains': {
        if (req.method !== 'POST') throw new Error('Method not allowed');

        const adminAuth = await authenticate(req, { allowedRoles: ['admin', 'super_admin', 'owner'] });
        if (!adminAuth.success) throw new Error('Unauthorized: Admin access required');

        const apiKey = () => Deno.env.get('RESEND_API_KEY') || '';
        if (!apiKey()) throw new Error('RESEND_API_KEY is not configured');

        // Fetch domains from Resend
        const resendRes = await fetch('https://api.resend.com/domains', {
          headers: { 'Authorization': `Bearer ${apiKey()}` },
        });
        const resendData = await resendRes.json();

        if (!resendRes.ok) {
          throw new Error(resendData.message || `Resend API error: ${resendRes.status}`);
        }

        const resendDomains: Array<{ id: string; name: string; status: string }> = resendData.data || [];
        let added = 0;
        let updated = 0;

        for (const rd of resendDomains) {
          const verificationStatus = rd.status === 'verified' ? 'verified' : rd.status === 'failed' ? 'failed' : 'pending';

          const { data: existing } = await supabaseClient
            .from('email_domains')
            .select('id, verification_status')
            .eq('domain', rd.name)
            .single();

          if (existing) {
            // Update status if changed
            if (existing.verification_status !== verificationStatus) {
              await supabaseClient
                .from('email_domains')
                .update({ verification_status: verificationStatus })
                .eq('id', existing.id);
              updated++;
            }
          } else {
            // Insert new domain
            await supabaseClient
              .from('email_domains')
              .insert({
                domain: rd.name,
                verification_status: verificationStatus,
                created_by: user?.id ?? null,
              });
            added++;
          }
        }

        return new Response(
          JSON.stringify({ success: true, added, updated, total: resendDomains.length }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        throw new Error('Invalid endpoint');
    }
  } catch (error) {
    // Typed client errors carry their own status and skip Sentry via the wrapper.
    if (error instanceof HttpError) throw error;
    console.error('Error:', error);
    // Top-level capture is handled by withApiLogging (returns 5xx → Sentry).
    const errMsg = error instanceof Error ? error.message : String(error);
    // Map a couple of legacy string-thrown client errors; everything else is a genuine
    // (likely transient/server) fault → 500 so it surfaces in Sentry and the client
    // knows it can retry, rather than being mislabeled as a permanent 4xx.
    const statusCode = errMsg.includes('Unauthorized') ? 401 : errMsg.includes('not allowed') ? 405 : 500;
    return new Response(
      JSON.stringify({ success: false, error: errMsg }),
      { status: statusCode, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}));
