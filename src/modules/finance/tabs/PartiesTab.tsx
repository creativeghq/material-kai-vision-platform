import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, FileText, Receipt, Printer, BookOpen, Coins, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { escapeHtml } from '@/utils/escapeHtml';
import { Button } from '@/components/core/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/core/ui/dialog';
import {
  financeService, formatMoney, type PartyRow, type Invoice, type SupplierBill, type Payment, type PartyLedgerRow, type CustomerAgingBuckets,
} from '@/modules/finance/services/financeService';
import { PartyAccountSummary } from '@/modules/finance/components/CustomerFinanceTabs';
import { StatementActions } from '@/modules/finance/components/StatementActions';
import { humanizeLabel } from '@/utils/humanize';
import { TablePagination, paginate, clampPage, TABLE_PAGE_SIZE } from '@/components/core/ui/table-pagination';
import { FilterBar, NONE_VALUE, useFilters, type FilterGroupDef } from '@/components/core/filters';

const LEDGER_KIND_LABEL: Record<string, string> = {
  invoice: 'Invoice', credit_note: 'Credit note', payment: 'Payment', receipt: 'Receipt',
  supplier_bill: 'Supplier bill', supplier_credit_note: 'Supplier credit note',
  manual_receivable: 'Receivable (un-invoiced)', manual_payable: 'Payable (un-invoiced)',
};

const SEGMENT_LABELS: Record<string, string> = {
  b2b: 'B2B', retail: 'Retail', wholesale: 'Wholesale', public_sector: 'Public sector',
};

type PartyRole = 'customer' | 'supplier' | 'both';

/**
 * `role` carries NO accessor on purpose — it is pushed down to `listParties({role})` and
 * re-fetches, so `applyFilters` must pass it through instead of matching it again in memory.
 * Everything else narrows the loaded page client-side.
 */
function buildPartyFilters(rows: PartyRow[]): FilterGroupDef[] {
  const bound = (pick: (r: PartyRow) => number) => {
    const max = rows.reduce((m, r) => Math.max(m, Number(pick(r)) || 0), 0);
    return { min: 0, max: Math.max(Math.ceil(max / 10) * 10, 10) };
  };
  const receivable = bound((r) => r.receivable_outstanding);
  const payable = bound((r) => r.payable_outstanding);

  return [
    {
      key: 'general', label: 'General', icon: Users,
      fields: [
        {
          key: 'q', type: 'text', label: 'Search', placeholder: 'Name or email',
          accessor: (r: PartyRow) => [r.display_name, r.email],
        },
        {
          key: 'role', type: 'select', label: 'Role',
          description: 'Applied server-side — changing it reloads the list.',
          options: [
            { value: 'customer', label: 'Customers' },
            { value: 'supplier', label: 'Suppliers' },
            { value: 'both', label: 'Both (customer + supplier)' },
          ],
        },
        {
          key: 'segment', type: 'multi', label: 'Segment',
          options: [
            ...Object.entries(SEGMENT_LABELS).map(([value, label]) => ({ value, label })),
            { value: NONE_VALUE, label: 'Unsegmented' },
          ],
          accessor: (r: PartyRow) => r.contact_group ?? undefined,
        },
        {
          key: 'over_limit', type: 'bool', label: 'Credit limit',
          description: 'Outstanding receivable exceeds the party’s credit limit.',
          trueLabel: 'Over credit limit', falseLabel: 'Within credit limit',
          accessor: (r: PartyRow) => r.over_credit_limit,
        },
      ],
    },
    {
      key: 'balances', label: 'Balances', icon: Coins,
      fields: [
        {
          key: 'receivable_outstanding', type: 'range', label: 'They owe us',
          min: receivable.min, max: receivable.max, accessor: (r: PartyRow) => r.receivable_outstanding,
        },
        {
          key: 'payable_outstanding', type: 'range', label: 'We owe them',
          min: payable.min, max: payable.max, accessor: (r: PartyRow) => r.payable_outstanding,
        },
      ],
    },
  ];
}

interface Props { workspaceId: string; statementsEnabled: boolean; autoOpenParty?: string | null; financeBase?: string }

export const PartiesTab: React.FC<Props> = ({ workspaceId, statementsEnabled, autoOpenParty, financeBase }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<PartyRow[]>([]);
  const [agingMap, setAgingMap] = useState<Record<string, CustomerAgingBuckets>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PartyRow | null>(null);
  const [page, setPage] = useState(1);

  const filterGroups = useMemo(() => buildPartyFilters(rows), [rows]);
  const { values: filterValues, setValues: setFilterValues, filtered, previewCount } =
    useFilters<PartyRow>(rows, filterGroups);
  // The only server-side dimension: it changes what we fetch, not how we filter what we hold.
  const role = (filterValues.role as PartyRole | undefined) ?? 'all';

  useEffect(() => { void load(); }, [workspaceId, role]);

  // Deep-link from another surface (e.g. the CRM Account tab → "View ledger in Finance")
  // pre-opens that party's drill-down once the list has loaded.
  useEffect(() => {
    if (!autoOpenParty || rows.length === 0) return;
    const [t, id] = autoOpenParty.split(':');
    const match = rows.find((r) => r.party_type === t && r.party_id === id);
    if (match) setSelected(match);
  }, [autoOpenParty, rows]);

  const load = async () => {
    try {
      setLoading(true);
      const [r, aging] = await Promise.all([
        financeService.listParties({ workspaceId, role }),
        financeService.getCustomerAgingBuckets({ workspaceId }),
      ]);
      setRows(r);
      const map: Record<string, CustomerAgingBuckets> = {};
      for (const a of aging) {
        const key = a.customer_company_id ? `company:${a.customer_company_id}` : a.customer_contact_id ? `contact:${a.customer_contact_id}` : null;
        if (key) map[key] = a;
      }
      setAgingMap(map);
    } catch (err: any) {
      toast({ title: 'Failed to load parties', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Any filter change narrows the list — start the narrowed set at its first page.
  useEffect(() => { setPage(1); }, [filterValues]);
  // …and clamp on reload so a shrunken list can't leave an empty page showing.
  useEffect(() => { setPage((p) => clampPage(p, filtered.length)); }, [filtered.length]);

  const agingFor = (r: PartyRow) => agingMap[`${r.party_type}:${r.party_id}`];

  const totals = useMemo(() => {
    let rcv = 0, pay = 0, due_0_30 = 0, due_31_90 = 0, due_90_plus = 0;
    for (const r of filtered) {
      rcv += Number(r.receivable_outstanding || 0);
      pay += Number(r.payable_outstanding || 0);
      const a = agingMap[`${r.party_type}:${r.party_id}`];
      if (a) { due_0_30 += Number(a.due_0_30); due_31_90 += Number(a.due_31_90); due_90_plus += Number(a.due_90_plus); }
    }
    return { rcv, pay, due_0_30, due_31_90, due_90_plus };
  }, [filtered, agingMap]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Card className="dashboard-card border-0"><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">Total customers owe</div>
          <div className={`text-lg font-semibold ${totals.rcv > 0 ? 'text-destructive' : ''}`}>{formatMoney(totals.rcv)}</div>
        </CardContent></Card>
        <Card className="dashboard-card border-0" title="Outstanding due within the last 30 days"><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">Overdue 1–30 days</div>
          <div className="text-lg font-semibold">{formatMoney(totals.due_0_30)}</div>
        </CardContent></Card>
        <Card className="dashboard-card border-0" title="Outstanding 31–90 days past due"><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">Overdue 31–90 days</div>
          <div className={`text-lg font-semibold ${totals.due_31_90 > 0 ? 'text-amber-500' : ''}`}>{formatMoney(totals.due_31_90)}</div>
        </CardContent></Card>
        <Card className="dashboard-card border-0" title="Outstanding more than 90 days past due"><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">Overdue 90+ days</div>
          <div className={`text-lg font-semibold ${totals.due_90_plus > 0 ? 'text-destructive' : ''}`}>{formatMoney(totals.due_90_plus)}</div>
        </CardContent></Card>
        <Card className="dashboard-card border-0"><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">We owe suppliers</div>
          <div className="text-lg font-semibold">{formatMoney(totals.pay)}</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="border-b border-border/60 px-5 py-3 flex-row items-center justify-between gap-3 flex-wrap space-y-0">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4" /> Customers &amp; Suppliers
            <span className="text-[10px] font-normal text-muted-foreground">· finance activity</span>
          </CardTitle>
          <FilterBar
            groups={filterGroups}
            values={filterValues}
            onChange={setFilterValues}
            previewCount={previewCount}
            searchPlaceholder="Name or email"
            title="Filter parties"
          />
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">No parties match.</div>
          ) : (
            <>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="px-4 py-2 text-left">Party</th>
                  <th className="px-4 py-2 text-left">Role</th>
                  <th className="px-4 py-2 text-right">Invoiced</th>
                  <th className="px-4 py-2 text-right">They owe us</th>
                  <th className="px-4 py-2 text-right">We owe them</th>
                  <th className="px-4 py-2 text-right">Net</th>
                  <th className="px-4 py-2 text-right" />
                </tr>
              </thead>
              <tbody>
                {paginate(filtered, page).map((r) => (
                  <tr key={`${r.party_type}-${r.party_id}`} className="border-b border-border/30 hover:bg-muted/30 cursor-pointer" onClick={() => setSelected(r)}>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{r.display_name}</span>
                        {r.over_credit_limit && (
                          <span className="text-[10px] font-medium text-destructive" title={`Outstanding ${formatMoney(Number(r.receivable_outstanding || 0))} exceeds credit limit ${formatMoney(Number(r.credit_limit || 0))}`}>Over limit</span>
                        )}
                      </div>
                      {r.email && <div className="text-[10px] text-muted-foreground">{r.email}</div>}
                    </td>
                    {/* Roles as plain words (colour on the text, not a pill background) — Customer /
                        Supplier read at a glance without the tag look. Segment trails in muted text. */}
                    <td className="px-4 py-2">
                      <span className="text-xs">
                        {r.is_customer && <span className="text-emerald-600 dark:text-emerald-400">Customer</span>}
                        {r.is_customer && r.is_supplier && <span className="text-muted-foreground"> · </span>}
                        {r.is_supplier && <span className="text-sky-600 dark:text-sky-400">Supplier</span>}
                        {!r.is_customer && !r.is_supplier && <span className="text-muted-foreground">—</span>}
                        {r.contact_group && <span className="text-muted-foreground"> · {SEGMENT_LABELS[r.contact_group] ?? r.contact_group}</span>}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">{formatMoney(Number(r.invoiced_total || 0))}</td>
                    <td className={`px-4 py-2 text-right ${Number(r.receivable_outstanding) > 0 ? 'text-destructive font-medium' : ''}`}>
                      {formatMoney(Number(r.receivable_outstanding || 0))}
                      {(() => {
                        const a = agingFor(r);
                        if (!a || (Number(a.due_0_30) + Number(a.due_31_90) + Number(a.due_90_plus)) <= 0) return null;
                        return (
                          <div className="mt-0.5 flex justify-end gap-1.5 text-[9px] font-normal tabular-nums">
                            {Number(a.due_0_30) > 0 && <span className="text-muted-foreground" title="1–30 days past due">30d {formatMoney(Number(a.due_0_30))}</span>}
                            {Number(a.due_31_90) > 0 && <span className="text-amber-500" title="31–90 days past due">90d {formatMoney(Number(a.due_31_90))}</span>}
                            {Number(a.due_90_plus) > 0 && <span className="text-destructive" title="More than 90 days past due">90+ {formatMoney(Number(a.due_90_plus))}</span>}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-2 text-right">{formatMoney(Number(r.payable_outstanding || 0))}</td>
                    <td className={`px-4 py-2 text-right font-medium ${Number(r.net_position) < 0 ? 'text-destructive' : ''}`}>{formatMoney(Number(r.net_position || 0))}</td>
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setSelected(r); }}>Open</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <TablePagination page={page} total={filtered.length} onPageChange={setPage} label="parties" />
            </>
          )}
        </CardContent>
      </Card>

      <PartyDetailDialog
        party={selected}
        aging={selected ? agingMap[`${selected.party_type}:${selected.party_id}`] ?? null : null}
        open={selected !== null}
        onClose={() => setSelected(null)}
        statementsEnabled={statementsEnabled}
        crmBase={financeBase === '/admin/finance' ? '/admin/crm' : '/crm'}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------

interface DetailProps {
  party: PartyRow | null;
  aging: CustomerAgingBuckets | null;
  open: boolean;
  onClose: () => void;
  statementsEnabled: boolean;
  crmBase: string;
}

const PartyDetailDialog: React.FC<DetailProps> = ({ party, aging, open, onClose, statementsEnabled, crmBase }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [bills, setBills] = useState<SupplierBill[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  // Each drill-down list pages independently — these used to be `.slice(0, 15)` / `.slice(0, 10)`,
  // which silently hid every older invoice/bill/payment with no way to reach it.
  const [invPage, setInvPage] = useState(1);
  const [billPage, setBillPage] = useState(1);
  const [payPage, setPayPage] = useState(1);
  const [ledgerPage, setLedgerPage] = useState(1);
  // Running ledger (καρτέλα)
  const [ledgerSide, setLedgerSide] = useState<'customer' | 'supplier'>('customer');
  const [ledger, setLedger] = useState<PartyLedgerRow[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [opening, setOpening] = useState(0);
  const thisYear = new Date().getFullYear();
  const [fromDate, setFromDate] = useState(`${thisYear}-01-01`);
  const [toDate, setToDate] = useState(`${thisYear}-12-31`);

  // Default the ledger side to whichever role the party holds.
  useEffect(() => {
    if (!party) return;
    setLedgerSide(party.is_customer ? 'customer' : party.is_supplier ? 'supplier' : 'customer');
    setInvPage(1); setBillPage(1); setPayPage(1); setLedgerPage(1);
  }, [party]);

  // A new side/date range is a new ledger — don't land the user mid-way through it.
  useEffect(() => { setLedgerPage(1); }, [ledgerSide, fromDate, toDate]);

  useEffect(() => {
    if (!party) { setLedger([]); setOpening(0); return; }
    void (async () => {
      try {
        setLedgerLoading(true);
        const common = {
          workspaceId: party.workspace_id, side: ledgerSide,
          companyId: party.party_type === 'company' ? party.party_id : null,
          contactId: party.party_type === 'contact' ? party.party_id : null,
        };
        const [rows, open] = await Promise.all([
          financeService.getPartyLedger({ ...common, from: fromDate, to: toDate }),
          financeService.getPartyOpeningBalance({ ...common, before: fromDate }),
        ]);
        setLedger(rows); setOpening(open);
      } catch (err: any) {
        toast({ title: 'Failed to load ledger', description: err?.message, variant: 'destructive' });
        setLedger([]); setOpening(0);
      } finally { setLedgerLoading(false); }
    })();
  }, [party, ledgerSide, fromDate, toDate, toast]);

  // Chronological entries with progressive debit/credit totals + a running balance
  // seeded from the opening (carry-forward) balance — full Καρτέλα shape.
  const ledgerWithBalance = useMemo(() => {
    let pd = 0, pc = 0;
    return ledger.map((r) => {
      pd += Number(r.debit || 0); pc += Number(r.credit || 0);
      return { ...r, progrDebit: pd, progrCredit: pc, balance: opening + pd - pc };
    });
  }, [ledger, opening]);
  const totalDebit = ledgerWithBalance.length ? ledgerWithBalance[ledgerWithBalance.length - 1].progrDebit : 0;
  const totalCredit = ledgerWithBalance.length ? ledgerWithBalance[ledgerWithBalance.length - 1].progrCredit : 0;
  const ledgerClosing = opening + totalDebit - totalCredit;
  const ledgerCurrency = ledger.find((r) => r.currency)?.currency ?? undefined;
  const m = (n: number) => formatMoney(n, ledgerCurrency);

  const printLedger = () => {
    if (!party) return;
    // Pentest #250 J1: this HTML is written into a same-origin about:blank popup via
    // document.write — CRM party name/email + ledger doc fields (attacker-influenced via
    // counterparty/import data) MUST be escaped or an <img onerror> in a party name runs
    // in the app origin and can read the Supabase session token from localStorage.
    const esc = escapeHtml; // shared canonical escaper (was an identical local copy)
    const sideLabel = ledgerSide === 'customer' ? 'Πελάτης / Customer' : 'Προμηθευτής / Supplier';
    const rowsHtml = ledgerWithBalance.map((r) => `
      <tr>
        <td>${r.entry_date ? new Date(r.entry_date).toLocaleDateString() : ''}</td>
        <td>${esc(LEDGER_KIND_LABEL[r.doc_kind] ?? r.doc_kind)}</td>
        <td>${esc(r.doc_number)}</td>
        <td class="r">${Number(r.debit) ? m(Number(r.debit)) : ''}</td>
        <td class="r">${Number(r.credit) ? m(Number(r.credit)) : ''}</td>
        <td class="r g">${m(r.progrDebit)}</td>
        <td class="r g">${m(r.progrCredit)}</td>
        <td class="r b">${m(r.balance)}</td>
      </tr>`).join('');
    const owes = ledgerSide === 'customer' ? ledgerClosing > 0 : ledgerClosing < 0;
    const closingLabel = owes
      ? (ledgerSide === 'customer' ? 'Χρεωστικό υπόλοιπο (οφείλει) / owes us' : 'Πιστωτικό υπόλοιπο (οφείλουμε) / we owe')
      : (ledgerSide === 'customer' ? 'Πιστωτικό υπόλοιπο / credit' : 'Χρεωστικό υπόλοιπο / debit');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Καρτέλα — ${esc(party.display_name)}</title>
      <link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@300;400;600&display=swap" rel="stylesheet">
      <style>body{font-family:'Open Sans',Arial,Helvetica,sans-serif;margin:24px;color:#111}h1{font-size:18px;margin:0 0 2px}
      .sub{color:#555;font-size:12px;margin-bottom:4px}.id{font-size:11px;color:#444;margin-bottom:14px}
      table{width:100%;border-collapse:collapse;font-size:11px}th,td{border-bottom:1px solid #ddd;padding:4px 6px}
      th{text-align:left;background:#f1f1f4}.r{text-align:right}.g{color:#666}.b{font-weight:600}
      tfoot td{font-weight:bold;border-top:2px solid #333;background:#fafafa}
      .open td{font-weight:600;color:#555;background:#fafafa}.close{margin-top:10px;font-size:13px;text-align:right}</style></head>
      <body><h1>Καρτέλα ${ledgerSide === 'customer' ? 'Πελάτη' : 'Προμηθευτή'}</h1>
      <div class="sub">Από ${new Date(fromDate).toLocaleDateString()} Έως ${new Date(toDate).toLocaleDateString()} · ${sideLabel}</div>
      <div class="id">${esc(party.display_name)}${party.email ? ' · ' + esc(party.email) : ''} · printed ${new Date().toLocaleDateString()}</div>
      <table>
      <thead><tr><th>Ημ/νία</th><th>Τύπος</th><th>Παραστατικό</th><th class="r">Χρέωση</th><th class="r">Πίστωση</th><th class="r">Προοδ. Χρέωση</th><th class="r">Προοδ. Πίστωση</th><th class="r">Υπόλοιπο</th></tr></thead>
      <tbody>
      <tr class="open"><td colspan="7">Προηγούμενα Σύνολα / Opening balance</td><td class="r">${m(opening)}</td></tr>
      ${rowsHtml || '<tr><td colspan="8" style="text-align:center;color:#888;padding:20px">Καμία κίνηση στην περίοδο.</td></tr>'}
      </tbody>
      <tfoot><tr><td colspan="3">Σύνολα</td><td class="r">${m(totalDebit)}</td><td class="r">${m(totalCredit)}</td><td class="r">${m(totalDebit)}</td><td class="r">${m(totalCredit)}</td><td class="r">${m(ledgerClosing)}</td></tr></tfoot>
      </table>
      <div class="close">${closingLabel}: <strong>${m(Math.abs(ledgerClosing))}</strong></div>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { toast({ title: 'Pop-up blocked', description: 'Allow pop-ups to print the ledger.', variant: 'destructive' }); return; }
    w.document.write(html); w.document.close(); w.focus(); w.print();
  };

  useEffect(() => {
    if (!party) { setInvoices([]); setBills([]); setPayments([]); return; }
    void (async () => {
      try {
        setLoading(true);
        const res = await financeService.getPartyDetail({
          workspaceId: party.workspace_id, partyType: party.party_type, partyId: party.party_id,
        });
        setInvoices(res.invoices); setBills(res.bills); setPayments(res.payments);
      } catch (err: any) {
        toast({ title: 'Failed to load detail', description: err?.message, variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
  }, [party, toast]);

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{party?.display_name}</DialogTitle>
          <DialogDescription>{party?.email ?? 'No email on file'}</DialogDescription>
        </DialogHeader>

        {!party ? null : (
          <div className="space-y-4">
            <PartyAccountSummary
              customer={(party.is_customer || Number(party.invoiced_total) > 0 || Number(party.receivable_outstanding) > 0)
                ? { invoiced: Number(party.invoiced_total || 0), paid: Number(party.receivable_paid_total || 0), outstanding: Number(party.receivable_outstanding || 0) }
                : null}
              supplier={(party.is_supplier || Number(party.billed_total) > 0 || Number(party.payable_outstanding) > 0)
                ? { billed: Number(party.billed_total || 0), paid: Number(party.payable_paid_total || 0), outstanding: Number(party.payable_outstanding || 0) }
                : null}
              aging={aging ? { not_due: Number(aging.not_due), due_0_30: Number(aging.due_0_30), due_31_90: Number(aging.due_31_90), due_90_plus: Number(aging.due_90_plus) } : null}
            />

            <StatementActions
              partyType={party.party_type}
              partyId={party.party_id}
              workspaceId={party.workspace_id}
              email={party.email}
              side={ledgerSide}
              from={fromDate}
              to={toDate}
              statementsEnabled={statementsEnabled}
              crmHref={`${crmBase}/${party.party_type === 'company' ? 'companies' : 'contacts'}/${party.party_id}`}
              variant="buttons"
              className="flex-wrap"
            />

            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                <Section title={<><FileText className="h-4 w-4" /> Invoices ({invoices.length})</>} empty="No invoices.">
                  {invoices.length > 0 && (
                    <>
                    <ul className="divide-y divide-border/40">
                      {paginate(invoices, invPage).map((i) => (
                        <li key={i.id} className="flex justify-between gap-2 px-3 py-2 text-sm">
                          <div><span className="font-mono">{i.internal_number}</span> · {humanizeLabel(i.status)}</div>
                          <div className="text-right tabular-nums">{formatMoney(Number(i.total), i.currency)}<div className="text-[10px] text-muted-foreground">Due {formatMoney(Number(i.amount_due), i.currency)}</div></div>
                        </li>
                      ))}
                    </ul>
                    <TablePagination page={invPage} total={invoices.length} onPageChange={setInvPage} label="invoices" />
                    </>
                  )}
                </Section>

                <Section title={<><Receipt className="h-4 w-4" /> Supplier bills ({bills.length})</>} empty="No supplier bills.">
                  {bills.length > 0 && (
                    <>
                    <ul className="divide-y divide-border/40">
                      {paginate(bills, billPage).map((b) => (
                        <li key={b.id} className="flex justify-between gap-2 px-3 py-2 text-sm">
                          <div><span className="font-mono">{b.supplier_bill_number ?? '—'}</span> · {humanizeLabel(b.status)}</div>
                          <div className="text-right tabular-nums">{formatMoney(Number(b.total), b.currency)}<div className="text-[10px] text-muted-foreground">Due {formatMoney(Number(b.amount_due), b.currency)}</div></div>
                        </li>
                      ))}
                    </ul>
                    <TablePagination page={billPage} total={bills.length} onPageChange={setBillPage} label="bills" />
                    </>
                  )}
                </Section>

                <Section title="Payments" empty="No payments recorded.">
                  {payments.length > 0 && (
                    <>
                    <ul className="divide-y divide-border/40">
                      {paginate(payments, payPage).map((p) => (
                        <li key={p.id} className="flex justify-between gap-2 px-3 py-2 text-sm">
                          <div>{new Date(p.paid_at).toLocaleDateString()} · {p.direction === 'in' ? 'In' : 'Out'} · {p.method ?? '—'}</div>
                          <div className={`text-right tabular-nums ${p.direction === 'in' ? 'text-emerald-500' : 'text-red-400'}`}>{formatMoney(Number(p.amount), p.currency)}</div>
                        </li>
                      ))}
                    </ul>
                    <TablePagination page={payPage} total={payments.length} onPageChange={setPayPage} label="payments" />
                    </>
                  )}
                </Section>

                {/* Running ledger (καρτέλα) — printable */}
                <Card>
                  <CardHeader className="border-b border-border/60 px-4 py-2 flex-row items-center justify-between space-y-0 flex-wrap gap-2">
                    <CardTitle className="text-xs flex items-center gap-2"><BookOpen className="h-4 w-4" /> Ledger</CardTitle>
                    <div className="flex items-center gap-2 flex-wrap">
                      <input type="date" value={fromDate} max={toDate} onChange={(e) => setFromDate(e.target.value)}
                        className="h-7 rounded-md border border-border/60 bg-background px-2 text-xs" />
                      <span className="text-xs text-muted-foreground">→</span>
                      <input type="date" value={toDate} min={fromDate} onChange={(e) => setToDate(e.target.value)}
                        className="h-7 rounded-md border border-border/60 bg-background px-2 text-xs" />
                      {party.is_customer && party.is_supplier && (
                        <Select value={ledgerSide} onValueChange={(v: any) => setLedgerSide(v)}>
                          <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="customer">Customer</SelectItem>
                            <SelectItem value="supplier">Supplier</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={printLedger}>
                        <Printer className="h-3.5 w-3.5 mr-1" /> Print
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {ledgerLoading ? (
                      <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                    ) : (
                      <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-xs text-muted-foreground">
                          <tr className="border-b border-border/60">
                            <th className="px-3 py-2 text-left">Date</th>
                            <th className="px-3 py-2 text-left">Type</th>
                            <th className="px-3 py-2 text-left">Document</th>
                            <th className="px-3 py-2 text-right">Debit</th>
                            <th className="px-3 py-2 text-right">Credit</th>
                            <th className="px-3 py-2 text-right">Cumulative debit</th>
                            <th className="px-3 py-2 text-right">Cumulative credit</th>
                            <th className="px-3 py-2 text-right">Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* Carry-forward only belongs above the FIRST entry of the period. */}
                          {ledgerPage === 1 && (
                            <tr className="border-b border-border/30 bg-muted/30">
                              <td colSpan={7} className="px-3 py-1.5 text-xs font-medium text-muted-foreground">Opening balance</td>
                              <td className="px-3 py-1.5 text-right tabular-nums font-medium">{m(opening)}</td>
                            </tr>
                          )}
                          {ledgerWithBalance.length === 0 ? (
                            <tr><td colSpan={8} className="px-3 py-4 text-center text-xs text-muted-foreground">No activity in this period.</td></tr>
                          ) : paginate(ledgerWithBalance, ledgerPage).map((r, idx) => (
                            // Key on the ABSOLUTE row index — a per-page index collides across
                            // pages and lets React reuse the previous page's rows.
                            <tr key={(ledgerPage - 1) * TABLE_PAGE_SIZE + idx} className="border-b border-border/30">
                              <td className="px-3 py-1.5">{r.entry_date ? new Date(r.entry_date).toLocaleDateString() : '—'}</td>
                              <td className="px-3 py-1.5">{LEDGER_KIND_LABEL[r.doc_kind] ?? r.doc_kind}</td>
                              <td className="px-3 py-1.5 font-mono">{r.doc_number ?? '—'}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{Number(r.debit) ? m(Number(r.debit)) : ''}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{Number(r.credit) ? m(Number(r.credit)) : ''}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{m(r.progrDebit)}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{m(r.progrCredit)}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums font-medium">{m(r.balance)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-border">
                            <td colSpan={3} className="px-3 py-2 text-xs font-semibold">Totals</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold">{m(totalDebit)}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold">{m(totalCredit)}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold">{m(totalDebit)}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold">{m(totalCredit)}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold">{m(ledgerClosing)}</td>
                          </tr>
                        </tfoot>
                      </table>
                      </div>
                    )}
                    {/* Totals above are period-wide, not per page — Print still emits every row. */}
                    {!ledgerLoading && (
                      <TablePagination page={ledgerPage} total={ledgerWithBalance.length} onPageChange={setLedgerPage} label="entries" />
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
};

const Section: React.FC<{ title: React.ReactNode; empty: string; children: React.ReactNode }> = ({ title, empty, children }) => (
  <Card>
    <CardHeader className="border-b border-border/60 px-4 py-2"><CardTitle className="text-xs flex items-center gap-2">{title}</CardTitle></CardHeader>
    <CardContent className="p-0">{React.Children.count(children) > 0 ? children : <div className="p-4 text-xs text-muted-foreground">{empty}</div>}</CardContent>
  </Card>
);
