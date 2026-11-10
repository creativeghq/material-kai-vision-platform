import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle, CheckCircle2, Download, Eye, FileMinus, FileText, FolderOpen, Loader2, MoreHorizontal,
  Pencil, Plus, Send, Truck,
} from 'lucide-react';

import { FINANCE_BASE, FINANCE_TAB, financeTabUrl } from '@/modules/finance/routes';
import { supabase } from '@/integrations/supabase/client';
import { humanizeLabel } from '@/utils/humanize';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/core/ui/dropdown-menu';
import {
  HubEmptyState, HubPanel, HubProperty, HubPropertyList, HubRecordPage, HubStatTile, LinkedRecordsPanel,
} from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { financeService, formatMoney, type InvoiceWithItems } from '@/modules/finance/services/financeService';
import { ReceiveReturnDialog } from '@/modules/finance/components/ReceiveReturnDialog';
import { fiscalConnectorService } from '@/services/fiscalConnectorService';
import { mydataPaymentLabel } from '@/modules/finance/paymentVocabulary';
import { movePurposeLabel } from '@/services/fiscal/fiscalVocabulary';
import { usePermissions } from '@/hooks/usePermissions';
import { ProjectLinkField } from '@/modules/finance/components/ProjectLinkField';
import { InvoicePreviewModal } from '@/modules/finance/components/InvoicePreviewModal';
import { WholesaleCardNotice } from '@/modules/finance/components/WholesaleCardNotice';
import { NewCreditNoteDialog } from '@/modules/finance/components/NewCreditNoteDialog';
import { NewInvoiceDialog } from '@/modules/finance/components/NewInvoiceDialog';
import { RecordPaymentDialog } from '@/modules/finance/components/RecordPaymentDialog';
import { PaymentReceiptActions } from '@/modules/finance/components/PaymentReceiptActions';
import { PaymentProofsCard } from '@/modules/finance/components/PaymentProofsCard';
import { FiscalRecordPanel, useFiscalAuthCode } from '@/modules/finance/components/FiscalRecordPanel';
import { CustomerLinkPanel } from '@/modules/finance/components/CustomerLinkPanel';
import { mintCustomerLink } from '@/modules/finance/services/customerLinks';
import { SendOnWhatsAppButton } from '@/modules/messaging/components/SendOnWhatsAppButton';
import { resolvePrintedCounterparty } from '@/modules/finance/invoice-templates/counterparty';
import { formatDate } from '@/utils/datetime';

const STATUS_VARIANT: Record<string, 'success' | 'info' | 'warning' | 'error' | 'neutral'> = {
  paid: 'success', issued: 'info', sent: 'info', partially_paid: 'warning', overdue: 'error',
  draft: 'neutral', void: 'neutral', credit_noted: 'neutral',
};

const crumbs = (title: string) => [
  { label: 'Finance', to: FINANCE_BASE },
  { label: 'Invoices', to: financeTabUrl(FINANCE_TAB.invoices) },
  { label: title },
];

const InvoiceDetailPage: React.FC = () => {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();
  const financeBase = FINANCE_BASE;
  const { toast } = useToast();
  const [invoice, setInvoice] = useState<InvoiceWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [creditNoteDialogOpen, setCreditNoteDialogOpen] = useState(false);
  const [returnFor, setReturnFor] = useState<{ id: string; number: string | null } | null>(null);
  const [fiscalBusy, setFiscalBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [projectSaving, setProjectSaving] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  /** Derived in SQL (`get_invoice_edit_verdict`): editable until myDATA returns a MARK. */
  const [editVerdict, setEditVerdict] = useState<{ editable: boolean; reason: string | null } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  /** Drafts carry no counterparty snapshot yet, so their customer is read live. */
  const [liveParty, setLiveParty] = useState<Record<string, unknown> | null>(null);
  const { can, isWorkspaceManager } = usePermissions();
  const canEditProject = can('finance.manage');
  const authCode = useFiscalAuthCode('invoices', invoiceId ?? '', (invoice as any)?.fiscal_mark ?? null);

  const handleProjectChange = async (projectId: string | null) => {
    if (!invoiceId) return;
    setProjectSaving(true);
    try {
      await financeService.updateInvoice(invoiceId, { project_id: projectId } as any);
      setInvoice((prev) => (prev ? ({ ...prev, project_id: projectId } as InvoiceWithItems) : prev));
      toast({ title: projectId ? 'Invoice attached to the project' : 'Invoice detached from its project' });
    } catch (e) {
      toast({ title: 'Failed to update the project', description: (e as Error).message, variant: 'destructive' });
    } finally { setProjectSaving(false); }
  };
  /** Consume `?action=` from InvoiceActionsMenu. */
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const action = searchParams.get('action');
    if (!action || !invoice) return;
    const actionable = invoice.status !== 'void' && invoice.status !== 'credit_noted' && invoice.status !== 'draft';
    if (actionable) {
      if (action === 'payment') setPaymentDialogOpen(true);
      else if (action === 'credit_note') setCreditNoteDialogOpen(true);
    }
    const next = new URLSearchParams(searchParams);
    next.delete('action');
    setSearchParams(next, { replace: true });
  }, [invoice, searchParams, setSearchParams]);

  const handleDownloadPdf = async () => {
    if (!invoice) return;
    try {
      setPdfBusy(true);
      const { pdf_url } = await financeService.generateInvoicePdf(invoice.id, true);
      if (pdf_url) window.open(pdf_url, '_blank');
      else toast({ title: 'PDF generated but no URL returned', variant: 'destructive' });
    } catch (err: any) {
      toast({ title: 'PDF generation failed', description: err?.message, variant: 'destructive' });
    } finally {
      setPdfBusy(false);
    }
  };

  useEffect(() => {
    if (!invoiceId) return;
    void load();
  }, [invoiceId]);

  const [pnlSaving, setPnlSaving] = useState(false);
  const togglePnlExclusion = async () => {
    if (!invoice) return;
    const next = !(invoice as any).exclude_from_pnl;
    setPnlSaving(true);
    try {
      await financeService.setDocumentPnlExclusion('invoice', invoice.id, next);
      toast({ title: next ? 'Excluded from P&L' : 'Included in P&L', description: next ? 'Still counted for VAT, myDATA and what the customer owes.' : undefined });
      await load();
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setPnlSaving(false); }
  };

  const load = async () => {
    if (!invoiceId) return;
    try {
      setLoading(true);
      setError(null);
      const [inv, verdict] = await Promise.all([
        financeService.getInvoice(invoiceId),
        supabase.rpc('get_invoice_edit_verdict' as any, { p_invoice_id: invoiceId }),
      ]);
      setInvoice(inv);
      setEditVerdict((verdict.data as any) ?? null);
      if (!(inv as any).counterparty_snapshot?.row && (inv.customer_company_id || inv.customer_contact_id)) {
        const { data: live } = inv.customer_company_id
          ? await supabase.from('crm_companies').select('*').eq('id', inv.customer_company_id).maybeSingle()
          : await supabase.from('crm_contacts').select('*').eq('id', inv.customer_contact_id!).maybeSingle();
        setLiveParty((live as Record<string, unknown> | null) ?? null);
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load invoice');
    } finally {
      setLoading(false);
    }
  };

  const handleIssue = async () => {
    if (!invoice) return;
    try {
      await financeService.markInvoiceIssued(invoice.id);
      toast({ title: 'Invoice Issued' });
      // Issuing is "created, not draft": the workspace setting decides whether AADE gets it now.
      const { data: fsRow } = await supabase.from('finance_settings')
        .select('auto_send_to_aade').eq('workspace_id', (invoice as any).workspace_id).maybeSingle();
      if ((fsRow as any)?.auto_send_to_aade !== false) { await handleSubmitFiscal(); return; }
      await load();
    } catch (err: any) {
      toast({ title: 'Issue Failed', description: err.message, variant: 'destructive' });
    }
  };

  const handleSubmitFiscal = async () => {
    if (!invoice) return;
    try {
      setFiscalBusy(true);
      const res = await fiscalConnectorService.submitInvoice(invoice.id);
      const f: any = res?.fiscal;
      if (!f) {
        toast({ title: 'No Fiscal Response', variant: 'destructive' });
      } else if (f.ok === false) {
        toast({ title: 'Not Submitted', description: f.error, variant: 'destructive' });
      } else if (f.skipped) {
        toast({ title: 'Already Transmitted', description: 'This invoice has a myDATA MARK already.' });
      } else if (f.status === 'accepted') {
        toast({ title: 'Transmitted to myDATA', description: `MARK ${f.mark}` });
      } else if (f.status === 'offline') {
        toast({ title: 'Accepted — AADE offline', description: 'The final MARK will be assigned automatically shortly.' });
      } else if (f.status === 'rejected') {
        toast({ title: 'Rejected by myDATA', description: f.errorMessage ?? f.errorCode ?? 'Validation error', variant: 'destructive' });
      } else {
        toast({ title: 'Submitted', description: String(f.status ?? 'done') });
      }
      await load();
    } catch (err: any) {
      toast({ title: 'Submit Failed', description: err?.message, variant: 'destructive' });
    } finally {
      setFiscalBusy(false);
    }
  };

  if (loading && !invoice) {
    return (
      <div className="flex h-[calc(100vh-200px)] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="p-6">
        <HubEmptyState
          icon={FileText}
          title="Invoice not found"
          description={error ?? 'It may have been removed, or it belongs to another workspace.'}
          action={<Button variant="outline" onClick={() => navigate(financeTabUrl(FINANCE_TAB.invoices))}>Back to Invoices</Button>}
        />
      </div>
    );
  }

  const inv = invoice as any;
  const cur = invoice.currency;
  /** A draft has no legal number; void and credit_noted are closed. Only "Mark Issued" applies to a draft. */
  const isActionable = invoice.status !== 'void'
    && invoice.status !== 'credit_noted'
    && invoice.status !== 'draft';
  const transmitted = inv.fiscal_status === 'accepted' || inv.fiscal_status === 'offline';
  const canSendFiscal = invoice.status !== 'draft' && !transmitted;

  const totalMargin = invoice.items.reduce((acc, it) => acc + (it.line_margin ?? 0), 0);
  const totalCogs = invoice.items.reduce((acc, it) => acc + (it.line_cost ?? 0), 0);
  const costKnown = invoice.items.some((it) => it.line_cost != null);
  const marginPct =
    costKnown && invoice.subtotal_net > 0 ? (totalMargin / invoice.subtotal_net) * 100 : null;
  const party = resolvePrintedCounterparty(inv.counterparty_snapshot?.row ?? null, liveParty as any);
  const customerTo = invoice.customer_company_id
    ? `/crm/companies/${invoice.customer_company_id}`
    : invoice.customer_contact_id ? `/crm/contacts/${invoice.customer_contact_id}` : null;
  const credited = Number(invoice.amount_credited ?? 0);
  const withheld = Number(inv.total_withheld_amount ?? 0);
  const fiscalStale = inv.fiscal_status === 'offline'
    && Date.now() - new Date(inv.fiscal_submitted_at ?? inv.updated_at ?? Date.now()).getTime() >= 24 * 3600 * 1000;

  const subtitle = [
    party?.name,
    invoice.issued_at ? `Issued ${formatDate(invoice.issued_at)}` : 'Not issued yet',
    invoice.due_at ? `Due ${formatDate(invoice.due_at)}` : null,
  ].filter(Boolean).join(' · ');

  const actions = (
    <>
      <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
        <Eye className="mr-1.5 h-4 w-4" /> Preview
      </Button>
      {invoice.status === 'draft' && (
        <Button size="sm" onClick={handleIssue}>
          <CheckCircle2 className="mr-1.5 h-4 w-4" /> Mark Issued
        </Button>
      )}
      {isActionable && (
        <Button size="sm" onClick={() => setPaymentDialogOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> Record payment
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" aria-label="More actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {editVerdict?.editable && (
            <DropdownMenuItem onSelect={() => setEditOpen(true)}><Pencil className="mr-2 h-4 w-4" /> Edit invoice</DropdownMenuItem>
          )}
          <DropdownMenuItem disabled={pdfBusy} onSelect={() => void handleDownloadPdf()}>
            {pdfBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} Download PDF
          </DropdownMenuItem>
          {canSendFiscal && (
            <DropdownMenuItem disabled={fiscalBusy} onSelect={() => void handleSubmitFiscal()}>
              <Send className="mr-2 h-4 w-4" /> Send to AADE
            </DropdownMenuItem>
          )}
          {canEditProject && (
            <DropdownMenuItem onSelect={() => setProjectOpen(true)}>
              <FolderOpen className="mr-2 h-4 w-4" /> {inv.project_id ? 'Change project' : 'Link to project'}
            </DropdownMenuItem>
          )}
          {isActionable && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setCreditNoteDialogOpen(true)}>
                <FileMinus className="mr-2 h-4 w-4" /> Issue credit note
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );

  const detailRows: [string, React.ReactNode][] = [
    ['Payment Method', inv.payment_method_code ? mydataPaymentLabel(inv.payment_method_code) : null],
    ['Payment Note', inv.payment_method_info],
    ['Related Document', inv.related_document],
    ['Digital Transaction Fee', Number(inv.digital_transaction_fee) > 0 ? formatMoney(inv.digital_transaction_fee, cur) : null],
    ['Prices Include VAT', inv.prices_include_vat ? 'Yes' : null],
    ['VAT Payment Suspension', inv.vat_payment_suspension ? 'Yes' : null],
  ];

  const left = (
    <>
      <HubPanel title="Details">
        <HubPropertyList>
          <HubProperty label="Status">
            <span className="flex flex-wrap gap-1.5">
              <Badge variant={STATUS_VARIANT[invoice.status] ?? 'neutral'}>{humanizeLabel(invoice.status)}</Badge>
              {inv.has_shipping && <Badge variant="neutral" className="gap-1"><Truck className="h-3 w-3" /> With shipping</Badge>}
            </span>
          </HubProperty>
          <HubProperty label="Customer">
            {party?.name
              ? (customerTo ? <Link className="text-primary hover:underline" to={customerTo}>{party.name}</Link> : party.name)
              : null}
            {party?.vatNumber && <span className="block text-xs text-muted-foreground">VAT {party.vatNumber}</span>}
          </HubProperty>
          <HubProperty label="Document Type">{inv.document_type ?? null}</HubProperty>
          {inv.series && <HubProperty label="Series">{inv.series}</HubProperty>}
          <HubProperty label="Issued">{invoice.issued_at ? formatDate(invoice.issued_at) : 'Not issued yet'}</HubProperty>
          <HubProperty label="Due">{invoice.due_at ? formatDate(invoice.due_at) : null}</HubProperty>
          {Number(inv.branch_code ?? 0) > 0 && <HubProperty label="Establishment">#{inv.branch_code}</HubProperty>}
          {detailRows.filter(([, v]) => v).map(([label, value]) => (
            <HubProperty key={label} label={label}>{value}</HubProperty>
          ))}
          {(inv.order_id || inv.quote_id) && (
            <HubProperty label="Source">
              <span className="flex flex-wrap gap-3">
                {inv.order_id && <Link to={`${financeBase}/orders/${inv.order_id}`} className="text-primary hover:underline">View order</Link>}
                {(invoice as any).quote_id && <Link to={`/quotes/manage/${(invoice as any).quote_id}`} className="text-primary hover:underline">View quote</Link>}
              </span>
            </HubProperty>
          )}
          <HubProperty label="P&L">
            <label htmlFor="invoice-exclude-pnl" className={`flex items-start gap-2 ${canEditProject && !pnlSaving ? 'cursor-pointer' : 'opacity-70'}`}>
              <Checkbox id="invoice-exclude-pnl" className="mt-0.5 h-4 w-4 rounded" checked={inv.exclude_from_pnl === true} disabled={!canEditProject || pnlSaving} onCheckedChange={() => void togglePnlExclusion()} />
              <span>
                Exclude from P&amp;L
                <span className="block text-xs text-muted-foreground">Still counts for VAT, myDATA and what the customer owes</span>
              </span>
            </label>
          </HubProperty>
        </HubPropertyList>
      </HubPanel>
      <FiscalRecordPanel
        record={inv}
        authenticationCode={authCode}
        sending={fiscalBusy}
        onSend={canSendFiscal ? () => void handleSubmitFiscal() : undefined}
      />
      {isActionable && (
        <CustomerLinkPanel
          kind="invoice" id={invoice.id} workspaceId={invoice.workspace_id} label={`Invoice ${invoice.internal_number ?? ''}`.trim()}
          extra={
            <SendOnWhatsAppButton
              contactId={invoice.customer_contact_id ?? null}
              companyId={invoice.customer_company_id ?? null}
              message={`Invoice ${invoice.internal_number ?? ''}`}
              resolveMessage={async () => `Invoice ${invoice.internal_number ?? ''}: ${await mintCustomerLink('invoice', invoice.id)}`}
              label="Inbox"
              variant="outline"
            />
          }
        />
      )}
    </>
  );

  return (
    <HubRecordPage
      icon={FileText}
      title={invoice.internal_number ?? 'Draft invoice'}
      subtitle={subtitle}
      breadcrumbs={crumbs(invoice.internal_number ?? 'Draft invoice')}
      actions={actions}
      left={left}
      overlays={
        <>
          <Dialog open={projectOpen} onOpenChange={setProjectOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>Link to Project</DialogTitle></DialogHeader>
              <ProjectLinkField
                workspaceId={inv.workspace_id}
                projectId={inv.project_id ?? null}
                onChange={async (id) => { await handleProjectChange(id); setProjectOpen(false); }}
                disabled={projectSaving}
              />
            </DialogContent>
          </Dialog>
          <RecordPaymentDialog
            workspaceId={invoice.workspace_id}
            presetInvoiceId={invoice.id}
            defaultAmount={Number(invoice.amount_due) || undefined}
            initialCounterparty={{ companyId: invoice.customer_company_id ?? null, contactId: invoice.customer_contact_id ?? null }}
            open={paymentDialogOpen}
            onOpenChange={setPaymentDialogOpen}
            onSaved={async () => { setPaymentDialogOpen(false); await load(); }}
          />
          <NewInvoiceDialog
            workspaceId={inv.workspace_id}
            open={editOpen}
            onOpenChange={setEditOpen}
            editInvoiceId={editOpen ? invoice.id : null}
            onCreated={async () => { setEditOpen(false); await load(); }}
          />
          <NewCreditNoteDialog
            workspaceId={invoice.workspace_id}
            presetInvoiceId={invoice.id}
            open={creditNoteDialogOpen}
            onOpenChange={setCreditNoteDialogOpen}
            onCreated={async () => { setCreditNoteDialogOpen(false); await load(); }}
          />
          {returnFor && (
            <ReceiveReturnDialog
              creditNoteId={returnFor.id}
              creditNoteNumber={returnFor.number}
              open={!!returnFor}
              onOpenChange={(v) => { if (!v) setReturnFor(null); }}
              onDone={() => { setReturnFor(null); void load(); }}
            />
          )}
          <InvoicePreviewModal
            invoiceId={invoice.id}
            workspaceId={invoice.workspace_id}
            open={previewOpen}
            onOpenChange={setPreviewOpen}
          />
        </>
      }
    >
      {inv.fiscal_status === 'rejected' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          <div className="flex min-w-0 items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="min-w-0">
              <p className="font-medium text-destructive">AADE refused this invoice</p>
              <p className="text-xs text-muted-foreground break-words">
                {inv.fiscal_error ?? 'No reason returned.'} It has no MARK, so fix the cause and send it again under the same number.
              </p>
            </div>
          </div>
          {editVerdict?.editable && (
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}><Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit invoice</Button>
          )}
        </div>
      )}
      {fiscalStale && (
        <div className="rounded-md border border-[hsl(var(--warning)/0.4)] bg-[hsl(var(--warning-bg))] px-4 py-3 text-sm text-[hsl(var(--warning))]">
          Awaiting transmission for over 24 hours. It holds a legal number but has no MARK — check the provider portal before re-issuing.
        </div>
      )}

      <WholesaleCardNotice invoiceId={invoiceId ?? null} />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <HubStatTile label="Total" value={formatMoney(invoice.total, cur)} />
        <HubStatTile label="Paid" value={formatMoney(invoice.amount_paid, cur)} />
        <HubStatTile label="Due" value={formatMoney(invoice.amount_due, cur)} />
        <HubStatTile
          label="Margin"
          value={costKnown ? formatMoney(totalMargin, cur) : '—'}
          help={costKnown ? `COGS ${formatMoney(totalCogs, cur)}${marginPct != null ? ` · ${marginPct.toFixed(1)}% of net` : ''}` : 'No cost recorded on any line'}
        />
      </div>

      <Card>
        <CardHeader className="border-b border-border/60 px-5 py-3">
          <CardTitle>Line Items</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="table-scroll">
          <table className="w-full text-sm">
            <thead className="bg-surface-sunken text-[11px] font-semibold text-muted-foreground">
              <tr className="border-b border-border/60">
                <th className="px-4 py-2 text-left">Description</th>
                <th className="px-4 py-2 text-left">SKU</th>
                <th className="px-4 py-2 text-right">Qty</th>
                <th className="px-4 py-2 text-right">Unit Price</th>
                <th className="px-4 py-2 text-right">Line Total</th>
                <th className="px-4 py-2 text-right">Cost</th>
                <th className="px-4 py-2 text-right">Margin</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">No line items.</td></tr>
              )}
              {invoice.items.map((it) => (
                <tr key={it.id} className="border-b border-border/30">
                  <td className="px-4 py-2">{it.description ?? '(no description)'}</td>
                  <td className="px-4 py-2 font-mono text-xs">{it.sku ?? '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{it.quantity}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatMoney(it.unit_price, cur)}</td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums">{formatMoney(it.line_total, cur)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{it.line_cost == null ? '—' : formatMoney(it.line_cost, cur)}</td>
                  <td className={`px-4 py-2 text-right font-medium tabular-nums ${it.line_margin < 0 ? 'text-destructive' : ''}`}>
                    {it.line_cost == null ? '—' : formatMoney(it.line_margin, cur)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <dl className="ml-auto w-full max-w-xs space-y-1 px-5 py-4 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Net</dt><dd className="tabular-nums">{formatMoney(invoice.subtotal_net, cur)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">VAT</dt><dd className="tabular-nums">{formatMoney(invoice.vat_amount, cur)}</dd></div>
            {withheld > 0 && (
              <div className="flex justify-between"><dt className="text-muted-foreground">Withholding</dt><dd className="tabular-nums">− {formatMoney(withheld, cur)}</dd></div>
            )}
            <div className="flex justify-between border-t border-hairline pt-2 font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatMoney(invoice.total, cur)}</dd></div>
            {credited > 0.005 && (
              <div className="flex justify-between text-xs"><dt className="text-muted-foreground">Credited</dt><dd className="tabular-nums">{formatMoney(credited, cur)}</dd></div>
            )}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 border-b border-border/60 px-5 py-3">
          <CardTitle>Payments</CardTitle>
          {isActionable && Number(invoice.amount_due) > 0.005 && (
            <Button size="sm" variant="outline" onClick={() => setPaymentDialogOpen(true)}><Plus className="mr-1.5 h-3.5 w-3.5" /> Record payment</Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="table-scroll">
          <table className="w-full text-sm">
            <thead className="bg-surface-sunken text-[11px] font-semibold text-muted-foreground">
              <tr className="border-b border-border/60">
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-left">Account</th>
                <th className="px-4 py-2 text-left">Reference</th>
                <th className="px-4 py-2 text-right">Amount Allocated</th>
                <th className="px-4 py-2 text-right w-24">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {(invoice.payments ?? []).length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No payments recorded.</td></tr>
              )}
              {(invoice.payments ?? []).map((p) => {
                const allocAmount = p.allocations
                  .filter((a) => a.invoice_id === invoice.id)
                  .reduce((acc, a) => acc + Number(a.amount ?? 0), 0);
                return (
                  <tr key={p.id} className="border-b border-border/30">
                    <td className="px-4 py-2">{formatDate(p.paid_at)}</td>
                    <td className="px-4 py-2">{p.bank_account_name ?? '—'}</td>
                    <td className="px-4 py-2">{p.reference ?? '—'}</td>
                    {/* `a.amount` is in the INVOICE's currency, so it is labelled with it, not the payment's. */}
                    <td className="px-4 py-2 text-right font-medium tabular-nums">{formatMoney(allocAmount, cur)}</td>
                    <td className="px-4 py-2 text-right"><PaymentReceiptActions paymentId={p.id} direction={(p as any).direction ?? 'in'} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </CardContent>
      </Card>

      <PaymentProofsCard
        invoiceId={invoice.id}
        workspaceId={invoice.workspace_id}
        currency={cur}
        canManage={isWorkspaceManager}
        outstanding={Number(invoice.amount_due) || 0}
        onChanged={() => void load()}
      />

      {(invoice.credit_notes ?? []).length > 0 && (
        <Card>
          <CardHeader className="border-b border-border/60 px-5 py-3">
            <CardTitle>Credit Notes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="border-b border-border/60 bg-surface-sunken text-[11px] font-semibold text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Number</th>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Type / myDATA</th>
                  <th className="px-4 py-2 text-left">Reason</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2 text-right">Goods</th>
                </tr>
              </thead>
              <tbody>
                {(invoice.credit_notes ?? []).map((cn: any) => (
                  <tr key={cn.id} className="border-b border-border/30">
                    <td className="px-4 py-2 font-mono text-xs">{cn.credit_note_number}</td>
                    <td className="px-4 py-2">{cn.issued_at ? formatDate(cn.issued_at) : '—'}</td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className="mr-1">{cn.document_type ?? '—'}</Badge>
                      {cn.fiscal_mark
                        ? <span className="font-mono text-[11px] text-muted-foreground">{cn.fiscal_mark}</span>
                        : <span className="text-[11px] text-muted-foreground italic">{cn.fiscal_status ?? 'not sent'}</span>}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{cn.reason ?? '—'}</td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">{formatMoney(cn.total ?? cn.amount, cn.currency)}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      {cn.goods_returned_at ? (
                        <span className="text-[11px] text-muted-foreground">
                          Back in stock {formatDate(cn.goods_returned_at)}
                        </span>
                      ) : (
                        <Button size="sm" variant="ghost" className="h-6 text-[11px]"
                          onClick={() => setReturnFor({ id: cn.id, number: cn.credit_note_number ?? null })}>
                          Receive Goods
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </CardContent>
        </Card>
      )}

      {inv.has_shipping && (
        <Card>
          <CardHeader className="border-b border-border/60 px-5 py-3">
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-4 w-4" /> Shipping &amp; Transport
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-x-8 gap-y-3 p-5 text-sm sm:grid-cols-2">
            {[
              ['Loading Place', inv.ship_from],
              ['Delivery Place', inv.ship_to],
              ['Transport Date', inv.transport_date],
              ['Time', inv.transport_time],
              ['Vehicle No.', inv.vehicle_number],
              ['Responsible', inv.responsible],
              ['Purpose', inv.move_purpose ? `${inv.move_purpose} — ${movePurposeLabel(inv.move_purpose)}` : null],
            ].map(([label, value]) => (
              <div key={label as string} className="flex justify-between gap-3">
                <span className="text-muted-foreground">{label}</span>
                <span className="text-right font-medium">{value ? String(value) : '—'}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <LinkedRecordsPanel kind="invoice" id={invoice.id} refreshKey={inv.project_id} />
    </HubRecordPage>
  );
};

export default InvoiceDetailPage;
