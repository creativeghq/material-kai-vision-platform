/**
 * Everything a received (myDATA) document can HAVE DONE TO IT, in one place.
 *
 * THE DEFECT THIS EXISTS FOR
 * --------------------------
 * `InboundDocActionsMenu` is one file and always was. What was duplicated is the WIRING around
 * it: two tables — the Expenses inbox and the supplier document table — each held their own copy
 * of the same five state hooks (`busy`, `receiveDoc`, `detailDoc`, `orderDoc`, `ordered`), their
 * own `dismiss`, their own `docsWithOrders` effect, and their own list of props to pass down.
 *
 * That copy is not cosmetic, because several menu entries are GATED ON THE HANDLER EXISTING:
 *
 *     const canAddDetail = … && !!onAddLineDetail && …
 *
 * So a host that forgets one does not get a disabled entry — the entry is deleted, silently. One
 * host passed `onAddLineDetail` and the other did not, and "say what was actually on this
 * document" was unreachable from the CRM company card and the supplier modal. On two thirds of
 * this workspace's received documents (1,161 of 1,769 carry value-only lines) that was the only
 * thing standing between them and warehouse receive, product extraction and the catalog.
 *
 * With one wiring site there is nothing to forget. `tests/unit/inboundDocActionsParity.test.ts`
 * still guards the symptom; this removes the cause.
 *
 * WHAT STAYS PER-TABLE
 * --------------------
 * The COLUMNS, and where the rows come from. Those differ for real reasons: the inbox lists many
 * issuers (so it has an Issuer column and a per-row category picker) and is handed its rows;
 * the supplier table is scoped to one ΑΦΜ, fetches its own, and adds a date window and totals.
 * Merging those would mean one component with a mode flag, which is two components wearing a
 * trench coat.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { inboundService, type InboundDocument } from '@/modules/finance/services/inboundService';
import { InboundDocActionsMenu } from '@/modules/finance/components/InboundDocActionsMenu';
import { InboundDocPreviewDialog } from '@/modules/finance/components/InboundDocPreviewDialog';
import { CompleteLinesDialog } from '@/modules/finance/components/CompleteLinesDialog';
import { ExpensePaymentsDialog } from '@/modules/finance/components/ExpensePaymentsDialog';
import { ReceiveToWarehouseDialog } from '@/modules/finance/components/ReceiveToWarehouseDialog';
import { RecordPaymentDialog } from '@/modules/finance/components/RecordPaymentDialog';
import { NewOrderModal } from '@/modules/finance/components/OrdersPanel';
import { orderLinesFromDoc, docsWithOrders } from '@/modules/finance/utils/inboundToOrder';
import { financeCategoriesService, type FinanceCategory } from '@/modules/finance/services/financeCategoriesService';

export interface InboundDocActionsOptions {
  workspaceId: string | null | undefined;
  /** The rows on screen — used to resolve which already produced an order. */
  rows: InboundDocument[];
  /** Re-read the host's rows. Called after anything writes. */
  onChanged: () => void;
  /** The issuer's CRM company, when the host knows it. Suppresses the duplicate-creating "add". */
  crmCompanyIdFor?: (doc: InboundDocument) => string | undefined;
  /**
   * Open the payments ledger somewhere the HOST owns. Absent → this hook hosts the dialog itself.
   * The Expenses inbox delegates because Finance already has one mounted at page level.
   */
  onOpenExpense?: (billId: string) => void;
  /** Categories for the order form. Fetched here when the host has not already loaded them. */
  categories?: FinanceCategory[];
}

export interface InboundDocActions {
  /** Id of the row with a write in flight, for the row's own spinner. */
  busyId: string | null;
  /** Documents that already produced an order — read via their expense's `order_id`. */
  ordered: Set<string>;
  /** The row's 3-dots menu, fully wired. Render this; never construct the menu directly. */
  renderActions: (doc: InboundDocument) => React.ReactNode;
  /** Open the read-only AADE preview — for hosts whose rows are clickable. */
  openPreview: (doc: InboundDocument) => void;
  /** Every dialog the menu can open. Render once, anywhere inside the host. */
  dialogs: React.ReactNode;
}

export function useInboundDocActions({
  workspaceId, rows, onChanged, crmCompanyIdFor, onOpenExpense, categories,
}: InboundDocActionsOptions): InboundDocActions {
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [receiveDoc, setReceiveDoc] = useState<InboundDocument | null>(null);
  /** Value-only lines being completed (issue #377, Phase 1b). */
  const [detailDoc, setDetailDoc] = useState<InboundDocument | null>(null);
  /** Being paid before it is an expense — the conversion happens when that form saves. */
  const [payDoc, setPayDoc] = useState<InboundDocument | null>(null);
  /** Being turned into the purchase order it was always for. */
  const [orderDoc, setOrderDoc] = useState<InboundDocument | null>(null);
  const [previewDoc, setPreviewDoc] = useState<InboundDocument | null>(null);
  /** The bill whose ledger is open, when the host did not claim that job. */
  const [paymentsBillId, setPaymentsBillId] = useState<string | null>(null);
  const [ordered, setOrdered] = useState<Set<string>>(new Set());
  const [ownCategories, setOwnCategories] = useState<FinanceCategory[]>([]);

  useEffect(() => {
    let live = true;
    docsWithOrders(rows).then((s) => { if (live) setOrdered(s); }).catch(() => { /* the menu just offers the action again */ });
    return () => { live = false; };
  }, [rows]);

  // Only when the host has not already got them — the order form opens instantly either way.
  useEffect(() => {
    if (!workspaceId || categories) return;
    let live = true;
    financeCategoriesService.list(workspaceId)
      .then((c) => { if (live) setOwnCategories(c); })
      .catch(() => { if (live) setOwnCategories([]); });
    return () => { live = false; };
  }, [workspaceId, categories]);

  const dismiss = useCallback(async (id: string) => {
    setBusyId(id);
    try { await inboundService.dismiss(id); onChanged(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
    finally { setBusyId(null); }
  }, [onChanged, toast]);

  const openPayments = useCallback((billId: string) => {
    if (onOpenExpense) onOpenExpense(billId);
    else setPaymentsBillId(billId);
  }, [onOpenExpense]);

  /**
   * THE single construction of this menu. Every gated handler is passed here, so a new host
   * cannot omit one — which is the whole reason this function exists rather than each table
   * spelling the props out.
   */
  const renderActions = useCallback((doc: InboundDocument) => (
    <InboundDocActionsMenu
      doc={doc}
      workspaceId={workspaceId as string}
      busy={busyId === doc.id}
      crmCompanyId={crmCompanyIdFor?.(doc)}
      // Recording a payment is ONE act with ONE form, preset to this document. Whether an expense
      // exists yet is our bookkeeping, not the operator's question: if it does the payment settles
      // it, if it doesn't the document is converted on save. Opening never writes either way.
      onRecordPayment={() => setPayDoc(doc)}
      onCreateOrder={() => setOrderDoc(doc)}
      hasOrder={ordered.has(doc.id)}
      // The balance behind the bronze Gross column: a settled document still shows its whole
      // amount there, so this is the only way to reach what is actually outstanding.
      onOpenPayments={doc.created_supplier_bill_id ? () => openPayments(doc.created_supplier_bill_id!) : undefined}
      onReceiveStock={() => setReceiveDoc(doc)}
      onAddLineDetail={() => setDetailDoc(doc)}
      onDismiss={() => dismiss(doc.id)}
      onChanged={onChanged}
    />
  ), [workspaceId, busyId, crmCompanyIdFor, ordered, openPayments, dismiss, onChanged]);

  const orderCategories = categories ?? ownCategories;

  const dialogs = (
    <>
      {previewDoc && (
        <InboundDocPreviewDialog
          doc={previewDoc}
          open
          onOpenChange={(v) => { if (!v) setPreviewDoc(null); }}
        />
      )}
      {detailDoc && (
        <CompleteLinesDialog
          doc={detailDoc}
          onOpenChange={(v) => { if (!v) setDetailDoc(null); }}
          onDone={() => { setDetailDoc(null); onChanged(); }}
        />
      )}
      {receiveDoc && workspaceId && (
        <ReceiveToWarehouseDialog
          doc={receiveDoc}
          workspaceId={workspaceId}
          onOpenChange={(v) => { if (!v) setReceiveDoc(null); }}
          onDone={() => { setReceiveDoc(null); onChanged(); }}
        />
      )}
      {orderDoc && workspaceId && (
        // The platform's ONE order form, seeded from the document. Everything stays editable, so
        // the order can be corrected before saving — the whole point of keeping them separate.
        // The party is LOCKED only when the issuer is in CRM; otherwise the form asks.
        <NewOrderModal
          workspaceId={workspaceId}
          lockedCompanyId={crmCompanyIdFor?.(orderDoc)}
          preset={{ orderType: 'purchase', draft: false }}
          prefill={{
            currency: orderDoc.currency,
            notes: `From myDATA ${orderDoc.series ?? ''}${orderDoc.aa ? ` ${orderDoc.aa}` : ''} · MARK ${orderDoc.mark}`.trim(),
            lines: orderLinesFromDoc(orderDoc),
            fromDocument: true,
            inboundDocumentId: orderDoc.id,
          }}
          categories={orderCategories}
          open
          onOpenChange={(v) => { if (!v) setOrderDoc(null); }}
          onCreated={() => { setOrderDoc(null); onChanged(); }}
        />
      )}
      {payDoc && workspaceId && (
        <RecordPaymentDialog
          workspaceId={workspaceId}
          presetExpenseId={payDoc.created_supplier_bill_id ?? undefined}
          open
          onOpenChange={(v) => { if (!v) setPayDoc(null); }}
          onSaved={() => { setPayDoc(null); onChanged(); }}
        />
      )}
      {/* Only mounted when the host did not claim the job — see `onOpenExpense`. */}
      {!onOpenExpense && workspaceId && (
        <ExpensePaymentsDialog
          workspaceId={workspaceId}
          expenseId={paymentsBillId}
          open={!!paymentsBillId}
          onOpenChange={(v) => { if (!v) setPaymentsBillId(null); }}
          onChanged={onChanged}
        />
      )}
    </>
  );

  return { busyId, ordered, renderActions, openPreview: setPreviewDoc, dialogs };
}
