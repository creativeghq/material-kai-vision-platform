import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus, Loader2, Trash2, Paperclip, Send, FileText, Check, X, ExternalLink, MapPin, UserPlus,
  ShoppingCart, Receipt, ScanLine, BadgeCheck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { HubEmptyState } from '@/components/core/hub';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Badge } from '@/components/core/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter , DialogDescription } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { formatMoney } from '@/modules/finance/services/financeService';
import { statusTone } from '@/modules/finance/utils/statusTone';
import {
  tripExpenseService, TRIP_EXPENSE_CATEGORIES, TRIP_STATUS_LABEL,
  EXPENSE_CARD_TYPES, EXPENSE_CARD_TYPE_LABEL,
  type TripExpenseReport, type TripExpenseItem, type TripStatus, type ExpensePaymentMethod, type ExpenseCardType,
  type TripCardLinks, type TripMoneyByCurrency,
} from '@/modules/finance/services/tripExpenseService';
import { parseDecimal } from '@/utils/decimal';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { FilterBar, optionsFromRows, useFilters, type FilterGroupDef } from '@/components/core/filters';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { formatDate, todayLocalISO } from '@/utils/datetime';
import { receiptScanService, splitForForm, RECEIPT_ACCEPT, ReceiptTooLargeError } from '@/services/receiptScanService';
interface Props {
  workspaceId: string;
  /** Finance reviewers see every card and can approve/reject lines. Reps see only their own. */
  canReview: boolean;
}

const STATUS_VARIANT: Record<TripStatus, 'default' | 'outline' | 'secondary' | 'destructive'> = {
  draft: 'outline',
  submitted: 'secondary',
  partially_approved: 'secondary',
  approved: 'default',
  rejected: 'destructive',
  reimbursed: 'default',
};

export const TripExpensesPanel: React.FC<Props> = ({ workspaceId, canReview }) => {
  const { toast } = useToast();
  const [reports, setReports] = useState<TripExpenseReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => { void supabase.auth.getUser().then(({ data }) => setUid(data?.user?.id ?? null)); }, []);
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [workspaceId, canReview]);
  // Switching scope (mine ↔ team) is a different list; deleting a card shrinks the current one.
  useEffect(() => { setPage(1); }, [workspaceId, canReview]);

  // The card list can grow long — filter by search / type / status.
  const filterGroups = useMemo<FilterGroupDef[]>(() => [{
    key: 'general', label: 'General', icon: FileText,
    fields: [
      { key: 'q', type: 'text', label: 'Search', placeholder: 'Title / destination…', accessor: (r: TripExpenseReport) => [r.title, r.destination] },
      { key: 'card_type', type: 'multi', label: 'Type', options: optionsFromRows(reports, (r) => r.card_type, (t) => EXPENSE_CARD_TYPE_LABEL[t as ExpenseCardType] ?? String(t)), accessor: (r: TripExpenseReport) => r.card_type },
      { key: 'status', type: 'multi', label: 'Status', options: optionsFromRows(reports, (r) => r.status, (s) => TRIP_STATUS_LABEL[s as TripStatus] ?? String(s)), accessor: (r: TripExpenseReport) => r.status },
    ],
  }], [reports]);
  const { values: filterValues, setValues: setFilterValues, filtered: reportsView, previewCount } =
    useFilters<TripExpenseReport>(reports, filterGroups);
  useEffect(() => { setPage((p) => clampPage(p, reportsView.length)); }, [reportsView.length]);

  const load = async () => {
    try {
      setLoading(true);
      const rows = await tripExpenseService.listReports({ workspaceId, mine: !canReview });
      setReports(rows);
      if (rows.length && !rows.find((r) => r.id === selectedId)) setSelectedId(rows[0].id);
    } catch (err: any) {
      toast({ title: 'Failed to load trip cards', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Expense Cards"
        subtitle={canReview
          ? 'Review the team’s expense cards (trips, monthly expenses, …). Approve or reject each line; approved totals can post a reimbursement payable.'
          : 'Track your expenses by card — a sales trip, a month of expenses, anything — attach receipts, and submit to finance for approval.'}
        actions={<>
          {reports.length > 0 && (
            <FilterBar groups={filterGroups} values={filterValues} onChange={setFilterValues} previewCount={previewCount} title="Filter expense cards" />
          )}
          {canReview && (
            <Button variant="outline" onClick={() => setRequestOpen(true)}><UserPlus className="h-4 w-4 mr-1" /> Request from teammate</Button>
          )}
          <Button onClick={() => setNewOpen(true)}><Plus className="h-4 w-4 mr-1" /> New card</Button>
        </>}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : reports.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No trip cards yet.</div>
            ) : reportsView.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No cards match the filter.</div>
            ) : (
              <>
              <ul className="divide-y divide-border/40">
                {paginate(reportsView, page).map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(r.id)}
                      className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-muted/30 ${selectedId === r.id ? 'bg-muted/40' : ''}`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Badge variant="secondary" className="text-[9px] shrink-0">{EXPENSE_CARD_TYPE_LABEL[r.card_type] ?? 'Trip'}</Badge>
                          <span className="truncate text-sm font-medium">{r.title}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          {r.destination && <><MapPin className="h-3 w-3" /> {r.destination} ·</>}
                          {r.item_count} item{r.item_count === 1 ? '' : 's'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium tabular-nums">{formatMoney(Number(r.total_amount), r.currency)}</div>
                        <Badge variant={STATUS_VARIANT[r.status]} className="text-[10px]">{TRIP_STATUS_LABEL[r.status]}</Badge>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              <TablePagination page={page} total={reportsView.length} onPageChange={setPage} label="cards" />
              </>
            )}
          </CardContent>
        </Card>

        <div className="min-w-0">
          {selectedId ? (
            <TripCardDetail
              key={selectedId}
              reportId={selectedId}
              uid={uid}
              canReview={canReview}
              onChanged={load}
              onDeleted={() => { setSelectedId(null); void load(); }}
            />
          ) : (
            <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">Select a trip card to view its expenses.</CardContent></Card>
          )}
        </div>
      </div>

      <NewTripCardDialog
        workspaceId={workspaceId}
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(id) => { setNewOpen(false); setSelectedId(id); void load(); }}
      />

      {canReview && (
        <RequestCardDialog
          workspaceId={workspaceId}
          open={requestOpen}
          onOpenChange={setRequestOpen}
          onRequested={(id) => { setRequestOpen(false); setSelectedId(id); void load(); }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

const TripCardDetail: React.FC<{
  reportId: string;
  uid: string | null;
  canReview: boolean;
  onChanged: () => void;
  onDeleted: () => void;
}> = ({ reportId, uid, canReview, onChanged, onDeleted }) => {
  const { toast } = useToast();
  const [report, setReport] = useState<TripExpenseReport | null>(null);
  const [items, setItems] = useState<TripExpenseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  /** What has been FILED against this card — see `tripExpenseService.cardLinks`. */
  const [links, setLinks] = useState<TripCardLinks | null>(null);
  /** Progress while a batch of photographed receipts is being read (#379). */
  const [scanning, setScanning] = useState<{ done: number; total: number } | null>(null);
  const scanInput = useRef<HTMLInputElement | null>(null);

  const isOwner = !!report && report.user_id === uid;
  const isDraft = report?.status === 'draft';
  const canEditItems = isOwner && isDraft;
  const canReviewNow = canReview && !!report && report.status !== 'draft';

  const reload = async () => {
    try {
      setLoading(true);
      const { report: r, items: it } = await tripExpenseService.getReport(reportId);
      setReport(r); setItems(it);
      // Best-effort: the card and its lines are the point of this screen, and a filing summary
      // that fails to load must not blank them.
      setLinks(await tripExpenseService.cardLinks(reportId).catch(() => null));
    } catch (err: any) {
      toast({ title: 'Failed to load card', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void reload(); /* eslint-disable-next-line */ }, [reportId]);

  const refreshAll = async () => { await reload(); onChanged(); };

  const submit = async () => {
    try {
      setBusy(true);
      await tripExpenseService.submit(reportId);
      toast({ title: 'Submitted for review' });
      await refreshAll();
    } catch (err: any) {
      toast({ title: 'Could not submit', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const review = async (itemId: string, decision: 'approved' | 'rejected') => {
    let note: string | undefined;
    if (decision === 'rejected') {
      note = window.prompt('Reason for rejecting this expense (optional):') || undefined;
    }
    try {
      setBusy(true);
      await tripExpenseService.reviewItem(itemId, decision, note);
      await refreshAll();
    } catch (err: any) {
      toast({ title: 'Review failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const removeItem = async (id: string) => {
    try { await tripExpenseService.removeItem(id); await refreshAll(); }
    catch (err: any) { toast({ title: 'Delete failed', description: err?.message, variant: 'destructive' }); }
  };

  /**
   * Photograph N receipts, get N draft lines (#379).
   *
   * The order matters and it is not the obvious one. Each file is SCANNED first, then the line is
   * created from what came back, then the image is attached to that line. Creating the line first
   * would mean a failed scan leaves an empty row the rep has to find and delete; scanning first
   * means a failure costs nothing but the credit that was already spent reading it.
   *
   * One file at a time, deliberately. A phone camera roll of twelve receipts fired at the model in
   * parallel is twelve concurrent vision calls against a per-workspace credit balance, and a
   * mid-batch refusal would leave an arbitrary subset created. Sequential also lets the button
   * report "4 of 12" rather than freezing.
   *
   * Every line lands with `needs_review`, whatever the confidence. The rep confirms.
   */
  const scanReceipts = async (files: FileList) => {
    if (!report) return;
    const list = Array.from(files);
    setScanning({ done: 0, total: list.length });
    let created = 0;
    const failures: string[] = [];
    try {
      for (const file of list) {
        try {
          const res = await receiptScanService.scan(report.workspace_id, file);
          const f = res.fields;
          if (res.status === 'failed') { failures.push(`${file.name}: could not be read`); continue; }
          const { net, vat } = splitForForm(f);
          const item = await tripExpenseService.addItem({
            report_id: reportId,
            // The reader returns null when the printed date was unreadable or ambiguous. Today is
            // filled in HERE, in the operator's timezone — the edge function runs in UTC, and a
            // UTC "today" before 03:00 local is yesterday on a record numbered by date.
            expense_date: f.doc_date ?? todayLocalISO(),
            category: f.category_hint && (TRIP_EXPENSE_CATEGORIES as readonly string[]).includes(f.category_hint.toLowerCase())
              ? f.category_hint.toLowerCase()
              : 'other',
            description: [f.vendor, f.document_number].filter(Boolean).join(' · ') || file.name,
            vendor: f.vendor,
            // The line's `amount` is the gross the rep actually paid; net/VAT ride alongside.
            amount: f.total_gross ?? net + vat,
            currency: f.currency || report.currency,
            vat_amount: f.vat_amount,
            payment_method: 'personal',
            extraction_status: 'extracted',
            extracted: f as unknown as Record<string, unknown>,
            needs_review: true,
          });
          created += 1;
          // Best-effort: the line and its figures are the point, and a storage hiccup must not
          // discard a reading the rep already paid for. They can attach it by hand afterwards.
          await tripExpenseService.uploadReceipt(item.id, file).catch(() => null);
        } catch (err: any) {
          failures.push(`${file.name}: ${err instanceof ReceiptTooLargeError ? err.message : (err?.message || 'failed')}`);
        } finally {
          setScanning((p) => (p ? { ...p, done: p.done + 1 } : p));
        }
      }
      await refreshAll();
      toast({
        title: created > 0 ? `${created} expense${created === 1 ? '' : 's'} read from ${created === 1 ? 'a receipt' : 'receipts'}` : 'Nothing could be read',
        description: [
          created > 0 ? 'Check each one before submitting — they are marked for review.' : '',
          failures.length ? failures.join('; ') : '',
        ].filter(Boolean).join(' '),
        variant: created === 0 ? 'destructive' : undefined,
      });
    } finally {
      setScanning(null);
    }
  };

  // Approved, billable, not-yet-billed lines that can be on-charged to a client.
  const billableEligible = useMemo(
    () => items.filter((i) => i.billable && i.approval_status === 'approved' && !i.billed_invoice_id),
    [items],
  );

  // Group the eligible lines by project → its client → one draft invoice per client (3.5).
  const billToClient = async () => {
    if (!report || billableEligible.length === 0) return;
    setBusy(true);
    try {
      const byProject = new Map<string, TripExpenseItem[]>();
      let skipped = 0;
      for (const it of billableEligible) {
        if (!it.project_id) { skipped++; continue; }
        const arr = byProject.get(it.project_id) ?? []; arr.push(it); byProject.set(it.project_id, arr);
      }
      if (byProject.size === 0) {
        toast({ title: 'Tag a project first', description: 'Billable expenses need a project (with a client) to be on-charged.', variant: 'destructive' });
        return;
      }
      const { data: projs } = await supabase.from('projects').select('id, client_company_id, client_contact_id').in('id', [...byProject.keys()]);
      const clientByProj = new Map((((projs as any[]) ?? [])).map((p) => [p.id, p]));
      let invoices = 0;
      for (const [pid, its] of byProject) {
        const p = clientByProj.get(pid);
        const cust = p?.client_company_id ? { type: 'company' as const, id: p.client_company_id }
          : p?.client_contact_id ? { type: 'contact' as const, id: p.client_contact_id } : null;
        if (!cust) { skipped += its.length; continue; }
        await tripExpenseService.billToClient(report.workspace_id, cust, its.map((i) => i.id));
        invoices++;
      }
      toast({
        title: invoices ? `Created ${invoices} draft invoice${invoices > 1 ? 's' : ''}` : 'Nothing billed',
        description: skipped ? `${skipped} expense(s) skipped — no project or the project has no client.` : 'Find them in Finance → drafts to review & issue.',
        variant: invoices ? 'default' : 'destructive',
      });
      await refreshAll();
    } catch (err: any) {
      toast({ title: 'Billing failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const uploadReceipt = async (item: TripExpenseItem, file: File) => {
    try {
      setBusy(true);
      await tripExpenseService.uploadReceipt(item.id, file);
      toast({ title: 'Receipt attached' });
      await reload();
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const openReceipt = async (item: TripExpenseItem) => {
    try {
      const url = await tripExpenseService.receiptUrl(item.id);
      if (url) window.open(url, '_blank');
      else toast({ title: 'No receipt on this line' });
    } catch (err: any) {
      toast({ title: 'Could not open receipt', description: err?.message, variant: 'destructive' });
    }
  };

  const downloadPdf = async () => {
    try {
      setBusy(true);
      const { pdf_url } = await tripExpenseService.generatePdf(reportId);
      if (pdf_url) window.open(pdf_url, '_blank');
    } catch (err: any) {
      toast({ title: 'PDF failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const deleteCard = async () => {
    if (!window.confirm('Delete this trip card and all its expenses?')) return;
    try { await tripExpenseService.deleteReport(reportId); onDeleted(); }
    catch (err: any) { toast({ title: 'Delete failed', description: err?.message, variant: 'destructive' }); }
  };

  if (loading || !report) {
    return <Card><CardContent className="py-16 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;
  }

  return (
    <div className="space-y-4">
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3 space-y-2">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary" className="text-[10px]">{EXPENSE_CARD_TYPE_LABEL[report.card_type] ?? 'Trip'}</Badge>
              {report.title}
              <Badge variant={STATUS_VARIANT[report.status]} className="text-[10px]">{TRIP_STATUS_LABEL[report.status]}</Badge>
            </CardTitle>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {[report.destination, report.purpose].filter(Boolean).join(' · ')}
              {(report.trip_start || report.trip_end) && <> · {report.trip_start ?? '?'} → {report.trip_end ?? '?'}</>}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {/* Photograph the receipts and let the card fill itself in. First on the row because
                on a trip it is the normal way in — typing an expense is the fallback, not the
                other way round. `capture` is deliberately absent: on a phone the picker still
                offers the camera, and without it the rep can also select the twelve photos they
                already took over three days. */}
            {canEditItems && (
              <>
                <input
                  ref={scanInput}
                  type="file" multiple accept={RECEIPT_ACCEPT} className="hidden"
                  onChange={(e) => { const fs = e.target.files; if (fs?.length) void scanReceipts(fs); e.currentTarget.value = ''; }}
                />
                <Button size="sm" variant="secondary" disabled={busy || !!scanning} onClick={() => scanInput.current?.click()}>
                  {scanning
                    ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Reading {scanning.done}/{scanning.total}</>
                    : <><ScanLine className="h-3.5 w-3.5 mr-1" /> Scan receipts</>}
                </Button>
              </>
            )}
            {canEditItems && <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" /> Expense</Button>}
            {canReview && billableEligible.length > 0 && (
              <Button size="sm" variant="outline" disabled={busy} onClick={billToClient} title="Create a draft customer invoice from the approved billable expenses">
                <FileText className="h-3.5 w-3.5 mr-1" /> Bill to client ({billableEligible.length})
              </Button>
            )}
            {canEditItems && report.item_count > 0 && (
              <Button size="sm" disabled={busy} onClick={submit}><Send className="h-3.5 w-3.5 mr-1" /> Submit</Button>
            )}
            <Button size="sm" variant="ghost" disabled={busy} onClick={downloadPdf} title="Download PDF"><FileText className="h-3.5 w-3.5" /></Button>
            {isOwner && isDraft && (
              <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={deleteCard} title="Delete card"><Trash2 className="h-3.5 w-3.5" /></Button>
            )}
          </div>
        </div>

        {/* Totals strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Totals label="Total" value={report.total_amount} currency={report.currency} />
          <Totals label="Approved" value={report.approved_amount} currency={report.currency} tone="green" />
          <Totals label="Rejected" value={report.rejected_amount} currency={report.currency} tone="red" />
          <Totals label="Pending" value={report.pending_amount} currency={report.currency} tone="amber" />
        </div>
        {report.assigned_by && report.request_note && (
          <div className="text-[11px] text-muted-foreground rounded-md border border-border/50 px-2 py-1.5">
            <span className="font-medium text-foreground">Requested by finance:</span> {report.request_note}
          </div>
        )}
        {report.reimbursed_at && (
          <div className="text-[11px] text-emerald-500">Reimbursed on {formatDate(report.reimbursed_at)}.</div>
        )}
      </CardHeader>

      <CardContent className="p-0">
        {items.length === 0 ? (
          <HubEmptyState
            icon={FileText}
            title="No expenses yet"
            description="Photograph the receipts and each one becomes a line you check, or add them by hand. Approved billable lines can then be pushed into a draft customer invoice."
            action={canEditItems ? (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button size="sm" disabled={!!scanning} onClick={() => scanInput.current?.click()}>
                  <ScanLine className="h-3.5 w-3.5 mr-1" /> Scan receipts
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" /> Add by hand</Button>
              </div>
            ) : undefined}
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border/60">
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Category</th>
                <th className="px-3 py-2 text-left">Description</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-center">Receipt</th>
                <th className="px-3 py-2 text-center">Status</th>
                <th className="px-3 py-2 text-right"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b border-border/30 hover:bg-muted/20">
                  <td className="px-3 py-2 whitespace-nowrap">{it.expense_date}</td>
                  <td className="px-3 py-2 capitalize">{it.category}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate max-w-[200px]">{it.description || '—'}</span>
                      {/* A line the reader produced and nobody has looked at yet. Shown on the row
                          rather than only in a summary, because the thing being checked is THIS
                          line's numbers against THIS line's photo. */}
                      {it.needs_review && (
                        <Badge variant="warning" className="shrink-0 text-[9px]">Check</Badge>
                      )}
                    </div>
                    {it.vendor && <div className="text-[10px] text-muted-foreground">{it.vendor}</div>}
                    {it.review_notes && it.approval_status === 'rejected' && <div className="text-[10px] text-destructive">Rejected: {it.review_notes}</div>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{formatMoney(Number(it.amount), it.currency)}</td>
                  <td className="px-3 py-2 text-center">
                    {it.receipt_path ? (
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openReceipt(it)} title={it.receipt_name || 'Open receipt'}><ExternalLink className="h-3.5 w-3.5" /></Button>
                    ) : canEditItems ? (
                      <>
                        <input
                          ref={(el) => { fileInputs.current[it.id] = el; }}
                          type="file" accept="image/*,application/pdf" className="hidden"
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadReceipt(it, f); e.currentTarget.value = ''; }}
                        />
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={busy} onClick={() => fileInputs.current[it.id]?.click()} title="Attach receipt"><Paperclip className="h-3.5 w-3.5" /></Button>
                      </>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`text-xs capitalize ${statusTone(it.approval_status)}`}>{it.approval_status}</span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {canReviewNow ? (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-emerald-500" disabled={busy || it.approval_status === 'approved'} onClick={() => review(it.id, 'approved')} title="Approve"><Check className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" disabled={busy || it.approval_status === 'rejected'} onClick={() => review(it.id, 'rejected')} title="Reject"><X className="h-3.5 w-3.5" /></Button>
                      </div>
                    ) : canEditItems ? (
                      <div className="flex justify-end gap-1">
                        {/* Confirming is a deliberate act by the person holding the receipt. No
                            confidence score does it for them — a confident wrong reading is the
                            failure mode this whole flow is shaped around. */}
                        {it.needs_review && (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-emerald-500" disabled={busy}
                            title="These figures match the receipt"
                            onClick={async () => {
                              try { await tripExpenseService.confirmScanned(it.id); await refreshAll(); }
                              catch (err: any) { toast({ title: 'Could not confirm', description: err?.message, variant: 'destructive' }); }
                            }}><BadgeCheck className="h-3.5 w-3.5" /></Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeItem(it.id)} title="Delete line"><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>

      <AddExpenseDialog
        reportId={reportId}
        workspaceId={report.workspace_id}
        currency={report.currency}
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={refreshAll}
      />
    </Card>

    <TripLinkedRecordsCard links={links} cardCurrency={report.currency} spent={Number(report.total_amount)} />
    </div>
  );
};

/**
 * The other half of an expense card. Until orders and bills could name a trip, a card could only
 * ever state what it COST; this is the first surface that can put a return next to that spend.
 *
 * Rendered only when something is filed. An empty "nothing linked yet" panel on every card would
 * be noise on the many cards that are purely a claim — and the way to link one is on the ORDER,
 * not here, so there is no create action this empty state could honestly offer (which is exactly
 * the case `HubEmptyState` says not to fake).
 */
const TripLinkedRecordsCard: React.FC<{
  links: TripCardLinks | null;
  cardCurrency: string;
  /** The card's own claimed lines, for the spend-vs-return line. */
  spent: number;
}> = ({ links, cardCurrency, spent }) => {
  if (!links || (links.orders.length === 0 && links.bills.length === 0)) return null;
  const sales = links.orders.filter((o) => o.order_type === 'sales');
  const purchases = links.orders.filter((o) => o.order_type === 'purchase');
  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="text-sm">Filed against this card</CardTitle>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Totals label="Claimed here" value={spent} currency={cardCurrency} />
          {/* Each currency on its own tile. One figure spanning EUR and GBP is a wrong number
              that still looks like a number, so the RPC groups and this renders the groups. */}
          {links.earned.map((m: TripMoneyByCurrency) => (
            <Totals key={`e:${m.currency}`} label="Orders won" value={Number(m.amount)} currency={m.currency} tone="green" />
          ))}
          {links.filed.map((m: TripMoneyByCurrency) => (
            <Totals key={`f:${m.currency}`} label="Bills filed" value={Number(m.amount)} currency={m.currency} tone="amber" />
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {sales.length > 0 && <LinkRowGroup icon={<ShoppingCart className="h-3 w-3" />} text="Orders won" />}
        {sales.map((o) => (
          <div key={o.id} className="flex items-center justify-between border-b border-border/30 px-5 py-2 text-sm">
            <span className="truncate">
              <span className="font-medium">{o.order_number ?? o.id.slice(0, 8)}</span>
              {o.party_name && <span className="text-muted-foreground"> · {o.party_name}</span>}
              <span className={`ml-2 text-xs ${statusTone(o.status)}`}>{o.status}</span>
            </span>
            <span className="tabular-nums">{formatMoney(Number(o.total), o.currency)}</span>
          </div>
        ))}

        {purchases.length > 0 && <LinkRowGroup icon={<ShoppingCart className="h-3 w-3" />} text="Purchases made" />}
        {purchases.map((o) => (
          <div key={o.id} className="flex items-center justify-between border-b border-border/30 px-5 py-2 text-sm">
            <span className="truncate">
              <span className="font-medium">{o.order_number ?? o.id.slice(0, 8)}</span>
              {o.party_name && <span className="text-muted-foreground"> · {o.party_name}</span>}
              <span className={`ml-2 text-xs ${statusTone(o.status)}`}>{o.status}</span>
            </span>
            <span className="tabular-nums">{formatMoney(Number(o.total), o.currency)}</span>
          </div>
        ))}

        {links.bills.length > 0 && <LinkRowGroup icon={<Receipt className="h-3 w-3" />} text="Costs booked to the trip" />}
        {links.bills.map((b) => (
          <div key={b.id} className="flex items-center justify-between border-b border-border/30 px-5 py-2 text-sm">
            <span className="truncate">
              <span className="font-medium">{b.supplier_name || b.number || b.id.slice(0, 8)}</span>
              {b.issued_at && <span className="text-muted-foreground"> · {formatDate(b.issued_at)}</span>}
              <span className={`ml-2 text-xs ${statusTone(b.status)}`}>{b.status}</span>
            </span>
            <span className="tabular-nums">{formatMoney(Number(b.total), b.currency)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

const LinkRowGroup: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
  <div className="flex items-center gap-1.5 border-b border-border/40 bg-surface-sunken px-5 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
    {icon}{text}
  </div>
);

const Totals: React.FC<{ label: string; value: number; currency: string; tone?: 'green' | 'red' | 'amber' }> = ({ label, value, currency, tone }) => (
  <div className="rounded-md border border-border/50 px-2.5 py-1.5">
    <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className={`text-sm font-medium tabular-nums ${tone === 'green' ? 'text-emerald-500' : tone === 'red' ? 'text-destructive' : tone === 'amber' ? 'text-amber-500' : ''}`}>{formatMoney(Number(value), currency)}</div>
  </div>
);

// ---------------------------------------------------------------------------

const NewTripCardDialog: React.FC<{
  workspaceId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (id: string) => void;
}> = ({ workspaceId, open, onOpenChange, onCreated }) => {
  const { toast } = useToast();
  const [cardType, setCardType] = useState<ExpenseCardType>('trip');
  const [title, setTitle] = useState('');
  const [destination, setDestination] = useState('');
  const [purpose, setPurpose] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const isTrip = cardType === 'trip';

  const save = async () => {
    if (!title.trim()) { toast({ title: 'Title required', variant: 'destructive' }); return; }
    try {
      setSaving(true);
      const r = await tripExpenseService.createReport({
        workspaceId, card_type: cardType, title: title.trim(),
        destination: isTrip ? (destination.trim() || null) : null,
        purpose: purpose.trim() || null,
        trip_start: start || null, trip_end: end || null,
      });
      setCardType('trip'); setTitle(''); setDestination(''); setPurpose(''); setStart(''); setEnd('');
      onCreated(r.id);
    } catch (err: any) {
      toast({ title: 'Could not create card', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>New Expense Card</DialogTitle><DialogDescription className="sr-only">Expense card form.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="tripexpensespanel-type" className="text-xs text-muted-foreground">Type</label>
            <Select value={cardType} onValueChange={(v: any) => setCardType(v)}>
              <SelectTrigger id="tripexpensespanel-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EXPENSE_CARD_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label htmlFor="tripexpensespanel-title" className="text-xs text-muted-foreground">Title</label>
            <Input id="tripexpensespanel-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={isTrip ? 'e.g. Athens client visits — June' : 'e.g. June 2026 expenses'} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {isTrip && (
              <div className="space-y-1">
                <label htmlFor="tripexpensespanel-destination" className="text-xs text-muted-foreground">Destination</label>
                <Input id="tripexpensespanel-destination" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Athens" />
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{isTrip ? 'Purpose' : 'Note'}</label>
              <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder={isTrip ? 'Client meetings' : 'Optional'} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{isTrip ? 'Trip start' : 'Period from'}</label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{isTrip ? 'Trip end' : 'Period to'}</label>
              <Input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const RequestCardDialog: React.FC<{
  workspaceId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onRequested: (id: string) => void;
}> = ({ workspaceId, open, onOpenChange, onRequested }) => {
  const { toast } = useToast();
  const [assignees, setAssignees] = useState<{ user_id: string; name: string; email: string | null }[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [userId, setUserId] = useState('');
  const [cardType, setCardType] = useState<ExpenseCardType>('trip');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        setLoadingPeople(true);
        setAssignees(await tripExpenseService.listAssignees(workspaceId));
      } catch (err: any) {
        toast({ title: 'Could not load team members', description: err?.message, variant: 'destructive' });
      } finally { setLoadingPeople(false); }
    })();
  }, [open, workspaceId, toast]);

  const save = async () => {
    if (!userId) { toast({ title: 'Pick a team member', variant: 'destructive' }); return; }
    if (!title.trim()) { toast({ title: 'Title required', variant: 'destructive' }); return; }
    try {
      setSaving(true);
      const r = await tripExpenseService.requestCard({ workspaceId, userId, cardType, title: title.trim(), note: note.trim() || undefined });
      setUserId(''); setTitle(''); setNote(''); setCardType('trip');
      onRequested(r.id);
      toast({ title: 'Card requested', description: 'The team member has been notified to fill it in.' });
    } catch (err: any) {
      toast({ title: 'Could not request card', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Request an Expense Card</DialogTitle><DialogDescription className="sr-only">Expense card form.</DialogDescription></DialogHeader>
        <p className="text-xs text-muted-foreground">Create a card for a team member to fill in — they’ll get a notification with a link to add their expenses and submit.</p>
        <div className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="tripexpensespanel-team-member" className="text-xs text-muted-foreground">Team member</label>
            <Select value={userId} onValueChange={setUserId} disabled={loadingPeople}>
              <SelectTrigger id="tripexpensespanel-team-member"><SelectValue placeholder={loadingPeople ? 'Loading…' : 'Select a team member'} /></SelectTrigger>
              <SelectContent>
                {assignees.map((a) => <SelectItem key={a.user_id} value={a.user_id}>{a.name}{a.email ? ` · ${a.email}` : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="tripexpensespanel-type-2" className="text-xs text-muted-foreground">Type</label>
              <Select value={cardType} onValueChange={(v: any) => setCardType(v)}>
                <SelectTrigger id="tripexpensespanel-type-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CARD_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label htmlFor="tripexpensespanel-title-category" className="text-xs text-muted-foreground">Title / Category</label>
              <Input id="tripexpensespanel-title-category" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Q3 client tour" />
            </div>
          </div>
          <div className="space-y-1">
            <label htmlFor="tripexpensespanel-note-to-the-team-member-optional" className="text-xs text-muted-foreground">Note to the team member (optional)</label>
            <Input id="tripexpensespanel-note-to-the-team-member-optional" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What this card is for / what to include" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Request'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const AddExpenseDialog: React.FC<{
  reportId: string;
  workspaceId: string;
  currency: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAdded: () => void;
}> = ({ reportId, workspaceId, currency, open, onOpenChange, onAdded }) => {
  const { toast } = useToast();
  const [date, setDate] = useState(todayLocalISO());
  const [category, setCategory] = useState<string>('transport');
  const [description, setDescription] = useState('');
  const [vendor, setVendor] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<ExpensePaymentMethod>('personal');
  const [billable, setBillable] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [projects, setProjects] = useState<Array<{ id: string; name: string | null }>>([]);
  const [saving, setSaving] = useState(false);

  // Projects, so any expense can be tagged to the job it belongs to. Note this is INDEPENDENT of
  // `billable`: the project says which job bears the cost, `billable` says whether we on-charge it.
  // Tying them together hid every absorbed cost — our own travel to site — from that job's margin.
  useEffect(() => {
    if (!open || !workspaceId) return;
    void supabase.from('projects').select('id, name').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(200)
      .then(({ data }) => setProjects((data as any[]) ?? []));
  }, [open, workspaceId]);

  const save = async () => {
    const amt = parseDecimal(amount);
    if (!amt || amt <= 0) { toast({ title: 'Enter a valid amount', variant: 'destructive' }); return; }
    try {
      setSaving(true);
      await tripExpenseService.addItem({
        report_id: reportId, expense_date: date, category,
        description: description.trim() || null, vendor: vendor.trim() || null,
        amount: amt, currency, payment_method: method,
        billable, project_id: projectId || null,
      });
      setDescription(''); setVendor(''); setAmount(''); setBillable(false); setProjectId('');
      onOpenChange(false);
      onAdded();
    } catch (err: any) {
      toast({ title: 'Could not add expense', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Expense</DialogTitle><DialogDescription className="sr-only">Expense card form.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="tripexpensespanel-date" className="text-xs text-muted-foreground">Date</label>
              <Input id="tripexpensespanel-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label htmlFor="tripexpensespanel-category" className="text-xs text-muted-foreground">Category</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="tripexpensespanel-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRIP_EXPENSE_CATEGORIES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <label htmlFor="tripexpensespanel-description" className="text-xs text-muted-foreground">Description</label>
            <Input id="tripexpensespanel-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Taxi airport → hotel" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="tripexpensespanel-vendor" className="text-xs text-muted-foreground">Vendor</label>
              <Input id="tripexpensespanel-vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Beat / Hotel name" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Amount ({currency})</label>
              <Input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1">
              <label htmlFor="tripexpensespanel-paid-with" className="text-xs text-muted-foreground">Paid with</label>
              <Select value={method} onValueChange={(v: any) => setMethod(v)}>
                <SelectTrigger id="tripexpensespanel-paid-with"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">Personal funds</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="company_card">Company card</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {/* Billable → rebill to a project's client later (Bill to client on the approved card). */}
          <label className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2 cursor-pointer">
            <span className="text-xs">Billable to client <span className="text-muted-foreground">— on-charge this cost to a project's client</span></span>
            <Checkbox checked={billable} onCheckedChange={(v) => setBillable(v === true)} className="h-4 w-4"  />
          </label>
          {/* Always offered, billable or not — an absorbed cost still belongs to a job. */}
          <div className="space-y-1">
            <label htmlFor="tripexpensespanel-project" className="text-xs text-muted-foreground">
              Project <span className="text-muted-foreground">— which job bears this cost</span>
            </label>
            <Select value={projectId || '__none__'} onValueChange={(v) => setProjectId(v === '__none__' ? '' : v)}>
              <SelectTrigger id="tripexpensespanel-project"><SelectValue placeholder="Pick the project this cost belongs to" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— No project —</SelectItem>
                {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name || p.id.slice(0, 8)}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Counts towards the project&apos;s cost once approved.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TripExpensesPanel;
