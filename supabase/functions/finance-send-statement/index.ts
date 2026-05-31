// deno-lint-ignore-file no-explicit-any
import { createClient } from '@supabase/supabase-js';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';

// Sales/Finance — render and email a party (customer or supplier) statement PDF.
//
// The PDF lists every open invoice (AR) or bill (AP) plus paid/credited history,
// shows the running balance, and is mailed via the platform email-api edge function.
// Admin-only. Requires finance_settings.statements_enabled = true.
//
// Body: { party_type: 'company'|'contact', party_id, email?, dry_run? }

interface ReqBody {
  party_type: 'company' | 'contact';
  party_id: string;
  email?: string;
  dry_run?: boolean;
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 50;
const COLOR_DARK = rgb(0.1, 0.1, 0.18);
const COLOR_GRAY = rgb(0.42, 0.42, 0.42);
const COLOR_RED = rgb(0.78, 0.18, 0.18);
const COLOR_ACCENT = rgb(0.55, 0.27, 0.45);

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function fmtMoney(value: number, currency = 'EUR'): string {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value || 0);
}

async function loadBackdrop(url: string): Promise<Uint8Array | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const auth = await authenticate(req, {
      requireUser: true,
      allowedRoles: ['admin', 'super_admin', 'owner', 'finance'],
    });
    if (!auth.success) return json({ error: auth.error ?? 'Unauthorized' }, 401);

    const body = (await req.json()) as ReqBody;
    if (!body.party_type || !body.party_id) {
      return json({ error: 'party_type and party_id are required' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // 1. Resolve party row (display name, email, workspace)
    const { data: party, error: partyErr } = await supabase
      .from('vw_finance_parties')
      .select('*')
      .eq('party_type', body.party_type)
      .eq('party_id', body.party_id)
      .maybeSingle();
    if (partyErr || !party) return json({ error: `Party not found: ${partyErr?.message ?? body.party_id}` }, 404);

    // 2. Verify statements are enabled for this workspace
    const { data: settings } = await supabase
      .from('finance_settings')
      .select('*')
      .eq('workspace_id', party.workspace_id)
      .maybeSingle();
    if (!settings?.statements_enabled) {
      return json({ error: 'Statement sending is disabled in finance settings.' }, 409);
    }

    // 3. Load invoices (AR) + bills (AP)
    const invoicesP = body.party_type === 'company'
      ? supabase.from('invoices').select('*').eq('customer_company_id', body.party_id).order('issued_at', { ascending: false, nullsFirst: false })
      : supabase.from('invoices').select('*').eq('customer_contact_id', body.party_id).order('issued_at', { ascending: false, nullsFirst: false });
    const billsP = body.party_type === 'company'
      ? supabase.from('supplier_bills').select('*').eq('supplier_company_id', body.party_id).order('issued_at', { ascending: false, nullsFirst: false })
      : supabase.from('supplier_bills').select('*').eq('supplier_contact_id', body.party_id).order('issued_at', { ascending: false, nullsFirst: false });
    const [invs, bills] = await Promise.all([invoicesP, billsP]);
    const invoices = invs.data ?? [];
    const supplierBills = bills.data ?? [];

    // Mint pay tokens for every open invoice so the email body can link directly.
    // We do this in-line rather than via the mint_invoice_pay_token RPC because the
    // RPC role-gates on the caller; here the service role acts on behalf of the workspace.
    const publicAppUrl = (Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr').replace(/\/$/, '');
    const payLinks = new Map<string, string>();
    const openInvoices = invoices.filter((i: any) =>
      Number(i.amount_due || 0) > 0
      && i.status !== 'void'
      && i.status !== 'credit_noted',
    );
    for (const inv of openInvoices) {
      // Skip if a non-expired token already exists
      if (inv.pay_token && (!inv.pay_token_expires_at || new Date(inv.pay_token_expires_at) > new Date())) {
        payLinks.set(inv.id, `${publicAppUrl}/pay/${inv.pay_token}`);
        continue;
      }
      const token = Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, '0')).join('');
      const expires = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString();
      const { error: tkErr } = await supabase
        .from('invoices')
        .update({ pay_token: token, pay_token_expires_at: expires })
        .eq('id', inv.id);
      if (!tkErr) payLinks.set(inv.id, `${publicAppUrl}/pay/${token}`);
    }

    // 4. Build PDF
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

    // Optional cover backdrop from settings
    let backdrop = null;
    if (settings.statement_template_cover_path) {
      const { data: urlData } = await supabase.storage
        .from('quote-templates')
        .createSignedUrl(settings.statement_template_cover_path, 60);
      if (urlData?.signedUrl) {
        const bytes = await loadBackdrop(urlData.signedUrl);
        if (bytes) {
          try { backdrop = await pdf.embedPng(bytes); }
          catch { try { backdrop = await pdf.embedJpg(bytes); } catch { /* ignore */ } }
        }
      }
    }

    const drawBackdrop = (page: PDFPage) => {
      if (backdrop) {
        page.drawImage(backdrop, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
      }
    };

    const issuedToday = new Date().toLocaleDateString();
    let page = pdf.addPage([PAGE_W, PAGE_H]);
    drawBackdrop(page);
    let y = PAGE_H - MARGIN - 30;

    // Header
    page.drawText('ACCOUNT STATEMENT', { x: MARGIN, y, size: 22, font: bold, color: COLOR_DARK });
    y -= 28;
    page.drawText(`To: ${party.display_name ?? ''}`, { x: MARGIN, y, size: 11, font, color: COLOR_GRAY });
    y -= 14;
    page.drawText(`Statement date: ${issuedToday}`, { x: MARGIN, y, size: 10, font, color: COLOR_GRAY });
    y -= 14;
    if (party.email) {
      page.drawText(`Email on file: ${party.email}`, { x: MARGIN, y, size: 10, font, color: COLOR_GRAY });
      y -= 14;
    }

    // Summary boxes
    y -= 18;
    const drawSummaryRow = (label: string, value: string, color = COLOR_DARK) => {
      page.drawText(label, { x: MARGIN, y, size: 10, font, color: COLOR_GRAY });
      page.drawText(value, { x: PAGE_W - MARGIN - 120, y, size: 11, font: bold, color });
      y -= 14;
    };
    drawSummaryRow('Total invoiced (lifetime)', fmtMoney(Number(party.invoiced_total || 0)));
    drawSummaryRow('Total paid to us', fmtMoney(Number(party.receivable_paid_total || 0)));
    drawSummaryRow('Outstanding (you owe us)', fmtMoney(Number(party.receivable_outstanding || 0)), COLOR_RED);
    drawSummaryRow('Total billed by you', fmtMoney(Number(party.billed_total || 0)));
    drawSummaryRow('Total paid by us', fmtMoney(Number(party.payable_paid_total || 0)));
    drawSummaryRow('Outstanding (we owe you)', fmtMoney(Number(party.payable_outstanding || 0)), COLOR_ACCENT);

    // Invoices table
    const drawTableHeader = (cols: string[]) => {
      y -= 18;
      const x0 = MARGIN;
      const widths = [80, 80, 80, 80, 80, 80];
      cols.forEach((c, i) => {
        page.drawText(c, { x: x0 + widths.slice(0, i).reduce((a, b) => a + b, 0), y, size: 9, font: bold, color: COLOR_DARK });
      });
      y -= 12;
      page.drawLine({ start: { x: MARGIN, y: y + 6 }, end: { x: PAGE_W - MARGIN, y: y + 6 }, thickness: 0.5, color: COLOR_GRAY });
    };

    const drawRow = (cells: string[]) => {
      if (y < MARGIN + 60) {
        page = pdf.addPage([PAGE_W, PAGE_H]);
        drawBackdrop(page);
        y = PAGE_H - MARGIN - 20;
      }
      const x0 = MARGIN;
      const widths = [80, 80, 80, 80, 80, 80];
      cells.forEach((c, i) => {
        page.drawText(c, { x: x0 + widths.slice(0, i).reduce((a, b) => a + b, 0), y, size: 9, font, color: COLOR_DARK });
      });
      y -= 12;
    };

    if (invoices.length > 0) {
      y -= 18;
      page.drawText('RECEIVABLES', { x: MARGIN, y, size: 13, font: bold, color: COLOR_DARK });
      drawTableHeader(['Number', 'Issued', 'Due', 'Total', 'Paid', 'Outstanding']);
      for (const inv of invoices) {
        drawRow([
          inv.internal_number,
          inv.issued_at ? new Date(inv.issued_at).toLocaleDateString() : '—',
          inv.due_at ?? '—',
          fmtMoney(Number(inv.total || 0), inv.currency),
          fmtMoney(Number(inv.amount_paid || 0), inv.currency),
          fmtMoney(Number(inv.amount_due || 0), inv.currency),
        ]);
      }

      // Quick-pay links section (one link per open invoice)
      const linkedOpen = openInvoices.filter((i: any) => payLinks.has(i.id));
      if (linkedOpen.length > 0) {
        y -= 16;
        if (y < MARGIN + 60) { page = pdf.addPage([PAGE_W, PAGE_H]); drawBackdrop(page); y = PAGE_H - MARGIN - 20; }
        page.drawText('PAY BY CARD', { x: MARGIN, y, size: 11, font: bold, color: COLOR_ACCENT });
        y -= 14;
        for (const inv of linkedOpen) {
          const url = payLinks.get(inv.id)!;
          const label = `${inv.internal_number}: ${fmtMoney(Number(inv.amount_due || 0), inv.currency)}`;
          page.drawText(label, { x: MARGIN, y, size: 9, font, color: COLOR_DARK });
          page.drawText(url, { x: MARGIN + 200, y, size: 8, font, color: COLOR_ACCENT });
          y -= 12;
          if (y < MARGIN + 40) { page = pdf.addPage([PAGE_W, PAGE_H]); drawBackdrop(page); y = PAGE_H - MARGIN - 20; }
        }
      }
    }

    if (supplierBills.length > 0) {
      y -= 18;
      if (y < MARGIN + 80) { page = pdf.addPage([PAGE_W, PAGE_H]); drawBackdrop(page); y = PAGE_H - MARGIN - 20; }
      page.drawText('PAYABLES (bills you sent us)', { x: MARGIN, y, size: 13, font: bold, color: COLOR_DARK });
      drawTableHeader(['Bill #', 'Issued', 'Due', 'Total', 'Paid', 'Outstanding']);
      for (const b of supplierBills) {
        drawRow([
          b.supplier_bill_number ?? '—',
          b.issued_at ?? '—',
          b.due_at ?? '—',
          fmtMoney(Number(b.total || 0), b.currency),
          fmtMoney(Number(b.amount_paid || 0), b.currency),
          fmtMoney(Number(b.amount_due || 0), b.currency),
        ]);
      }
    }

    // Footer
    if (y < MARGIN + 30) { page = pdf.addPage([PAGE_W, PAGE_H]); drawBackdrop(page); y = PAGE_H - MARGIN - 20; }
    y -= 20;
    page.drawText('Please reply to this email with any questions or to confirm settlement.', {
      x: MARGIN, y, size: 9, font, color: COLOR_GRAY,
    });

    const pdfBytes = await pdf.save();

    // 5. Upload to storage (signed URL valid 7 days)
    const objectPath = `statements/${party.workspace_id}/${body.party_type}-${body.party_id}-${Date.now()}.pdf`;
    const { error: upErr } = await supabase.storage.from('pdf-documents').upload(objectPath, pdfBytes, {
      contentType: 'application/pdf',
      upsert: false,
    });
    if (upErr) return json({ error: `Storage upload failed: ${upErr.message}` }, 500);

    const { data: signed } = await supabase.storage.from('pdf-documents').createSignedUrl(objectPath, 60 * 60 * 24 * 7);
    const pdfUrl = signed?.signedUrl ?? null;

    const targetEmail = body.email ?? party.email;
    if (!targetEmail) {
      return json({
        ok: true,
        email_sent_to: null,
        pdf_url: pdfUrl,
        lines: invoices.length + supplierBills.length,
        total_outstanding: Number(party.receivable_outstanding || 0),
        note: 'No email on file; PDF was generated and stored but not sent.',
      });
    }

    if (body.dry_run) {
      return json({
        ok: true,
        email_sent_to: null,
        pdf_url: pdfUrl,
        lines: invoices.length + supplierBills.length,
        total_outstanding: Number(party.receivable_outstanding || 0),
        note: 'dry_run: PDF generated, not emailed.',
      });
    }

    // 6. Email via email-api
    const subject = settings.statement_email_subject ?? 'Your account statement';
    const bodyText = settings.statement_email_body
      ?? `Please find your account statement attached. Total outstanding: ${fmtMoney(Number(party.receivable_outstanding || 0))}.`;
    const payLinksHtml = openInvoices.length > 0 ? `
      <table style="width:100%; border-collapse:collapse; margin: 16px 0;">
        <thead><tr style="background:#f3f3f3;">
          <th style="text-align:left; padding:8px; font-size:12px;">Invoice</th>
          <th style="text-align:right; padding:8px; font-size:12px;">Due</th>
          <th style="text-align:right; padding:8px; font-size:12px;">Pay by card</th>
        </tr></thead>
        <tbody>
          ${openInvoices.map((i: any) => `
            <tr>
              <td style="padding:8px; font-family:monospace; font-size:12px;">${i.internal_number}</td>
              <td style="padding:8px; text-align:right; font-size:12px;">${fmtMoney(Number(i.amount_due || 0), i.currency)}</td>
              <td style="padding:8px; text-align:right;">
                ${payLinks.get(i.id) ? `<a href="${payLinks.get(i.id)}" style="background:#883366; color:white; padding:6px 12px; border-radius:6px; text-decoration:none; font-size:12px;">Pay now</a>` : '—'}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : '';

    const html = `
      <div style="font-family: system-ui, sans-serif; max-width: 600px;">
        <p>Hello ${party.display_name ?? ''},</p>
        <p>${bodyText.replace(/\n/g, '<br>')}</p>
        ${payLinksHtml}
        <p><a href="${pdfUrl}">Download full PDF statement</a></p>
        <p style="color: #666; font-size: 12px; margin-top: 32px;">This statement was generated on ${issuedToday}. Pay links expire after 90 days.</p>
      </div>
    `;

    const { data: dispatch, error: dispatchErr } = await supabase.functions.invoke('email-api', {
      body: {
        action: 'send',
        to: targetEmail,
        subject,
        html,
        emailType: 'transactional',
        tags: { feature: 'finance_statement', party_type: body.party_type, party_id: body.party_id },
      },
    });

    if (dispatchErr || !(dispatch as any)?.success) {
      return json({
        ok: false,
        email_sent_to: null,
        pdf_url: pdfUrl,
        lines: invoices.length + supplierBills.length,
        total_outstanding: Number(party.receivable_outstanding || 0),
        error: dispatchErr?.message ?? (dispatch as any)?.error ?? 'email send failed',
      });
    }

    return json({
      ok: true,
      email_sent_to: targetEmail,
      pdf_url: pdfUrl,
      lines: invoices.length + supplierBills.length,
      total_outstanding: Number(party.receivable_outstanding || 0),
    });
  } catch (err: any) {
    console.error('finance-send-statement error', err);
    return json({ error: err?.message ?? 'Internal error' }, 500);
  }
});
