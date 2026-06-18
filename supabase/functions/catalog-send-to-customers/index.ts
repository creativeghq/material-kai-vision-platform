/**
 * catalog-send-to-customers
 *
 * Admin sends a published (or ready) catalog to recipients resolved from a
 * set of CRM categories. For every unique email:
 *   1. (Optional) ensure a catalog_email_grants row exists so first-time
 *      visitors who match neither auth.users nor crm_contacts/companies
 *      still get through the gate.
 *   2. Dispatch the email via the platform's email-api edge function using
 *      the catalog_send.recipient template.
 *   3. Log one catalog_email_sends row per recipient (sent_by, batch_id,
 *      source_category_ids, status, resend_message_id).
 *
 * Two actions:
 *   - "preview"  → returns the resolved recipient list without sending.
 *                  Used by the SendToCustomersModal to confirm the count.
 *   - "send"     → actually dispatches.
 */
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const PUBLIC_APP_URL = (Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr').replace(/\/$/, '');

interface SendRequest {
  action: 'preview' | 'send';
  catalog_id: string;
  category_ids: string[];
  // Optional admin overrides
  subject?: string;
  message_body?: string;
  // If true, every resolved recipient gets a catalog_email_grants row written
  // before send. Lets the admin add one-off guests via the categories without
  // pre-staging them in users/contacts.
  ensure_grants?: boolean;
}

interface RecipientRow {
  email: string;
  member_kind: string | null;
  user_id: string | null;
  crm_contact_id: string | null;
  crm_company_id: string | null;
  display_name: string | null;
  category_ids: string[];
  category_slugs: string[];
}

interface SendResponse {
  success: boolean;
  send_batch_id?: string;
  recipients_count?: number;
  sent_count?: number;
  failed_count?: number;
  recipients?: RecipientRow[];
  error?: string;
}

async function authenticate(req: Request): Promise<{ ok: boolean; userId?: string; error?: string }> {
  const auth = req.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return { ok: false, error: 'Missing Authorization header' };
  if (token === supabaseServiceKey) return { ok: true };
  try {
    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user?.id) return { ok: false, error: 'Invalid JWT' };
    // Admin role gate — this is a write-out-to-N-customers operation
    const { data: prof } = await admin
      .from('user_profiles')
      .select('role_id, roles!user_profiles_role_id_fkey(name)')
      .eq('user_id', data.user.id)
      .maybeSingle();
    const roleName = (prof as any)?.roles?.name;
    if (roleName !== 'admin') return { ok: false, error: 'Admin only' };
    return { ok: true, userId: data.user.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Auth failed' };
  }
}

Deno.serve(withApiLogging('catalog-send-to-customers', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405);

  const auth = await authenticate(req);
  if (!auth.ok) return jsonResponse({ success: false, error: auth.error || 'Unauthorized' }, 401);

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body: SendRequest = await req.json();
    if (!body.catalog_id) return jsonResponse({ success: false, error: 'catalog_id required' }, 400);
    if (!Array.isArray(body.category_ids) || body.category_ids.length === 0) {
      return jsonResponse({ success: false, error: 'category_ids required' }, 400);
    }

    const { data: catalog, error: catErr } = await supabase
      .from('presentation_catalogs')
      .select('id, owner_user_id, workspace_id, title, subtitle, slug, status, pdf_url')
      .eq('id', body.catalog_id)
      .single();
    if (catErr || !catalog) return jsonResponse({ success: false, error: 'Catalog not found' }, 404);
    if (auth.userId && catalog.owner_user_id !== auth.userId) {
      return jsonResponse({ success: false, error: 'Not authorized for this catalog' }, 403);
    }
    if (catalog.status !== 'published') {
      return jsonResponse({
        success: false,
        error: `Catalog must be published before sending. Current status: ${catalog.status}.`,
      }, 422);
    }
    if (!catalog.slug) {
      return jsonResponse({ success: false, error: 'Catalog has no public slug.' }, 422);
    }

    const { data: rec, error: recErr } = await supabase.rpc('crm_categories_resolve_recipients', {
      p_category_ids: body.category_ids,
    });
    if (recErr) return jsonResponse({ success: false, error: recErr.message }, 500);
    const recipients: RecipientRow[] = (rec || []) as RecipientRow[];

    if (body.action === 'preview') {
      return jsonResponse({
        success: true,
        recipients_count: recipients.length,
        recipients,
      });
    }

    if (recipients.length === 0) {
      return jsonResponse({ success: false, error: 'No recipients matched the selected categories.' }, 400);
    }

    const sendBatchId = crypto.randomUUID();
    const subject = body.subject?.trim() || `${catalog.title} — new catalog`;
    const publicUrl = `${PUBLIC_APP_URL}/c/${catalog.slug}`;

    // Sender display name (user) + workspace brand identity (finance_settings, #174 Option A).
    const { data: senderProfile } = await supabase
      .from('user_profiles')
      .select('full_name, email')
      .eq('user_id', catalog.owner_user_id)
      .maybeSingle();
    // Branding from the catalog's OWN workspace (matches the quote path). Fall back to the
    // owner-membership guess only for legacy rows with a null workspace_id.
    let ownerWsId: string | null = catalog.workspace_id ?? null;
    if (!ownerWsId) {
      const { data: ownerMembers } = await supabase
        .from('workspace_members').select('workspace_id, role').eq('user_id', catalog.owner_user_id).eq('status', 'active').limit(50);
      ownerWsId = (ownerMembers?.find((m: any) => m.role === 'owner') ?? ownerMembers?.find((m: any) => m.role === 'admin') ?? ownerMembers?.[0])?.workspace_id ?? null;
    }
    const { data: ownerFs } = ownerWsId
      ? await supabase.from('finance_settings').select('business_name, branding_contact_line').eq('workspace_id', ownerWsId).maybeSingle()
      : { data: null as any };
    const senderCompany = ownerFs?.business_name || '';
    const senderContact = ownerFs?.branding_contact_line || '';
    const senderName = senderProfile?.full_name || senderCompany || senderProfile?.email || 'Material KAI';

    // Optional ensure_grants — write catalog_email_grants for every recipient
    // so anyone whose category-membership came from a CRM contact (not a
    // platform user) still passes the email-gate without a fallback flow.
    if (body.ensure_grants) {
      const grantRows = recipients.map((r) => ({
        catalog_id: catalog.id,
        email: r.email,
        note: 'auto-granted via catalog send',
        granted_by: auth.userId || catalog.owner_user_id,
      }));
      // Bulk upsert; per-row failures are OK because RLS on the unique index
      // already prevents dupes.
      await supabase.from('catalog_email_grants').upsert(grantRows, {
        onConflict: 'catalog_id,email',
        ignoreDuplicates: true,
      } as any).then(({ error }) => {
        if (error) console.warn('[catalog-send] ensure_grants upsert failed:', error.message);
      });
    }

    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
      const variables: Record<string, string> = {
        catalog_title: catalog.title,
        catalog_subtitle: catalog.subtitle || '',
        catalog_url: publicUrl,
        recipient_first_name: firstNameFor(recipient),
        sender_name: senderName,
        sender_company: senderCompany,
        sender_contact: senderContact,
        message_body: body.message_body?.trim() || '',
      };

      let status: 'sent' | 'failed' = 'sent';
      let statusMessage: string | null = null;
      let resendMessageId: string | null = null;
      let emailLogId: string | null = null;

      try {
        const { data: dispatch, error: dispatchErr } = await supabase.functions.invoke('email-api', {
          body: {
            action: 'send',
            to: recipient.email,
            subject,
            templateSlug: 'catalog_send.recipient',
            variables,
            emailType: 'marketing',
            tags: {
              feature: 'presentation_catalogs',
              catalog_id: catalog.id,
              send_batch_id: sendBatchId,
            },
          },
        });
        if (dispatchErr || !dispatch?.success) {
          status = 'failed';
          statusMessage = dispatchErr?.message || dispatch?.error || 'email-api dispatch failed';
        } else {
          resendMessageId = dispatch?.messageId || dispatch?.resend_id || null;
          emailLogId = dispatch?.emailLogId || dispatch?.email_log_id || null;
        }
      } catch (sendErr) {
        status = 'failed';
        statusMessage = sendErr instanceof Error ? sendErr.message : 'send threw';
      }

      const { error: auditErr } = await supabase.from('catalog_email_sends').insert({
        catalog_id: catalog.id,
        send_batch_id: sendBatchId,
        recipient_email: recipient.email,
        recipient_member_kind: recipient.member_kind,
        recipient_user_id: recipient.user_id,
        recipient_crm_contact_id: recipient.crm_contact_id,
        recipient_crm_company_id: recipient.crm_company_id,
        source_category_ids: recipient.category_ids,
        source_category_slugs: recipient.category_slugs,
        subject,
        template_slug: 'catalog_send.recipient',
        email_log_id: emailLogId,
        resend_message_id: resendMessageId,
        status,
        status_message: statusMessage,
        sent_at: status === 'sent' ? new Date().toISOString() : null,
        sent_by: auth.userId || catalog.owner_user_id,
      });

      // If the audit row failed to persist, the send is unaccounted-for — count it as
      // failed rather than reporting a "sent" the operator can't see/trace.
      if (auditErr) {
        console.error(`[catalog-send-to-customers] audit insert failed for ${recipient.email}:`, auditErr);
        failed++;
      } else if (status === 'sent') {
        sent++;
      } else {
        failed++;
      }
    }

    return jsonResponse({
      success: true,
      send_batch_id: sendBatchId,
      recipients_count: recipients.length,
      sent_count: sent,
      failed_count: failed,
    });
  } catch (err) {
    console.error('[catalog-send-to-customers] error:', err);
    return jsonResponse({ success: false, error: err instanceof Error ? err.message : 'Send failed' }, 500);
  }
}));

function firstNameFor(r: RecipientRow): string {
  if (r.display_name) {
    const first = r.display_name.split(/\s+/)[0];
    if (first) return first;
  }
  // Fallback to the email local-part — typical pattern for cold recipients
  const local = r.email.split('@')[0];
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function jsonResponse(body: SendResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
