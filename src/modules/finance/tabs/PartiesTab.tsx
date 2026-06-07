import React, { useEffect, useMemo, useState } from 'react';
import { Mail, Loader2, FileText, Receipt, Printer, BookOpen } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Badge } from '@/components/core/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/core/ui/dialog';
import {
  financeService, formatMoney, type PartyRow, type Invoice, type SupplierBill, type Payment, type PartyLedgerRow,
} from '@/modules/finance/services/financeService';

const LEDGER_KIND_LABEL: Record<string, string> = {
  invoice: 'Invoice', credit_note: 'Credit note', payment: 'Payment',
  supplier_bill: 'Supplier bill', supplier_credit_note: 'Supplier credit note',
};

interface Props { workspaceId: string; statementsEnabled: boolean }

export const PartiesTab: React.FC<Props> = ({ workspaceId, statementsEnabled }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<PartyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<'all' | 'customer' | 'supplier' | 'both'>('all');
  const [selected, setSelected] = useState<PartyRow | null>(null);

  useEffect(() => { void load(); }, [workspaceId, role]);

  const load = async () => {
    try {
      setLoading(true);
      const r = await financeService.listParties({ workspaceId, role });
      setRows(r);
    } catch (err: any) {
      toast({ title: 'Failed to load parties', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => r.display_name?.toLowerCase().includes(term) || r.email?.toLowerCase().includes(term));
  }, [rows, search]);

  const totals = useMemo(() => ({
    rcv: filtered.reduce((acc, r) => acc + Number(r.receivable_outstanding || 0), 0),
    pay: filtered.reduce((acc, r) => acc + Number(r.payable_outstanding || 0), 0),
  }), [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Customers &amp; Suppliers</h3>
          <p className="text-xs text-muted-foreground">Combined view of every CRM party with finance activity. Click a row for the full breakdown and to email a statement.</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <label className="block text-[10px] text-muted-foreground">Role</label>
            <Select value={role} onValueChange={(v: any) => setRole(v)}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="customer">Customers</SelectItem>
                <SelectItem value="supplier">Suppliers</SelectItem>
                <SelectItem value="both">Both (customer + supplier)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="block text-[10px] text-muted-foreground">Search</label>
            <Input placeholder="Name or email" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="dashboard-card border-0"><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">Total customers owe</div>
          <div className={`text-lg font-semibold ${totals.rcv > 0 ? 'text-destructive' : ''}`}>{formatMoney(totals.rcv)}</div>
        </CardContent></Card>
        <Card className="dashboard-card border-0"><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">We owe suppliers</div>
          <div className="text-lg font-semibold">{formatMoney(totals.pay)}</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">No parties match.</div>
          ) : (
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
                {filtered.map((r) => (
                  <tr key={`${r.party_type}-${r.party_id}`} className="border-b border-border/30 hover:bg-muted/30 cursor-pointer" onClick={() => setSelected(r)}>
                    <td className="px-4 py-2">
                      <div className="font-medium">{r.display_name}</div>
                      {r.email && <div className="text-[10px] text-muted-foreground">{r.email}</div>}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1">
                        {r.is_customer && <Badge variant="outline" className="text-[10px]">Customer</Badge>}
                        {r.is_supplier && <Badge variant="default" className="text-[10px]">Supplier</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right">{formatMoney(Number(r.invoiced_total || 0))}</td>
                    <td className={`px-4 py-2 text-right ${Number(r.receivable_outstanding) > 0 ? 'text-destructive font-medium' : ''}`}>{formatMoney(Number(r.receivable_outstanding || 0))}</td>
                    <td className="px-4 py-2 text-right">{formatMoney(Number(r.payable_outstanding || 0))}</td>
                    <td className={`px-4 py-2 text-right font-medium ${Number(r.net_position) < 0 ? 'text-destructive' : ''}`}>{formatMoney(Number(r.net_position || 0))}</td>
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setSelected(r); }}>Open</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <PartyDetailDialog
        party={selected}
        open={selected !== null}
        onClose={() => setSelected(null)}
        statementsEnabled={statementsEnabled}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------

interface DetailProps {
  party: PartyRow | null;
  open: boolean;
  onClose: () => void;
  statementsEnabled: boolean;
}

const PartyDetailDialog: React.FC<DetailProps> = ({ party, open, onClose, statementsEnabled }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [bills, setBills] = useState<SupplierBill[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [sending, setSending] = useState(false);
  // Running ledger (καρτέλα)
  const [ledgerSide, setLedgerSide] = useState<'customer' | 'supplier'>('customer');
  const [ledger, setLedger] = useState<PartyLedgerRow[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // Default the ledger side to whichever role the party holds.
  useEffect(() => {
    if (!party) return;
    setLedgerSide(party.is_customer ? 'customer' : party.is_supplier ? 'supplier' : 'customer');
  }, [party]);

  useEffect(() => {
    if (!party) { setLedger([]); return; }
    void (async () => {
      try {
        setLedgerLoading(true);
        const rows = await financeService.getPartyLedger({
          workspaceId: party.workspace_id, side: ledgerSide,
          companyId: party.party_type === 'company' ? party.party_id : null,
          contactId: party.party_type === 'contact' ? party.party_id : null,
          from: '2000-01-01', to: new Date().toISOString().slice(0, 10),
        });
        setLedger(rows);
      } catch (err: any) {
        toast({ title: 'Failed to load ledger', description: err?.message, variant: 'destructive' });
        setLedger([]);
      } finally { setLedgerLoading(false); }
    })();
  }, [party, ledgerSide, toast]);

  // Chronological entries with a cumulative running balance (debit − credit).
  const ledgerWithBalance = useMemo(() => {
    let bal = 0;
    return ledger.map((r) => { bal += Number(r.debit || 0) - Number(r.credit || 0); return { ...r, balance: bal }; });
  }, [ledger]);
  const ledgerClosing = ledgerWithBalance.length ? ledgerWithBalance[ledgerWithBalance.length - 1].balance : 0;

  const printLedger = () => {
    if (!party) return;
    const sideLabel = ledgerSide === 'customer' ? 'Customer' : 'Supplier';
    const rowsHtml = ledgerWithBalance.map((r) => `
      <tr>
        <td>${r.entry_date ? new Date(r.entry_date).toLocaleDateString() : ''}</td>
        <td>${LEDGER_KIND_LABEL[r.doc_kind] ?? r.doc_kind}</td>
        <td>${r.doc_number ?? ''}</td>
        <td style="text-align:right">${Number(r.debit) ? formatMoney(Number(r.debit), r.currency ?? undefined) : ''}</td>
        <td style="text-align:right">${Number(r.credit) ? formatMoney(Number(r.credit), r.currency ?? undefined) : ''}</td>
        <td style="text-align:right">${formatMoney(r.balance)}</td>
      </tr>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Ledger — ${party.display_name}</title>
      <style>body{font-family:Arial,Helvetica,sans-serif;margin:24px;color:#111}h1{font-size:18px;margin:0 0 4px}
      .sub{color:#555;font-size:12px;margin-bottom:16px}table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border-bottom:1px solid #ddd;padding:6px 8px}th{text-align:left;background:#f5f5f5}
      tfoot td{font-weight:bold;border-top:2px solid #333}</style></head>
      <body><h1>Ledger (Καρτέλα) — ${party.display_name}</h1>
      <div class="sub">${sideLabel} account · ${party.email ?? ''} · printed ${new Date().toLocaleDateString()}</div>
      <table><thead><tr><th>Date</th><th>Type</th><th>Document</th><th style="text-align:right">Debit</th><th style="text-align:right">Credit</th><th style="text-align:right">Balance</th></tr></thead>
      <tbody>${rowsHtml || '<tr><td colspan="6" style="text-align:center;color:#888;padding:24px">No transactions.</td></tr>'}</tbody>
      <tfoot><tr><td colspan="5" style="text-align:right">Closing balance</td><td style="text-align:right">${formatMoney(ledgerClosing)}</td></tr></tfoot>
      </table></body></html>`;
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

  const handleSend = async () => {
    if (!party) return;
    if (!statementsEnabled) {
      toast({ title: 'Statements disabled', description: 'Enable statements in Settings first.', variant: 'destructive' });
      return;
    }
    try {
      setSending(true);
      const res = await financeService.sendStatement({
        partyType: party.party_type, partyId: party.party_id,
      });
      if (res.ok) {
        toast({ title: res.email_sent_to ? 'Statement sent' : 'Statement generated', description: res.email_sent_to ?? 'PDF ready' });
      } else {
        toast({ title: 'Send failed', description: res.error ?? 'Unknown error', variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{party?.display_name}</DialogTitle>
          <DialogDescription>{party?.email ?? 'No email on file'}</DialogDescription>
        </DialogHeader>

        {!party ? null : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <KpiBlock label="They owe us" value={formatMoney(Number(party.receivable_outstanding || 0))} accent={Number(party.receivable_outstanding) > 0 ? 'destructive' : undefined} />
              <KpiBlock label="We owe them" value={formatMoney(Number(party.payable_outstanding || 0))} />
              <KpiBlock label="Net position" value={formatMoney(Number(party.net_position || 0))} accent={Number(party.net_position) < 0 ? 'destructive' : undefined} />
            </div>

            <Button onClick={handleSend} disabled={sending || !statementsEnabled} className="w-full">
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
              {statementsEnabled ? 'Email account statement' : 'Statements disabled (Settings)'}
            </Button>

            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                <Section title={<><FileText className="h-4 w-4" /> Invoices ({invoices.length})</>} empty="No invoices.">
                  {invoices.length > 0 && (
                    <ul className="divide-y divide-border/40">
                      {invoices.slice(0, 15).map((i) => (
                        <li key={i.id} className="flex justify-between gap-2 px-3 py-2 text-sm">
                          <div><span className="font-mono">{i.internal_number}</span> · {i.status}</div>
                          <div className="text-right tabular-nums">{formatMoney(Number(i.total), i.currency)}<div className="text-[10px] text-muted-foreground">Due {formatMoney(Number(i.amount_due), i.currency)}</div></div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>

                <Section title={<><Receipt className="h-4 w-4" /> Supplier bills ({bills.length})</>} empty="No supplier bills.">
                  {bills.length > 0 && (
                    <ul className="divide-y divide-border/40">
                      {bills.slice(0, 15).map((b) => (
                        <li key={b.id} className="flex justify-between gap-2 px-3 py-2 text-sm">
                          <div><span className="font-mono">{b.supplier_bill_number ?? '—'}</span> · {b.status}</div>
                          <div className="text-right tabular-nums">{formatMoney(Number(b.total), b.currency)}<div className="text-[10px] text-muted-foreground">Due {formatMoney(Number(b.amount_due), b.currency)}</div></div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>

                <Section title="Recent payments" empty="No payments recorded.">
                  {payments.length > 0 && (
                    <ul className="divide-y divide-border/40">
                      {payments.slice(0, 10).map((p) => (
                        <li key={p.id} className="flex justify-between gap-2 px-3 py-2 text-sm">
                          <div>{new Date(p.paid_at).toLocaleDateString()} · {p.direction === 'in' ? 'In' : 'Out'} · {p.method ?? '—'}</div>
                          <div className={`text-right tabular-nums ${p.direction === 'in' ? 'text-emerald-500' : 'text-red-400'}`}>{formatMoney(Number(p.amount), p.currency)}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>

                {/* Running ledger (καρτέλα) — printable */}
                <Card>
                  <CardHeader className="border-b border-border/60 px-4 py-2 flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-xs flex items-center gap-2"><BookOpen className="h-4 w-4" /> Ledger (Καρτέλα)</CardTitle>
                    <div className="flex items-center gap-2">
                      {party.is_customer && party.is_supplier && (
                        <Select value={ledgerSide} onValueChange={(v: any) => setLedgerSide(v)}>
                          <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="customer">Customer</SelectItem>
                            <SelectItem value="supplier">Supplier</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={printLedger} disabled={ledgerWithBalance.length === 0}>
                        <Printer className="h-3.5 w-3.5 mr-1" /> Print
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {ledgerLoading ? (
                      <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                    ) : ledgerWithBalance.length === 0 ? (
                      <div className="p-4 text-xs text-muted-foreground">No transactions for this {ledgerSide} account.</div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="text-xs text-muted-foreground">
                          <tr className="border-b border-border/60">
                            <th className="px-3 py-2 text-left">Date</th>
                            <th className="px-3 py-2 text-left">Type</th>
                            <th className="px-3 py-2 text-left">Document</th>
                            <th className="px-3 py-2 text-right">Debit</th>
                            <th className="px-3 py-2 text-right">Credit</th>
                            <th className="px-3 py-2 text-right">Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ledgerWithBalance.map((r, idx) => (
                            <tr key={idx} className="border-b border-border/30">
                              <td className="px-3 py-1.5">{r.entry_date ? new Date(r.entry_date).toLocaleDateString() : '—'}</td>
                              <td className="px-3 py-1.5">{LEDGER_KIND_LABEL[r.doc_kind] ?? r.doc_kind}</td>
                              <td className="px-3 py-1.5 font-mono text-xs">{r.doc_number ?? '—'}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{Number(r.debit) ? formatMoney(Number(r.debit), r.currency ?? undefined) : ''}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{Number(r.credit) ? formatMoney(Number(r.credit), r.currency ?? undefined) : ''}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums font-medium">{formatMoney(r.balance)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-border">
                            <td colSpan={5} className="px-3 py-2 text-right text-xs font-semibold">Closing balance</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatMoney(ledgerClosing)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const KpiBlock: React.FC<{ label: string; value: string; accent?: 'destructive' }> = ({ label, value, accent }) => (
  <Card className="dashboard-card border-0"><CardContent className="p-3">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className={`text-lg font-semibold ${accent === 'destructive' ? 'text-destructive' : ''}`}>{value}</div>
  </CardContent></Card>
);

const Section: React.FC<{ title: React.ReactNode; empty: string; children: React.ReactNode }> = ({ title, empty, children }) => (
  <Card>
    <CardHeader className="border-b border-border/60 px-4 py-2"><CardTitle className="text-xs flex items-center gap-2">{title}</CardTitle></CardHeader>
    <CardContent className="p-0">{React.Children.count(children) > 0 ? children : <div className="p-4 text-xs text-muted-foreground">{empty}</div>}</CardContent>
  </Card>
);
