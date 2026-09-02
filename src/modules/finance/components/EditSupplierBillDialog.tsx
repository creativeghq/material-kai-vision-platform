/**
 * Edit a recorded expense's DOCUMENT metadata after the fact — the supplier's bill number,
 * issue/due dates, category, notes, and what the cost is FOR. Bills recorded manually from an
 * order usually lack the supplier's own invoice number (myDATA-created ones get `IN-<MARK>`
 * automatically); this dialog is the backfill path from Payables.
 *
 * "What is this for?" is here because until #378 L1 it could only ever be answered at the moment
 * the expense was born: the Inbox's "Add to Expenses" created the order and the bill together,
 * and the general expense form offered the picker only while the form was still open. Anything
 * already booked — a transport invoice that landed a week after the goods, customs, an installer,
 * a second supplier on the same job — had no route onto the order or the project it belonged to
 * except from the ORDER's side, which requires already knowing which order it was. That is the
 * direction an operator looking at an unattributed row in Payables does not have.
 *
 * It is the same `OrderLinkPicker` the creation form uses, so a cost cannot be linked to
 * something the picker considers illegal (appending purchase lines to a customer's sales order,
 * for instance) however this file is later edited. Two of its groups are deliberately off:
 * merging (a bill has no line items to merge) and raising a new customer order (this dialog edits
 * one document; it does not create a second one).
 *
 * Amounts and supplier identity are deliberately NOT here — payments allocate against them,
 * and net/VAT feed the P&L. Correcting a wrong amount is a credit note, not an edit.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { CostCodePicker } from '@/components/business/costCodes/CostCodePicker';
import { Textarea } from '@/components/core/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Loader2, Paperclip, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useEntitlements } from '@/hooks/useEntitlements';
import { supabase } from '@/integrations/supabase/client';
import { financeService, formatMoney, type PayableExpense } from '@/modules/finance/services/financeService';
import { propertyLabel, type OrderLinkTarget } from '@/modules/finance/services/ordersService';
import {
  EMPTY_LINK, linkKey, linkSubject, linkToColumns, type BillLinkColumns,
} from '@/modules/finance/utils/billLink';
import { OrderLinkPicker } from '@/modules/finance/components/OrderLinkPicker';
import { receiptScanService, RECEIPT_ACCEPT } from '@/services/receiptScanService';
import type { FinanceCategory } from '@/modules/finance/services/financeCategoriesService';

const NO_CATEGORY = '__none__';

/**
 * The stored answer, resolved to the value the picker takes, so the control opens showing what
 * the bill already says instead of an empty field the operator has to re-answer (and, half the
 * time, re-answers differently).
 *
 * WHICH column wins is decided by `linkSubject`, not here — that is the tested half. This adds
 * only the label, which is resolved rather than stored: a denormalized copy is one more thing to
 * keep in step with a rename.
 */
async function resolveLink(cols: BillLinkColumns): Promise<OrderLinkTarget> {
  const subject = linkSubject(cols);
  if (!subject) return { kind: 'none' };

  switch (subject.kind) {
    case 'cost_of_order':
    case 'sales_order': {
      const { data } = await supabase.from('orders')
        .select('id, order_number, project_id').eq('id', subject.id).maybeSingle();
      const label = (data?.order_number as string | null) ?? subject.id.slice(0, 8);
      const projectId = (data?.project_id as string | null) ?? null;
      return subject.kind === 'cost_of_order'
        ? { kind: 'cost_of_order', orderId: subject.id, projectId, label }
        : { kind: 'sales_order', orderId: subject.id, projectId, label };
    }
    case 'project': {
      const { data } = await supabase.from('projects').select('id, name').eq('id', subject.id).maybeSingle();
      return { kind: 'project', projectId: subject.id, label: (data?.name as string | null) ?? 'Project' };
    }
    case 'property': {
      const { data } = await supabase.from('properties')
        .select('id, title, address, reference_code').eq('id', subject.id).maybeSingle();
      return {
        kind: 'property',
        propertyId: subject.id,
        label: propertyLabel({
          title: (data?.title as string | null) ?? null,
          address: (data?.address as string | null) ?? null,
          reference_code: (data?.reference_code as string | null) ?? null,
        }),
      };
    }
    case 'trip': {
      const { data } = await supabase.from('trip_expense_reports')
        .select('id, title').eq('id', subject.id).maybeSingle();
      return { kind: 'trip', reportId: subject.id, label: (data?.title as string | null) ?? 'Expense card' };
    }
  }
}

export const EditSupplierBillDialog: React.FC<{
  workspaceId: string;
  /** Bill being edited; null keeps the dialog closed. */
  billId: string | null;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  categories: FinanceCategory[];
}> = ({ workspaceId, billId, onOpenChange, onSaved, categories }) => {
  const { toast } = useToast();
  // Properties are only a sensible answer where the workspace actually sells or manages them.
  // `isModuleAvailable` fails open while loading, which is harmless: a workspace without the
  // module has no properties, so the group renders nothing either way.
  const { isModuleAvailable } = useEntitlements();
  const realEstate = isModuleAvailable('real-estate');
  const [bill, setBill] = useState<PayableExpense | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [billNumber, setBillNumber] = useState('');
  const [issuedAt, setIssuedAt] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [categoryId, setCategoryId] = useState<string>(NO_CATEGORY);
  const [costCodeId, setCostCodeId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [link, setLink] = useState<OrderLinkTarget>({ kind: 'none' });
  /**
   * The receipt image (#379). Read back here because this is the one surface that opens a bill by
   * id — without it `supplier_bills.receipt_path` would be written by the scanner and read by
   * nothing, which is the write-only-column shape the link work exists to remove.
   */
  const [receiptName, setReceiptName] = useState<string | null>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const receiptInput = useRef<HTMLInputElement | null>(null);
  /** What the row said on open, so an untouched field is never written back. */
  const [initialLinkKey, setInitialLinkKey] = useState('none');

  useEffect(() => {
    if (!billId) { setBill(null); setLink({ kind: 'none' }); setInitialLinkKey('none'); return; }
    setLoading(true);
    Promise.all([
      financeService.listPayableExpenses(workspaceId, { ids: [billId], includeSettled: true }),
      // The five link columns are not on PayableExpense (the AP list has no use for them), so
      // they are read here rather than widening a type every payables row pays for.
      supabase.from('supplier_bills')
        .select('project_id, order_id, covers_order_id, trip_report_id, property_id, receipt_path, receipt_name, cost_code_id')
        .eq('id', billId).maybeSingle(),
    ])
      .then(async ([rows, linkRow]) => {
        const b = rows[0] ?? null;
        setBill(b);
        setBillNumber(b?.supplier_bill_number ?? '');
        setIssuedAt(b?.issued_at?.slice(0, 10) ?? '');
        setDueAt(b?.due_at?.slice(0, 10) ?? '');
        setCategoryId(b?.category_id ?? NO_CATEGORY);
        setNotes(b?.notes ?? '');
        const rec = (linkRow.data ?? {}) as { receipt_path?: string | null; receipt_name?: string | null; cost_code_id?: string | null };
        setCostCodeId(rec.cost_code_id ?? null);
        setReceiptName(rec.receipt_path ? (rec.receipt_name || 'Receipt') : null);
        const cols = { ...EMPTY_LINK, ...((linkRow.data ?? {}) as Partial<BillLinkColumns>) };
        const resolved = await resolveLink(cols);
        setLink(resolved);
        setInitialLinkKey(linkKey(resolved));
      })
      .catch((e) => toast({ title: 'Failed to load the expense', description: (e as Error).message, variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, [billId, workspaceId, toast]);

  const save = async () => {
    if (!billId) return;
    setBusy(true);
    try {
      // The link is written ONLY when it actually changed. Rewriting it on every save would let
      // opening this dialog and pressing Save silently overwrite a project somebody had chosen
      // deliberately on a bill whose order points somewhere else.
      const cols = linkKey(link) !== initialLinkKey ? linkToColumns(link) : null;
      await financeService.updateSupplierBillMeta(billId, {
        supplierBillNumber: billNumber,
        issuedAt: issuedAt || null,
        dueAt: dueAt || null,
        categoryId: categoryId === NO_CATEGORY ? null : categoryId,
        costCodeId,
        notes,
        ...(cols ? { link: {
          projectId: cols.project_id,
          orderId: cols.order_id,
          coversOrderId: cols.covers_order_id,
          tripReportId: cols.trip_report_id,
          propertyId: cols.property_id,
        } } : {}),
      });
      toast({ title: 'Expense updated' });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast({ title: 'Failed to update the expense', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={!!billId} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit expense details</DialogTitle>
          <DialogDescription>
            {bill
              ? <>Document details and what the cost is for — {bill.party_name ?? 'this expense'} · {formatMoney(bill.total, bill.currency)}. Amounts are fixed: record a supplier credit note to correct them.</>
              : 'Document details — bill number, dates, what it is for, category and notes.'}
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Reference / Bill #</Label>
              <Input value={billNumber} onChange={(e) => setBillNumber(e.target.value)} placeholder="the supplier's invoice number — e.g. ΤΔΑ-2026/184" />
              {bill?.inbox && (
                <p className="text-[11px] text-muted-foreground">
                  From myDATA (MARK {bill.inbox.mark}
                  {bill.inbox.series ? ` · ${bill.inbox.series} ${bill.inbox.aa ?? ''}`.trimEnd() : ''}) — replacing the
                  auto number with the supplier's own series is fine; the MARK stays on the inbox document.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Issue date</Label>
                <Input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Due date</Label>
                <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
              </div>
            </div>
            {/* What the cost is FOR. Merging is off (a bill has no lines to merge into an order)
                and so is raising a new customer order (this dialog edits one document; it does
                not create a second one) — both from the New expense form, which is where a cost
                with nothing to attach to belongs. */}
            <OrderLinkPicker
              workspaceId={workspaceId}
              value={link}
              onChange={setLink}
              partyCompanyId={bill?.supplier_company_id ?? null}
              partyContactId={bill?.supplier_contact_id ?? null}
              currency={bill?.currency ?? null}
              allowMerge={false}
              allowRaiseCustomerOrder={false}
              allowCostOf
              allowTrip
              allowProperty={realEstate}
              hint={
                <p className="text-[11px] text-muted-foreground">
                  Attaching to a purchase order books this cost onto it and reports it under that
                  order&apos;s job. Clearing this leaves the expense unattributed.
                </p>
              }
            />
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="No category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CATEGORY}>No category</SelectItem>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cost code</Label>
              <CostCodePicker value={costCodeId} onChange={setCostCodeId} />
              <p className="text-[11px] text-muted-foreground">
                How this cost is classified on the job. Separate from the accounting category —
                the project cost report groups by this.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
            {/* The receipt. Attaching one here is also how a cost booked before the paper arrived
                gets its evidence — the bucket is private, so the link is signed on each open and
                never stored. */}
            <div className="space-y-1.5">
              <Label>Receipt</Label>
              <input
                ref={receiptInput}
                type="file" accept={RECEIPT_ACCEPT} className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0]; e.currentTarget.value = '';
                  if (!f || !billId) return;
                  setReceiptBusy(true);
                  try { await receiptScanService.attachToBill(billId, f); setReceiptName(f.name); toast({ title: 'Receipt attached' }); }
                  catch (err) { toast({ title: 'Could not attach the receipt', description: (err as Error).message, variant: 'destructive' }); }
                  finally { setReceiptBusy(false); }
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                {receiptName && (
                  <Button type="button" size="sm" variant="outline" disabled={receiptBusy}
                    onClick={async () => {
                      if (!billId) return;
                      setReceiptBusy(true);
                      try {
                        const url = await receiptScanService.signBillReceipt(billId);
                        if (url) window.open(url, '_blank', 'noopener');
                        else toast({ title: 'That receipt is no longer available', variant: 'destructive' });
                      } catch (err) { toast({ title: 'Could not open the receipt', description: (err as Error).message, variant: 'destructive' }); }
                      finally { setReceiptBusy(false); }
                    }}>
                    <ExternalLink className="h-3.5 w-3.5 mr-1" /> {receiptName}
                  </Button>
                )}
                <Button type="button" size="sm" variant={receiptName ? 'ghost' : 'outline'} disabled={receiptBusy}
                  onClick={() => receiptInput.current?.click()}>
                  {receiptBusy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Paperclip className="h-3.5 w-3.5 mr-1" />}
                  {receiptName ? 'Replace' : 'Attach a receipt'}
                </Button>
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy || loading || !bill}>
            {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
