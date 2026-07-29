/**
 * Turning a myDATA received document into a purchase order.
 *
 * The order happened — by phone, by email, however — and the supplier's document is the record
 * of it. So the document seeds the order rather than becoming it: they stay two rows that are
 * ALLOWED to disagree, which is the only reason "we ordered 100, they billed 120" is catchable.
 *
 * Shared by the Expenses Inbox and the supplier's CRM record so both produce the same order.
 */
import { supabase } from '@/integrations/supabase/client';
import { unitFromMydataCode } from '@/lib/units';
import { inboundService, type InboundDocument } from '@/modules/finance/services/inboundService';
import { financeService } from '@/modules/finance/services/financeService';

/** Shape accepted by `NewOrderModal`'s `prefill.lines` (a partial `Line`). */
export interface PrefillLine {
  description: string;
  quantity: number;
  /** NET unit price — the order form adds VAT from `vat_code`, so this must exclude it. */
  unit_price: number;
  unit_code: string;
  vat_code: string;
}

const DEFAULT_UNIT = 'pcs';
const DEFAULT_VAT_CODE = '1'; // 24%

/**
 * Document lines → order lines. `net_value` is the line total excluding VAT, so the unit price
 * is that divided by quantity; myDATA's `vat_category` is the same code vocabulary the order
 * form uses, and `measurement_unit` maps through the shared AADE unit table.
 */
export function orderLinesFromDoc(doc: InboundDocument): PrefillLine[] {
  const lines = doc.lines ?? [];
  // EVERY line becomes an order line. Filtering on `item_description` looked reasonable but
  // dropped the majority of real documents on the floor: myDATA omits descriptions on most
  // service/summary invoices, and measured against live data only 585 of 1,732 documents have
  // ANY described line (1,903 of 3,592 lines). Those orders were being created EMPTY — the
  // supplier's money vanished from the order it was supposed to record. A line with a value and
  // no name is still a line; name it from what the document does tell us.
  const out: PrefillLine[] = lines.map((l, i) => {
    const qty = Number(l.quantity) || 1;
    const net = Number(l.net_value) || 0;
    const described = String(l.item_description ?? '').trim();
    return {
      description: described || `Line ${i + 1}`,
      quantity: qty,
      // Guard the divide: a zero/absent quantity would otherwise make the unit price Infinity.
      unit_price: qty > 0 ? Math.round((net / qty) * 100) / 100 : net,
      unit_code: unitFromMydataCode(l.measurement_unit) ?? DEFAULT_UNIT,
      vat_code: l.vat_category != null ? String(l.vat_category) : DEFAULT_VAT_CODE,
    };
  });

  // No line detail at all (the document is a single total). Still produce ONE line carrying the
  // document's net, so the order totals match what the supplier billed instead of reading zero.
  if (out.length === 0) {
    const net = Number(doc.total_net ?? 0) || 0;
    if (net === 0) return [];
    return [{
      description: [doc.series, doc.aa].filter(Boolean).join(' ') || 'Invoice total',
      quantity: 1,
      unit_price: Math.round(net * 100) / 100,
      unit_code: DEFAULT_UNIT,
      vat_code: DEFAULT_VAT_CODE,
    }];
  }
  return out;
}

/**
 * Attach a newly created order to the document it came from: the document becomes an expense
 * (if it isn't one yet) and that expense carries `order_id`. The link lives on the bill because
 * that is where 3-way match already reads it from — no new column, no second source of truth.
 */
export async function linkOrderToDocument(doc: InboundDocument, orderId: string): Promise<string> {
  const billId = doc.created_supplier_bill_id ?? await inboundService.toSupplierBill(doc.id);
  await financeService.setSupplierBillOrder(billId, orderId);
  return billId;
}

/**
 * Which of these documents already resulted in an order — read through their expenses, since
 * that is where the link is held. Returns the set of `inbound_documents.id`.
 */
export async function docsWithOrders(docs: InboundDocument[]): Promise<Set<string>> {
  const byBill = new Map<string, string>();
  for (const d of docs) if (d.created_supplier_bill_id) byBill.set(d.created_supplier_bill_id, d.id);
  if (byBill.size === 0) return new Set();
  const { data, error } = await supabase
    .from('supplier_bills')
    .select('id, order_id')
    .in('id', [...byBill.keys()])
    .not('order_id', 'is', null);
  if (error) return new Set();
  return new Set(((data ?? []) as Array<{ id: string }>).map((r) => byBill.get(r.id)!).filter(Boolean));
}
