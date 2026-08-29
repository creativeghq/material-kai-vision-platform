/**
 * Accounting export bridges (γέφυρες λογιστικής). The Greek-accountant deliverable:
 * download every fiscal document over a date range as a flat journal the accountant imports
 * into their accounting suite (Epsilon / Softone / Megasoft all ingest CSV with a column map),
 * plus a myDATA-classification summary for the VAT return.
 *
 * Pure client-side aggregation over RLS-readable finance tables — the invited `accountant`
 * persona reaches it through Finance → Reports with no extra grant. No edge function,
 * no migration: the data already lives in invoices / credit_notes / supplier_bills /
 * supplier_credit_notes.
 */
import { supabase } from '@/integrations/supabase/client';
import { round2 } from '@/utils/decimal';

export interface JournalRow {
  date: string;            // YYYY-MM-DD
  kind: string;            // Invoice / Credit note / Supplier bill / Supplier credit note
  doc_type: string;        // myDATA type code (1.1, 5.1, …) or ''
  number: string;          // human document number
  series: string;
  counterpart: string;     // party display name
  counterpart_vat: string; // ΑΦΜ
  net: number;
  vat: number;
  total: number;
  rate: number | null;     // effective VAT rate (vat/net) for the summary
  mark: string;            // myDATA MARK / external mark
  status: string;
}

type PartyRef = { company_id?: string | null; contact_id?: string | null };

function inRange(from: string, to: string) {
  return { gte: `${from}T00:00:00`, lte: `${to}T23:59:59` };
}
const num = (v: any) => Number(v ?? 0);
const day = (iso: any) => (iso ? String(iso).slice(0, 10) : '');
const effRate = (net: number, vat: number) => (net > 0 ? Math.round((vat / net) * 100) : null);

/** Resolve party_id → {name, vat} for both companies and contacts in two batched reads. */
async function buildPartyLookup(refs: PartyRef[]): Promise<Map<string, { name: string; vat: string }>> {
  const companyIds = [...new Set(refs.map((r) => r.company_id).filter(Boolean) as string[])];
  const contactIds = [...new Set(refs.map((r) => r.contact_id).filter(Boolean) as string[])];
  const map = new Map<string, { name: string; vat: string }>();
  await Promise.all([
    companyIds.length
      ? supabase.from('crm_companies').select('id, name, vat_number').in('id', companyIds).then(({ data }) => {
          for (const c of data ?? []) map.set(`c:${(c as any).id}`, { name: (c as any).name ?? '', vat: (c as any).vat_number ?? '' });
        })
      : Promise.resolve(),
    contactIds.length
      ? supabase.from('crm_contacts').select('id, name, first_name, last_name, vat_number').in('id', contactIds).then(({ data }) => {
          for (const c of data ?? []) {
            const nm = (c as any).name || [(c as any).first_name, (c as any).last_name].filter(Boolean).join(' ');
            map.set(`p:${(c as any).id}`, { name: nm, vat: (c as any).vat_number ?? '' });
          }
        })
      : Promise.resolve(),
  ]);
  return map;
}
function partyOf(map: Map<string, { name: string; vat: string }>, ref: PartyRef): { name: string; vat: string } {
  if (ref.company_id) return map.get(`c:${ref.company_id}`) ?? { name: '', vat: '' };
  if (ref.contact_id) return map.get(`p:${ref.contact_id}`) ?? { name: '', vat: '' };
  return { name: 'Retail / Walk-in', vat: '' };
}

export const accountingExportService = {
  /** Sales journal — issued invoices/receipts + customer credit notes in the period. */
  async salesJournal(workspaceId: string, from: string, to: string): Promise<JournalRow[]> {
    const r = inRange(from, to);
    /**
     * BOTH reads are checked (#351 S6).
     *
     * This destructured `data` only. If the `invoices` read failed while `credit_notes` succeeded,
     * a month with €10,000 of sales exported as €0 of sales plus whatever credits existed — and it
     * was handed to an accountant as a complete journal. A short export is indistinguishable from
     * a quiet month.
     */
    const [invRes, cnRes] = await Promise.all([
      supabase.from('invoices')
        .select('document_type, internal_number, legal_number, series, customer_company_id, customer_contact_id, subtotal_net, vat_amount, total, fiscal_mark, fiscal_status, status, issued_at')
        .eq('workspace_id', workspaceId).not('issued_at', 'is', null)
        .gte('issued_at', r.gte).lte('issued_at', r.lte),
      supabase.from('credit_notes')
        .select('document_type, credit_note_number, series, invoice_id, subtotal_net, vat_amount, total, amount, fiscal_mark, fiscal_status, status, issued_at')
        .eq('workspace_id', workspaceId).not('issued_at', 'is', null)
        .gte('issued_at', r.gte).lte('issued_at', r.lte),
    ]);

    if (invRes.error) throw new Error(`Sales journal: the invoices could not be read (${invRes.error.message}). Nothing was exported.`);
    if (cnRes.error) throw new Error(`Sales journal: the credit notes could not be read (${cnRes.error.message}). Nothing was exported.`);
    const inv = invRes.data ?? [];
    const cns = cnRes.data ?? [];
    // Credit notes carry no direct counterpart — resolve via their source invoice.
    const invoiceById = new Map<string, any>();
    const srcIds = [...new Set(cns.map((c: any) => c.invoice_id).filter(Boolean))];
    if (srcIds.length) {
      // Checked too (#351 S6): a credit note whose source invoice could not be read loses its
      // counterparty, and an unnamed party on a VAT journal is a row an accountant cannot post.
      const { data: src, error: srcErr } = await supabase.from('invoices').select('id, customer_company_id, customer_contact_id').in('id', srcIds);
      if (srcErr) throw new Error(`Sales journal: a credit note's source invoice could not be read (${srcErr.message}). Nothing was exported.`);
      for (const s of src ?? []) invoiceById.set((s as any).id, s);
    }

    const refs: PartyRef[] = [
      ...inv.map((i: any) => ({ company_id: i.customer_company_id, contact_id: i.customer_contact_id })),
      ...cns.map((c: any) => { const s = invoiceById.get(c.invoice_id); return { company_id: s?.customer_company_id, contact_id: s?.customer_contact_id }; }),
    ];
    const parties = await buildPartyLookup(refs);

    const rows: JournalRow[] = [];
    for (const i of inv as any[]) {
      const p = partyOf(parties, { company_id: i.customer_company_id, contact_id: i.customer_contact_id });
      const net = num(i.subtotal_net), vat = num(i.vat_amount);
      rows.push({
        date: day(i.issued_at), kind: 'Invoice', doc_type: i.document_type ?? '',
        number: i.legal_number || i.internal_number || '', series: i.series ?? '',
        counterpart: p.name, counterpart_vat: p.vat, net, vat, total: num(i.total),
        rate: effRate(net, vat), mark: i.fiscal_mark ?? '', status: i.fiscal_status || i.status || '',
      });
    }
    for (const c of cns as any[]) {
      const s = invoiceById.get(c.invoice_id);
      const p = partyOf(parties, { company_id: s?.customer_company_id, contact_id: s?.customer_contact_id });
      const net = num(c.subtotal_net), vat = num(c.vat_amount);
      const total = num(c.total) || num(c.amount);
      rows.push({
        date: day(c.issued_at), kind: 'Credit note', doc_type: c.document_type ?? '5.1',
        number: c.credit_note_number ?? '', series: c.series ?? '',
        counterpart: p.name, counterpart_vat: p.vat, net: -net, vat: -vat, total: -total,
        rate: effRate(net, vat), mark: c.fiscal_mark ?? '', status: c.fiscal_status || c.status || '',
      });
    }
    return rows.sort((a, b) => a.date.localeCompare(b.date));
  },

  /** Purchases journal — supplier bills + supplier credit notes in the period. */
  async purchasesJournal(workspaceId: string, from: string, to: string): Promise<JournalRow[]> {
    const r = inRange(from, to);
    // Same rule as the sales journal above (#351 S6): a purchase journal missing its bills is a
    // VAT return missing its input tax.
    const [billRes, scnRes] = await Promise.all([
      supabase.from('supplier_bills')
        .select('supplier_bill_number, supplier_company_id, supplier_contact_id, subtotal_net, vat_amount, total, status, issued_at')
        .eq('workspace_id', workspaceId).not('issued_at', 'is', null)
        .gte('issued_at', r.gte).lte('issued_at', r.lte),
      supabase.from('supplier_credit_notes')
        .select('supplier_credit_note_number, supplier_company_id, supplier_contact_id, subtotal_net, vat_amount, total, external_mark, status, issued_at')
        .eq('workspace_id', workspaceId).not('issued_at', 'is', null)
        .gte('issued_at', r.gte).lte('issued_at', r.lte),
    ]);

    if (billRes.error) throw new Error(`Purchases journal: the supplier bills could not be read (${billRes.error.message}). Nothing was exported.`);
    if (scnRes.error) throw new Error(`Purchases journal: the supplier credit notes could not be read (${scnRes.error.message}). Nothing was exported.`);
    const b = billRes.data ?? [], s = scnRes.data ?? [];
    const parties = await buildPartyLookup([
      ...b.map((x: any) => ({ company_id: x.supplier_company_id, contact_id: x.supplier_contact_id })),
      ...s.map((x: any) => ({ company_id: x.supplier_company_id, contact_id: x.supplier_contact_id })),
    ]);

    const rows: JournalRow[] = [];
    for (const x of b as any[]) {
      const p = partyOf(parties, { company_id: x.supplier_company_id, contact_id: x.supplier_contact_id });
      const net = num(x.subtotal_net), vat = num(x.vat_amount);
      rows.push({
        date: day(x.issued_at), kind: 'Supplier bill', doc_type: '', number: x.supplier_bill_number ?? '', series: '',
        counterpart: p.name, counterpart_vat: p.vat, net, vat, total: num(x.total),
        rate: effRate(net, vat), mark: '', status: x.status ?? '',
      });
    }
    for (const x of s as any[]) {
      const p = partyOf(parties, { company_id: x.supplier_company_id, contact_id: x.supplier_contact_id });
      const net = num(x.subtotal_net), vat = num(x.vat_amount);
      rows.push({
        date: day(x.issued_at), kind: 'Supplier credit note', doc_type: '', number: x.supplier_credit_note_number ?? '', series: '',
        counterpart: p.name, counterpart_vat: p.vat, net: -net, vat: -vat, total: -num(x.total),
        rate: effRate(net, vat), mark: x.external_mark ?? '', status: x.status ?? '',
      });
    }
    return rows.sort((a, b2) => a.date.localeCompare(b2.date));
  },

  /** myDATA-classification summary — net + VAT grouped by section × effective rate. */
  summarize(sales: JournalRow[], purchases: JournalRow[]): { section: string; rate: string; net: number; vat: number; docs: number }[] {
    const acc = new Map<string, { section: string; rate: string; net: number; vat: number; docs: number }>();
    const add = (section: string, rows: JournalRow[]) => {
      for (const row of rows) {
        const rate = row.rate == null ? 'mixed/0' : `${row.rate}%`;
        const key = `${section}|${rate}`;
        const e = acc.get(key) ?? { section, rate, net: 0, vat: 0, docs: 0 };
        e.net += row.net; e.vat += row.vat; e.docs += 1;
        acc.set(key, e);
      }
    };
    add('Sales (output)', sales);
    add('Purchases (input)', purchases);
    return [...acc.values()].map((e) => ({ ...e, net: round2(e.net), vat: round2(e.vat) }));
  },
};


// ── CSV helpers ────────────────────────────────────────────────────────────
function csvCell(v: any): string {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(headers: string[], rows: (string | number)[][]): string {
  // Prefix BOM so Excel (the tool most Greek accountants open these in) reads UTF-8 + Greek.
  const lines = [headers, ...rows].map((r) => r.map(csvCell).join(','));
  return '﻿' + lines.join('\r\n');
}
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

export function journalToCsv(rows: JournalRow[]): string {
  return toCsv(
    ['Date', 'Kind', 'myDATA type', 'Number', 'Series', 'Counterpart', 'VAT No', 'Net', 'VAT', 'Total', 'Rate %', 'MARK', 'Status'],
    rows.map((r) => [r.date, r.kind, r.doc_type, r.number, r.series, r.counterpart, r.counterpart_vat,
      r.net.toFixed(2), r.vat.toFixed(2), r.total.toFixed(2), r.rate ?? '', r.mark, r.status]),
  );
}
