/**
 * per-document action menu (the timologisi-style 3-dots). Reuses the actions that
 * already have implementations; the detail page hosts the heavier dialogs (payment /
 * credit note) so those entries deep-link there. myDATA submit + Copy MARK act inline.
 *
 * Self-contained "Tools" + "myDATA" sub-actions (Change description / Change category /
 * History / myDATA details + characterizations) load what they need by invoiceId, so the
 * menu drops into any list row without extra props.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { edgeErrorMessage } from '@/utils/edgeError';
import { MoreVertical, Eye, CreditCard, Send, Copy, Hash, Loader2, RefreshCw, Files, Mail, Pencil, Tag, History, Info, Download, Layers } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/core/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter , DialogDescription } from '@/components/core/ui/dialog';
import { Textarea } from '@/components/core/ui/textarea';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { fiscalConnectorService } from '@/services/fiscalConnectorService';
import { financeService, formatMoney, type InvoiceWithItems } from '@/modules/finance/services/financeService';
import { financeCategoriesService, type FinanceCategory } from '@/modules/finance/services/financeCategoriesService';
import { usePermissions } from '@/hooks/usePermissions';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useConnectEmailGate } from '@/modules/email/hooks/useConnectEmailGate';
import { SaveAsTemplateDialog } from '@/components/features/templates/SaveAsTemplateDialog';

interface Props {
  invoiceId: string;
  financeBase: string;          // '/finance' | '/admin/finance'
  fiscalStatus?: string | null; // when known by the caller (skips a fetch)
  fiscalMark?: string | null;
  status?: string | null;
  onChanged?: () => void;
}

export const InvoiceActionsMenu: React.FC<Props> = ({ invoiceId, financeBase, fiscalStatus, fiscalMark, status, onChanged }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { isAccountant, canOperateFinance } = usePermissions();
  const { activeWorkspaceId } = useWorkspace();
  const { handleEmailSendError, connectEmailGate } = useConnectEmailGate();
  // Accountant: may record payments, submit to myDATA, PDF — but not edit/create
  // documents (new invoice, credit note, template, change description/category).
  const [mark, setMark] = useState<string | null>(fiscalMark ?? null);
  const [fStatus, setFStatus] = useState<string | null>(fiscalStatus ?? null);
  const [submitting, setSubmitting] = useState(false);

  // Lazily-loaded full invoice (powers details / history / characterizations).
  const [detail, setDetail] = useState<InvoiceWithItems | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);

  // Dialog open flags + edit state
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [descValue, setDescValue] = useState('');
  const [catOpen, setCatOpen] = useState(false);
  const [catValue, setCatValue] = useState<string>('none');
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Lazy-load the fiscal fields the caller didn't pass (e.g. aging rows lack them).
  const hydrate = async () => {
    if (fiscalMark !== undefined && fiscalStatus !== undefined) return;
    const { data } = await supabase.from('invoices').select('fiscal_mark, fiscal_status').eq('id', invoiceId).maybeSingle();
    if (data) { setMark((data as any).fiscal_mark ?? null); setFStatus((data as any).fiscal_status ?? null); }
  };

  const loadDetail = async (): Promise<InvoiceWithItems | null> => {
    setDetailBusy(true);
    try {
      const inv = await financeService.getInvoice(invoiceId);
      setDetail(inv);
      return inv;
    } catch (err: any) {
      toast({ title: 'Failed to load document', description: err?.message, variant: 'destructive' });
      return null;
    } finally { setDetailBusy(false); }
  };

  const go = (suffix = '') => navigate(`${financeBase}/invoices/${invoiceId}${suffix}`);

  const copyMark = async () => {
    let m = mark;
    if (!m) { const { data } = await supabase.from('invoices').select('fiscal_mark').eq('id', invoiceId).maybeSingle(); m = (data as any)?.fiscal_mark ?? null; }
    if (!m) { toast({ title: 'No MARK yet', description: 'This invoice has not been transmitted to myDATA.', variant: 'destructive' }); return; }
    await navigator.clipboard.writeText(m);
    toast({ title: 'MARK copied' });
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}${financeBase}/invoices/${invoiceId}`);
    toast({ title: 'Link copied' });
  };

  /** One-shot copy of THIS document into a fresh draft. Distinct from "Save as template", which
   *  stores a reusable named shape in the library (#322) rather than another invoice. */
  const duplicateAsDraft = async () => {
    try {
      const newId = await financeService.duplicateInvoice(invoiceId);
      toast({ title: 'Draft created from this invoice' });
      navigate(`${financeBase}/invoices/${newId}`);
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    }
  };

  // One-click download of the document PDF (invoice / receipt / credit note all render via the
  // same finance-invoice-pdf edge function). Fetches the signed URL and saves the blob.
  const downloadPdf = async () => {
    try {
      const { pdf_url } = await financeService.generateInvoicePdf(invoiceId, true);
      if (!pdf_url) { toast({ title: 'PDF not available', variant: 'destructive' }); return; }
      const blob = await (await fetch(pdf_url)).blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `document-${invoiceId.slice(0, 8)}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: 'Failed to download', description: err?.message, variant: 'destructive' });
    }
  };

  const sendEmail = async () => {
    try {
      const { data, error } = await financeService.sendInvoiceEmail(invoiceId);
      if (error || data?.ok === false) {
        const description = data?.error ?? (error ? await edgeErrorMessage(error) : 'Email not sent');
        toast({ title: 'Email not sent', description, variant: 'destructive' });
        return;
      }
      toast({ title: 'Email sent', description: `To ${data?.sent_to}` });
    } catch (err: any) {
      if (await handleEmailSendError(err, { workspaceId: activeWorkspaceId, feature: 'invoice' })) return;
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    }
  };

  // ---- Tools: change description (notes) ----
  const openDesc = async () => {
    const inv = detail ?? await loadDetail();
    setDescValue(inv?.notes ?? '');
    setDescOpen(true);
  };
  const saveDesc = async () => {
    setSaving(true);
    try {
      await financeService.updateInvoice(invoiceId, { notes: descValue } as any);
      toast({ title: 'Description updated' });
      setDescOpen(false);
      setDetail((d) => d ? { ...d, notes: descValue } : d);
      onChanged?.();
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  // ---- Tools: change category ----
  const openCat = async () => {
    const inv = detail ?? await loadDetail();
    if (inv?.workspace_id) {
      try { setCategories(await financeCategoriesService.list(inv.workspace_id)); } catch { /* non-blocking */ }
    }
    setCatValue((inv as any)?.category_id ?? 'none');
    setCatOpen(true);
  };
  const saveCat = async () => {
    setSaving(true);
    try {
      await financeService.updateInvoice(invoiceId, { category_id: catValue === 'none' ? null : catValue } as any);
      toast({ title: 'Category updated' });
      setCatOpen(false);
      onChanged?.();
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const openDetails = async () => { if (!detail) await loadDetail(); setDetailsOpen(true); };
  const openHistory = async () => { if (!detail) await loadDetail(); setHistoryOpen(true); };

  const submitFiscal = async () => {
    setSubmitting(true);
    try {
      const res = await fiscalConnectorService.submitInvoice(invoiceId);
      const f: any = res?.fiscal;
      if (!f || f.ok === false) { toast({ title: 'Not submitted', description: f?.error, variant: 'destructive' }); }
      else if (f.skipped) { toast({ title: 'Already transmitted' }); }
      else if (f.status === 'accepted') { toast({ title: 'Transmitted to myDATA', description: `MARK ${f.mark}` }); }
      else if (f.status === 'offline') { toast({ title: 'Accepted — AADE offline', description: 'Final MARK assigned shortly.' }); }
      else if (f.status === 'rejected') { toast({ title: 'Rejected by myDATA', description: f.errorMessage ?? f.errorCode, variant: 'destructive' }); }
      else { toast({ title: 'Submitted', description: String(f.status ?? 'done') }); }
      onChanged?.();
    } catch (err: any) {
      toast({ title: 'Submit failed', description: err?.message, variant: 'destructive' });
    } finally { setSubmitting(false); }
  };

  const accepted = fStatus === 'accepted' || fStatus === 'offline';
  const canSubmit = status !== 'draft' && status !== 'void' && !accepted;

  return (
    <>
    <DropdownMenu onOpenChange={(o) => { if (o) void hydrate(); }}>
      <DropdownMenuTrigger asChild>
        <button type="button" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={(e) => e.stopPropagation()}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
        {/* "View", "Record payment", "View / print" and "Issue credit note" all ran the identical
            go() — four advertised capabilities, one behaviour, and picking "Record payment" landed
            on a page with nothing open. They deep-link now; InvoiceDetailPage reads ?action= and
            opens the matching dialog. "View / print" is gone: it was a third label for the same
            navigation, and printing is what "Download PDF" below does. */}
        <DropdownMenuItem onClick={() => go()}><Eye className="h-4 w-4 mr-2" /> Open</DropdownMenuItem>
        {canOperateFinance && <DropdownMenuItem onClick={() => go('?action=payment')}><CreditCard className="h-4 w-4 mr-2" /> Record payment</DropdownMenuItem>}
        <DropdownMenuItem onClick={downloadPdf}><Download className="h-4 w-4 mr-2" /> Download PDF</DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">myDATA</DropdownMenuLabel>
        {canSubmit && canOperateFinance && <DropdownMenuItem onClick={submitFiscal}><Send className="h-4 w-4 mr-2" /> Submit to myDATA</DropdownMenuItem>}
        <DropdownMenuItem onClick={openDetails}><Info className="h-4 w-4 mr-2" /> myDATA details</DropdownMenuItem>
        <DropdownMenuItem onClick={copyMark}><Hash className="h-4 w-4 mr-2" /> Copy MARK</DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">Tools</DropdownMenuLabel>
        <DropdownMenuItem onClick={openHistory}><History className="h-4 w-4 mr-2" /> History</DropdownMenuItem>
        {!isAccountant && <DropdownMenuItem onClick={openDesc}><Pencil className="h-4 w-4 mr-2" /> Change description</DropdownMenuItem>}
        {!isAccountant && <DropdownMenuItem onClick={openCat}><Tag className="h-4 w-4 mr-2" /> Change category</DropdownMenuItem>}
        <DropdownMenuItem onClick={copyLink}><Copy className="h-4 w-4 mr-2" /> Copy link</DropdownMenuItem>

        <DropdownMenuSeparator />
        {!isAccountant && <DropdownMenuItem onClick={() => go('?action=credit_note')}><RefreshCw className="h-4 w-4 mr-2" /> Issue credit note</DropdownMenuItem>}
        {!isAccountant && <DropdownMenuItem onClick={duplicateAsDraft}><Files className="h-4 w-4 mr-2" /> Duplicate as draft</DropdownMenuItem>}
        {!isAccountant && <DropdownMenuItem onClick={() => setSaveTemplateOpen(true)}><Layers className="h-4 w-4 mr-2" /> Save as template</DropdownMenuItem>}
        {!isAccountant && <DropdownMenuItem onClick={sendEmail}><Mail className="h-4 w-4 mr-2" /> Send email</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>

    {/* Save as template (#322) — stores the reusable shape, not another invoice. */}
    <SaveAsTemplateDialog
      entityType="invoice"
      sourceId={invoiceId}
      open={saveTemplateOpen}
      onOpenChange={setSaveTemplateOpen}
    />

    {/* Change description */}
    <Dialog open={descOpen} onOpenChange={setDescOpen}>
      <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader><DialogTitle>Change Description</DialogTitle><DialogDescription className="sr-only">Confirm this invoice action.</DialogDescription></DialogHeader>
        <Textarea value={descValue} onChange={(e) => setDescValue(e.target.value)} rows={4} placeholder="Internal note / Description for this document…" />
        <DialogFooter>
          <Button variant="outline" onClick={() => setDescOpen(false)}>Cancel</Button>
          <Button onClick={saveDesc} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Change category */}
    <Dialog open={catOpen} onOpenChange={setCatOpen}>
      <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader><DialogTitle>Change Category</DialogTitle><DialogDescription className="sr-only">Confirm this invoice action.</DialogDescription></DialogHeader>
        <div className="space-y-2">
          <Label>Category</Label>
          <Select value={catValue} onValueChange={setCatValue}>
            <SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— No category —</SelectItem>
              {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCatOpen(false)}>Cancel</Button>
          <Button onClick={saveCat} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* myDATA details + characterizations */}
    <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
      <DialogContent className="sm:max-w-lg" onClick={(e) => e.stopPropagation()}>
        <DialogHeader><DialogTitle>myDATA Details</DialogTitle><DialogDescription className="sr-only">Confirm this invoice action.</DialogDescription></DialogHeader>
        {detailBusy && !detail ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : detail ? (
          <div className="space-y-4 text-sm">
            <dl className="grid grid-cols-3 gap-x-3 gap-y-2">
              <dt className="text-muted-foreground">Status</dt>
              <dd className="col-span-2"><Badge variant="outline" className="text-[10px]">{(detail as any).fiscal_status ?? 'not transmitted'}</Badge></dd>
              <dt className="text-muted-foreground">MARK</dt>
              <dd className="col-span-2 font-mono text-xs break-all">{(detail as any).fiscal_mark ?? '—'}</dd>
              <dt className="text-muted-foreground">UID</dt>
              <dd className="col-span-2 font-mono text-xs break-all">{(detail as any).fiscal_uid ?? '—'}</dd>
              <dt className="text-muted-foreground">Legal number</dt>
              <dd className="col-span-2 font-mono text-xs">{(detail as any).legal_number ?? '—'}</dd>
              <dt className="text-muted-foreground">Submitted</dt>
              <dd className="col-span-2">{(detail as any).fiscal_submitted_at ? new Date((detail as any).fiscal_submitted_at).toLocaleString() : '—'}</dd>
              <dt className="text-muted-foreground">Connector</dt>
              <dd className="col-span-2">{(detail as any).fiscal_connector_slug ?? '—'}</dd>
            </dl>
            {(detail as any).fiscal_qr_url && (
              <a href={(detail as any).fiscal_qr_url} target="_blank" rel="noreferrer" className="text-primary hover:underline text-xs break-all">{(detail as any).fiscal_qr_url}</a>
            )}
            <div>
              <div className="text-[10px] uppercase text-muted-foreground mb-1">Characterizations (income classification)</div>
              <div className="rounded border border-border/50 divide-y divide-border/40">
                {detail.items.length === 0 && <div className="px-3 py-2 text-muted-foreground">No lines.</div>}
                {detail.items.map((it) => (
                  <div key={it.id} className="px-3 py-2 flex items-center justify-between gap-2">
                    <span className="truncate">{it.description ?? 'Item'}</span>
                    <span className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {((it as any).income_classification_type || (it as any).income_classification_category)
                        ? `${(it as any).income_classification_type ?? '—'} / ${(it as any).income_classification_category ?? '—'}`
                        : '— not characterized —'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          {(detail as any)?.fiscal_mark && <Button variant="outline" onClick={copyMark}><Hash className="h-4 w-4 mr-2" /> Copy MARK</Button>}
          <Button onClick={() => setDetailsOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* History — derived timeline from the document's own lifecycle + payments + credit notes */}
    <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
      <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader><DialogTitle>History</DialogTitle><DialogDescription className="sr-only">Confirm this invoice action.</DialogDescription></DialogHeader>
        {detailBusy && !detail ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : detail ? (
          <ol className="relative border-l border-border/50 ml-2 space-y-3 text-sm">
            {buildHistory(detail).map((e, idx) => (
              <li key={idx} className="ml-4">
                <span className="absolute -left-[5px] mt-1.5 h-2 w-2 rounded-full bg-primary" />
                <div className="flex items-center justify-between gap-2">
                  <span>{e.label}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{e.when ? new Date(e.when).toLocaleString() : ''}</span>
                </div>
              </li>
            ))}
          </ol>
        ) : null}
        <DialogFooter><Button onClick={() => setHistoryOpen(false)}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    {connectEmailGate}
    </>
  );
};

/** Build an honest event timeline from the invoice's own lifecycle fields + children. */
function buildHistory(inv: InvoiceWithItems): { label: string; when: string | null }[] {
  const out: { label: string; when: string | null }[] = [];
  out.push({ label: 'Created', when: inv.created_at });
  const legalNo = (inv as any).legal_number as string | null;
  if (inv.issued_at) out.push({ label: `Issued${legalNo ? ` · ${legalNo}` : ''}`, when: inv.issued_at });
  const submittedAt = (inv as any).fiscal_submitted_at as string | null;
  if (submittedAt) out.push({ label: `Transmitted to myDATA${(inv as any).fiscal_mark ? ` · MARK ${(inv as any).fiscal_mark}` : ''}`, when: submittedAt });
  for (const p of inv.payments ?? []) {
    // Named by the ACCOUNT it moved through, not the method derived from that account.
    out.push({ label: `Payment ${formatMoney(p.amount, p.currency)}${p.bank_account_name ? ` (${p.bank_account_name})` : ''}`, when: p.paid_at });
  }
  for (const cn of inv.credit_notes ?? []) {
    out.push({ label: `Credit note ${(cn as any).credit_note_number ?? ''} ${formatMoney((cn as any).total ?? (cn as any).amount, cn.currency)}`, when: (cn as any).issued_at });
  }
  return out.sort((a, b) => (a.when ?? '').localeCompare(b.when ?? ''));
}
