/**
 * Made-to-order items → purchase orders: the decisions, with no I/O (#378 C2).
 *
 * Deliberately free of the Supabase client so it can be tested by CALLING it. Grouping and
 * exhaustiveness are behavioural properties, and a text guard has already failed this codebase
 * twice by accepting a same-shaped helper in place of the real one — importing the service to test
 * this would have made that impossible again, for the mundane reason that the client throws
 * without env vars.
 *
 * @see tests/unit/projectPurchaseOrders.test.ts
 */

/** The minimum a purchase item must carry to become an order line. Structural on purpose — the
 *  service passes its real row type through unchanged. */
export interface PurchaseItemForOrder {
  id: string;
  name: string;
  item_type: string;
  quantity: number;
  unit_cost: number | null;
  currency: string;
  supplier_company_id: string | null;
  order_id: string | null;
  details: Record<string, unknown> | null;
}

/**
 * Compact spec summary — the most identifying keys per item type.
 *
 * The row and the purchase-ORDER line use the same string: a supplier reading "Front door" with no
 * size cannot make anything, and two versions of "how do we describe this item" is how the two come
 * to disagree about what was ordered.
 */
export function purchaseItemSpecSummary(it: Pick<PurchaseItemForOrder, 'item_type' | 'details'>): string {
  const d = (it.details ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  if (d.width_mm || d.height_mm) parts.push(`${d.width_mm ?? '?'}×${d.height_mm ?? '?'} mm`);
  if (it.item_type === 'door') {
    if (d.finish) parts.push(String(d.finish));
    if (d.opening) parts.push(`opens ${d.opening}`);
    if (d.handing) parts.push(`${d.handing}-hand`);
  } else if (it.item_type === 'window') {
    if (d.opening_type) parts.push(String(d.opening_type));
    if (d.glazing) parts.push(String(d.glazing));
    if (d.finish) parts.push(String(d.finish));
  } else if (d.finish) parts.push(String(d.finish));
  return parts.join(' · ');
}

/** One purchase order's worth of items — a single supplier, a single currency. */
export interface PurchaseOrderGroup<T extends PurchaseItemForOrder = PurchaseItemForOrder> {
  supplierCompanyId: string;
  currency: string;
  items: T[];
}

/** An item deliberately left alone, and why. */
export interface SkippedPurchaseItem {
  id: string;
  name: string;
  reason: string;
}

/**
 * WHICH items can become purchase orders, and how they group.
 *
 * Three refusals, each RETURNED with its reason rather than dropped:
 *   · already on an order — raising again orders the same door twice
 *   · no supplier        — there is nobody to send a purchase order to
 *   · no unit cost       — it would reach a supplier's order priced at zero
 *
 * `unit_cost: 0` is a price, not a missing one: a warranty replacement or a sample is legitimately
 * free. Only `null` means nobody has priced it. Conflating the two either blocks a real order or
 * sends one out at nothing.
 *
 * Grouping is by supplier AND currency. One order carries one currency, and converting silently is
 * precisely the money bug this platform keeps finding.
 */
export function planPurchaseOrders<T extends PurchaseItemForOrder>(items: T[]): {
  groups: Array<PurchaseOrderGroup<T>>;
  skipped: SkippedPurchaseItem[];
} {
  const skipped: SkippedPurchaseItem[] = [];
  const byKey = new Map<string, PurchaseOrderGroup<T>>();

  for (const it of items) {
    if (it.order_id) {
      skipped.push({ id: it.id, name: it.name, reason: 'already on a purchase order' });
      continue;
    }
    if (!it.supplier_company_id) {
      skipped.push({ id: it.id, name: it.name, reason: 'no supplier — set one first' });
      continue;
    }
    if (it.unit_cost == null) {
      skipped.push({ id: it.id, name: it.name, reason: 'no unit cost — it would be ordered at zero' });
      continue;
    }
    const currency = it.currency || 'EUR';
    const key = `${it.supplier_company_id}|${currency}`;
    const group = byKey.get(key) ?? { supplierCompanyId: it.supplier_company_id, currency, items: [] as T[] };
    group.items.push(it);
    byKey.set(key, group);
  }

  return { groups: [...byKey.values()], skipped };
}
