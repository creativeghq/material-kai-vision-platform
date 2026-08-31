/**
 * per-row 3-dots action menu for the Expenses (myDATA inbound) inbox. Folds the
 * loose row buttons (Create bill / Receive stock / Dismiss) into one menu and adds two
 * "turn this received document into platform data" actions:
 *   • Add issuer → CRM supplier (with optional registry + business research when the issuer is
 *     Greek and myDATA returned only a VAT number / no name), deduped by VAT within the workspace.
 *   • Add products → warehouse (reuses the existing ReceiveToWarehouseDialog via callback).
 * Mirrors the InvoiceActionsMenu pattern so it drops into the InboundTable row.
 *
 * The add-to-CRM half is [[AddIssuerToCrmDialog]] — the dedupe probe, the ΑΑΔΕ → ΓΕΜΗ →
 * web/Apollo research chain and the write all live there, so this menu and the
 * Expenses-by-Supplier list offer the same act rather than two spellings of it.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoreVertical, Building2, ListPlus, PackagePlus, Trash2, Loader2, Eye, Wallet, ShoppingCart, Receipt } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/core/ui/dropdown-menu';
import { AddIssuerToCrmDialog } from '@/modules/finance/components/AddIssuerToCrmDialog';
import type { InboundDocument } from '@/modules/finance/services/inboundService';
import { docFamily, isPayrollDocument, needsLineDetail } from '@/modules/finance/utils/inboundProvenance';
import { InboundDocPreviewDialog } from '@/modules/finance/components/InboundDocPreviewDialog';

interface Props {
  doc: InboundDocument;
  workspaceId: string;
  busy?: boolean;
  /** Set when the issuer's ΑΦΜ already matches a CRM company — the row resolved it, so the
   *  "add" action is offered as already-done rather than letting a duplicate be started. */
  crmCompanyId?: string;
  /**
   * Open the Record Payment form preset to this document. Opening must never WRITE — in
   * particular it must not convert the document into an expense; that happens when the form
   * saves. (For the read-only "what has been paid" view, see `onOpenPayments`.)
   */
  onRecordPayment: () => void;
  /** Open the order form seeded from this document's lines — where "what is this for?" decides
   *  between raising the purchase and booking it onto one that already exists (freight, customs,
   *  an installer). Absent → the entry isn't offered. */
  onCreateOrder?: () => void;
  /** This document already produced an order — offered as done rather than repeated. */
  hasOrder?: boolean;
  /**
   * Open the payments/balance ledger for the expense this document became. Read-only: it shows
   * what has settled and what is still owed, and never converts the document.
   *
   * The other half of "Record payment". The Gross column is a BRONZE myDATA fact that never
   * moves, so a fully-settled document still shows its whole amount there — what is actually
   * outstanding lives on the bill's derived `amount_due`, and this is the only way to reach it
   * from the inbox. Absent → the entry isn't offered.
   */
  onOpenPayments?: () => void;
  onReceiveStock: () => void;
  /** Opens the complete-the-document editor. Absent where the surface cannot host a dialog. */
  onAddLineDetail?: () => void;
  onDismiss: () => void;
  onChanged?: () => void;
}

export const InboundDocActionsMenu: React.FC<Props> = ({ doc, workspaceId, busy, crmCompanyId, onRecordPayment, onCreateOrder, hasOrder, onOpenPayments, onReceiveStock, onAddLineDetail, onDismiss, onChanged }) => {
  const navigate = useNavigate();

  // ONE goods receipt per purchase. Receiving the document and receiving the purchase order it
  // became are the same arrival counted from two rows — nothing links them, so doing both added
  // the stock twice. Once the order exists it owns the receipt (it knows the catalog products,
  // the per-line delivered quantities and the customer allocations waiting on them).
  // Payroll (17.x) rides in on the same RequestTransmittedDocs call as the foreign purchases —
  // it is here to be VISIBLE, not to be actioned. It belongs to the HR module, so booking it as
  // a supplier bill would double-count it against payroll already recorded there (three
  // documents, EUR 92,539.09 in this workspace). `_inbound_doc_to_supplier_bill_core` refuses it
  // outright; this stops the offer being made rather than letting the click fail.
  const isPayroll = isPayrollDocument(doc.doc_type);
  // And nothing was delivered, so there is nothing to receive either.
  const canReceive = (doc.status === 'new' || doc.status === 'classified') && !hasOrder && !isPayroll;
  const canDismiss = doc.status === 'new';
  /** Value-only lines: the money is known, what was bought is not. Blocks warehouse receive. */
  const needsDetail = needsLineDetail(doc);
  // Offered on `lines_source='none'` and nowhere else — a document whose lines arrived under the
  // supplier's own MARK must not be rewritten, or our records diverge from the tax record. Rent
  // and payroll have nothing to itemise, so they are not asked to.
  const canAddDetail = needsDetail && !isPayroll && docFamily(doc.doc_type) !== '16'
    && doc.status !== 'dismissed' && !!onAddLineDetail && (doc.total_net ?? 0) > 0;
  // Paying settles an expense that EXISTS. A document that hasn't been booked yet is settled by
  // booking it — "Add to Expenses" carries a "Mark as paid" tick — so there is one way in and it
  // always leaves an order behind the money. This item used to convert the document itself on
  // save, which produced a paid bill with no order to match it against: the exact shape the
  // Money section was reorganised to prevent.
  const canPay = doc.status !== 'dismissed' && !!doc.created_supplier_bill_id;
  const hasIssuer = !!(doc.issuer_vat || doc.issuer_name);
  /** Already a CRM company — adding again would only make a duplicate to merge later. */
  const inCrm = !!crmCompanyId;

  // Read-only view of the document exactly as AADE holds it.
  const [previewOpen, setPreviewOpen] = useState(false);

  // ---- Add issuer → CRM supplier ----
  // The dedupe probe, the research chain and the write all live in the shared dialog, so this row
  // and the Expenses-by-Supplier list offer the same act rather than two spellings of it.
  const [crmOpen, setCrmOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={(e) => e.stopPropagation()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={() => setPreviewOpen(true)}>
            <Eye className="h-4 w-4 mr-2" /> Preview
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">Add to platform</DropdownMenuLabel>
          {inCrm ? (
            // State, not an action. This menu is "things you can do to this document"; opening a
            // CRM record is neither, and navigating away mid-triage loses the operator's place.
            // The issuer name in the row is already the link into CRM.
            <DropdownMenuItem disabled>
              <Building2 className="h-4 w-4 mr-2" /> Issuer in CRM
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => setCrmOpen(true)} disabled={!hasIssuer}>
              <Building2 className="h-4 w-4 mr-2" /> Add issuer to CRM
            </DropdownMenuItem>
          )}
          {/* Before receiving is possible at all, the document has to NAME something. This is the
              one thing standing between a 14.x (or any thin 2.x) and the entire existing intake
              chain, so it sits directly above it and only appears when it is the blocker. */}
          {canAddDetail && (
            <DropdownMenuItem onClick={onAddLineDetail}>
              <ListPlus className="h-4 w-4 mr-2" /> Add line detail
            </DropdownMenuItem>
          )}
          {/* Same act as the order menu's entry — one name for it, the goods-receipt term. Once an
              order exists it owns the receipt, so this is disabled rather than explained. */}
          <DropdownMenuItem
            onClick={onReceiveStock}
            disabled={!canReceive || needsDetail}
            title={needsDetail ? 'This document has no itemised lines yet — add the detail first.' : undefined}
          >
            <PackagePlus className="h-4 w-4 mr-2" /> Receive into warehouse
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">Money</DropdownMenuLabel>
          {/* ONE way in. You cannot buy from a supplier and hold only an expense — the purchase
              happened, so the order is the record of it and the expense hangs off that. This used
              to be two items ("Add to Expenses — not paid" wrote a bare bill; "Create the order
              for this" wrote order + bill), and the bill-only one produced a payable with nothing
              to match it against, which is precisely what 3-way match exists to prevent. */}
          <DropdownMenuItem
            onClick={onCreateOrder}
            disabled={hasOrder || isPayroll || doc.status === 'dismissed' || !onCreateOrder}
            title={isPayroll ? 'Payroll is recorded in HR, never as a supplier bill — this document is here for visibility.' : undefined}
          >
            <ShoppingCart className="h-4 w-4 mr-2" />
            {isPayroll ? 'Payroll — recorded in HR' : hasOrder ? 'Already in Expenses' : 'Add to Expenses'}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onRecordPayment} disabled={!canPay}>
            <Wallet className="h-4 w-4 mr-2" /> Record payment
          </DropdownMenuItem>
          {/* Viewing is read-only, so it stays available even for a dismissed document — the
              money that moved is still a fact worth reading back. */}
          <DropdownMenuItem onClick={onOpenPayments} disabled={!onOpenPayments || !doc.created_supplier_bill_id}>
            <Receipt className="h-4 w-4 mr-2" /> View payments
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDismiss} disabled={!canDismiss}>
            <Trash2 className="h-4 w-4 mr-2" /> Dismiss
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <InboundDocPreviewDialog doc={doc} open={previewOpen} onOpenChange={setPreviewOpen} />

      {/* Add issuer → CRM supplier. Navigates on success, as it always has: this menu acts on
          ONE document, so landing on the record just created is the end of the errand. */}
      <AddIssuerToCrmDialog
        workspaceId={workspaceId}
        issuerVat={doc.issuer_vat}
        issuerName={doc.issuer_name}
        open={crmOpen}
        onOpenChange={setCrmOpen}
        onCreated={(id) => { onChanged?.(); if (id) navigate(`/crm/companies/${id}`); }}
      />
    </>
  );
};
