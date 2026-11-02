// deno-lint-ignore-file no-explicit-any
// Email a credit note, delivery note or order to its party, with the online copy linked (#527).
// Called by a user (Email button) or by the seeded "… issued → Email" flows under the service role.
import { createClient } from '@supabase/supabase-js';
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts';
import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { escapeHtml as esc } from '../_shared/html.ts';
import { authenticate, userHasWorkspaceCapability } from '../_shared/auth.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { formatMoney } from '../_shared/money.ts';

type Kind = 'credit_note' | 'delivery_note' | 'order';

async function partyEmail(db: any, companyId: string | null, contactId: string | null) {
  if (companyId) {
    const { data } = await db.from('crm_companies').select('name, email').eq('id', companyId).maybeSingle();
    return { email: data?.email ?? null, name: data?.name ?? '' };
  }
  if (contactId) {
    const { data } = await db.from('crm_contacts').select('name, email').eq('id', contactId).maybeSingle();
    return { email: data?.email ?? null, name: data?.name ?? '' };
  }
  return { email: null, name: '' };
}

/** A purchase order emailed by "Email supplier" is tagged `order_id` rather than linked as an entity. */
async function alreadyEmailed(db: any, kind: Kind, id: string): Promise<boolean> {
  const { data, error } = await db.from('email_logs').select('id')
    .or(kind === 'order' ? `entity_id.eq.${id},tags->>order_id.eq.${id}` : `entity_id.eq.${id}`)
    .not('status', 'in', '(failed,bounced)').limit(1);
  if (error) throw new Error(`could not read the email log: ${error.message}`);
  return (data ?? []).length > 0;
}

Deno.serve(withApiLogging('finance-send-document-email', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = await authenticate(req, { requireUser: false });
  if (!auth.success) return json({ error: auth.error ?? 'Unauthorized' }, 401);
  const internal = auth.level === 'secret';
  if (!internal && !auth.userId) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({})) as { credit_note_id?: string; delivery_note_id?: string; order_id?: string; to?: string };
  const kind: Kind | null = body.credit_note_id ? 'credit_note' : body.delivery_note_id ? 'delivery_note' : body.order_id ? 'order' : null;
  const id = body.credit_note_id ?? body.delivery_note_id ?? body.order_id;
  if (!kind || !id) return json({ error: 'credit_note_id, delivery_note_id or order_id is required' }, 400);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const table = kind === 'credit_note' ? 'credit_notes' : kind === 'delivery_note' ? 'delivery_notes' : 'orders';
  const { data: doc } = await db.from(table).select('*').eq('id', id).maybeSingle();
  if (!doc) return json({ error: 'document not found' }, 404);
  const isPo = kind === 'order' && doc.order_type === 'purchase';
  const caps = kind === 'delivery_note' ? (['finance.operate', 'warehouse.manage'] as const)
    : kind === 'order' ? (['finance.operate', 'sales.portal'] as const) : ('finance.operate' as const);
  if (!internal && !(await userHasWorkspaceCapability(db, auth.userId, doc.workspace_id, caps))) {
    return json({ error: 'document not found' }, 404);
  }
  if (doc.status === 'draft') return json({ ok: false, error: 'Issue the document before emailing it.' }, 409);
  // An automatic send is once per document; a person pressing Email may always re-send.
  if (internal && await alreadyEmailed(db, kind, id)) return json({ ok: true, skipped: 'already_emailed' });

  let companyId: string | null = isPo ? doc.supplier_company_id : (doc.customer_company_id ?? null);
  let contactId: string | null = isPo ? doc.supplier_contact_id : (doc.customer_contact_id ?? null);
  let invoiceNumber: string | null = null;
  if (kind === 'credit_note' && doc.invoice_id) {
    const { data: src } = await db.from('invoices')
      .select('customer_company_id, customer_contact_id, legal_number, internal_number').eq('id', doc.invoice_id).maybeSingle();
    companyId = src?.customer_company_id ?? null;
    contactId = src?.customer_contact_id ?? null;
    invoiceNumber = src?.legal_number ?? src?.internal_number ?? null;
  }
  const party = await partyEmail(db, companyId, contactId);
  const email = body.to ?? party.email;
  if (!email) {
    return internal
      ? json({ ok: true, skipped: 'no_recipient_email' })
      : json({ ok: false, error: 'No email on file for this party. Add one in CRM or pass "to".' }, 422);
  }

  const { data: fs } = await db.from('finance_settings').select('business_name').eq('workspace_id', doc.workspace_id).maybeSingle();
  const sender = fs?.business_name || 'our company';
  const number = String((kind === 'credit_note' ? doc.credit_note_number : kind === 'delivery_note' ? doc.delivery_note_number : doc.order_number) ?? '');
  const label = kind === 'credit_note' ? 'Credit note' : kind === 'delivery_note' ? 'Delivery note' : isPo ? 'Purchase order' : 'Order confirmation';

  let viewUrl = '';
  const { data: token, error: tokenErr } = await db.rpc('mint_document_share_token', { p_kind: kind, p_id: id });
  if (tokenErr) console.warn('[finance-send-document-email] link skipped:', tokenErr.message);
  if (token) viewUrl = `${(Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr').replace(/\/$/, '')}/d/${token}`;

  let attachments: Array<{ filename: string; content: string }> | undefined;
  if (kind !== 'order') {
    try {
      const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/finance-invoice-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
        body: JSON.stringify({ [`${kind}_id`]: id }),
      });
      const out = await r.json().catch(() => ({}));
      if (out?.pdf_storage_path) {
        const { data: file } = await db.storage.from('pdf-documents').download(out.pdf_storage_path);
        if (file) {
          attachments = [{
            filename: `${kind === 'credit_note' ? 'credit-note' : 'delivery-note'}-${number}.pdf`,
            content: encodeBase64(new Uint8Array(await file.arrayBuffer())),
          }];
        }
      }
    } catch (e) {
      console.warn('[finance-send-document-email] PDF attach skipped', e);
    }
  }

  const money = (n: unknown) => esc(formatMoney(Number(n ?? 0), doc.currency ?? 'EUR'));
  const rows = [
    invoiceNumber ? `<tr><td style="padding:4px 16px 4px 0;color:#666">For invoice</td><td style="padding:4px 0">${esc(invoiceNumber)}</td></tr>` : '',
    kind === 'credit_note'
      ? `<tr><td style="padding:4px 16px 4px 0;color:#666">Credited</td><td style="padding:4px 0;font-weight:600">${money(doc.total ?? doc.amount)}</td></tr>`
      : '',
    kind === 'order'
      ? `<tr><td style="padding:4px 16px 4px 0;color:#666">Total</td><td style="padding:4px 0;font-weight:600">${money(doc.total)}</td></tr>`
      : '',
    doc.transport_date ? `<tr><td style="padding:4px 16px 4px 0;color:#666">Transport date</td><td style="padding:4px 0">${esc(String(doc.transport_date).slice(0, 10))}</td></tr>` : '',
  ].join('');
  const intro = kind === 'order'
    ? (isPo ? `Please find our purchase order from <strong>${esc(sender)}</strong>.` : `Thank you for your order with <strong>${esc(sender)}</strong>. Here is its confirmation.`)
    : `Please find the ${label.toLowerCase()} from <strong>${esc(sender)}</strong>.`;
  const html = `
    <div style="font-family:'Open Sans',Arial,sans-serif;max-width:560px;margin:auto;color:#222">
      <h2 style="font-weight:600">${label} ${esc(number)}</h2>
      <p>Dear ${esc(party.name) || (isPo ? 'supplier' : 'customer')},</p>
      <p>${intro}</p>
      ${rows ? `<table style="margin:16px 0;border-collapse:collapse">${rows}</table>` : ''}
      ${viewUrl ? `<p style="margin:18px 0"><a href="${esc(viewUrl)}" style="display:inline-block;background:#7a1f5c;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:4px;font-weight:600">View online »</a></p>` : ''}
      ${doc.fiscal_mark ? `<p style="margin:4px 0;color:#666">myDATA MARK: <strong>${esc(doc.fiscal_mark)}</strong></p>` : ''}
      ${doc.fiscal_aade_qr_url ? `<p style="margin:12px 0"><a href="${esc(doc.fiscal_aade_qr_url)}" style="color:#7a1f5c">Verify on myDATA (government) »</a></p>` : ''}
      <p style="color:#999;font-size:12px;margin-top:24px">Sent via ${esc(sender)}.</p>
    </div>`;

  const { data: dispatch, error: dispatchErr } = await db.functions.invoke('email-api', {
    body: {
      action: 'send', to: email, subject: `${label} ${number} from ${sender}`, html,
      emailType: 'transactional', tags: { feature: `${kind}_email`, document_id: id, ...(kind === 'order' ? { order_id: id } : {}) },
      attachments, workspace_id: doc.workspace_id, requireWorkspaceSender: true,
      entityType: kind, entityId: id,
    },
  });
  if (dispatchErr || !(dispatch as any)?.success) {
    const ctx = (dispatchErr as any)?.context;
    const parsed = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) : null;
    if (parsed?.code === 'workspace_sender_required') return json({ ok: false, code: parsed.code, error: parsed.error }, 503);
    return json({ ok: false, error: parsed?.error ?? dispatchErr?.message ?? 'email send failed' }, 502);
  }
  return json({ ok: true, sent_to: email });
}));
