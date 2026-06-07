// Email an invoice to its customer (the "Send Email" document action, #204/#6).
// Sends a summary + the myDATA MARK / QR link via the platform email-api. Auth: finance.
import { createClient } from '@supabase/supabase-js';
import { encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const money = (v: number, c: string) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: c || 'EUR' }).format(v);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = await authenticate(req, { requireUser: true, allowedRoles: ['admin', 'super_admin', 'owner', 'finance'] });
  if (!auth.success) return json({ error: auth.error ?? 'Unauthorized' }, 401);

  const { invoice_id, to } = await req.json().catch(() => ({}));
  if (!invoice_id) return json({ error: 'invoice_id is required' }, 400);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  const { data: inv } = await supabase.from('invoices').select('*').eq('id', invoice_id).single();
  if (!inv) return json({ error: 'invoice not found' }, 404);

  // Resolve the recipient.
  let email: string | null = to ?? null;
  let name = '';
  if (!email) {
    if (inv.customer_company_id) {
      const { data: c } = await supabase.from('crm_companies').select('name, email').eq('id', inv.customer_company_id).maybeSingle();
      email = c?.email ?? null; name = c?.name ?? '';
    } else if (inv.customer_contact_id) {
      const { data: c } = await supabase.from('crm_contacts').select('name, email').eq('id', inv.customer_contact_id).maybeSingle();
      email = c?.email ?? null; name = c?.name ?? '';
    }
  }
  if (!email) return json({ ok: false, error: 'No customer email on file. Add one in CRM or pass "to".' }, 422);

  const { data: fs } = await supabase.from('finance_settings').select('business_name').eq('workspace_id', inv.workspace_id).maybeSingle();
  const sender = fs?.business_name || 'our company';
  const number = inv.legal_number || inv.internal_number;
  const total = money(Number(inv.total ?? 0), inv.currency);
  const mark = inv.fiscal_mark ? `<p style="margin:4px 0;color:#666">myDATA MARK: <strong>${inv.fiscal_mark}</strong></p>` : '';
  const qr = inv.fiscal_qr_url ? `<p style="margin:12px 0"><a href="${inv.fiscal_qr_url}" style="color:#7a1f5c">View / verify the invoice »</a></p>` : '';

  // Generate (or reuse) the invoice PDF and attach it — best-effort, forwarding the
  // caller's auth to the finance-invoice-pdf function.
  let attachments: Array<{ filename: string; content: string }> | undefined;
  try {
    let pdfPath = inv.pdf_storage_path as string | null;
    const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/finance-invoice-pdf`, {
      method: 'POST',
      headers: {
        'Authorization': req.headers.get('Authorization') ?? '',
        'apikey': Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ invoice_id }),
    });
    const j = await r.json().catch(() => ({}));
    if (j?.pdf_storage_path) pdfPath = j.pdf_storage_path;
    if (pdfPath) {
      const { data: file } = await supabase.storage.from('pdf-documents').download(pdfPath);
      if (file) {
        const buf = new Uint8Array(await file.arrayBuffer());
        attachments = [{ filename: `invoice-${number}.pdf`, content: encodeBase64(buf) }];
      }
    }
  } catch (e) {
    console.warn('invoice PDF attach skipped', e);
  }

  const subject = `Invoice ${number} from ${sender}`;
  const html = `
    <div style="font-family:system-ui,Arial,sans-serif;max-width:560px;margin:auto;color:#222">
      <h2 style="font-weight:600">Invoice ${number}</h2>
      <p>Dear ${name || 'customer'},</p>
      <p>Please find your invoice from <strong>${sender}</strong>.</p>
      <table style="margin:16px 0;border-collapse:collapse">
        <tr><td style="padding:4px 16px 4px 0;color:#666">Total</td><td style="padding:4px 0;font-weight:600">${total}</td></tr>
        ${inv.due_at ? `<tr><td style="padding:4px 16px 4px 0;color:#666">Due</td><td style="padding:4px 0">${inv.due_at}</td></tr>` : ''}
      </table>
      ${mark}
      ${qr}
      <p style="color:#999;font-size:12px;margin-top:24px">Sent via ${sender}.</p>
    </div>`;

  const { data: dispatch, error: dispatchErr } = await supabase.functions.invoke('email-api', {
    body: { action: 'send', to: email, subject, html, emailType: 'transactional', tags: { feature: 'invoice_email', invoice_id }, attachments },
  });
  if (dispatchErr || !(dispatch as any)?.success) {
    return json({ ok: false, error: dispatchErr?.message ?? 'email send failed' }, 502);
  }
  return json({ ok: true, sent_to: email });
});
