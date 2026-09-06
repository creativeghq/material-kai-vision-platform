/**
 * A customer's recent SALES orders with what is still owed — one read, two readers.
 *
 * The Inbox context rail and the customer-audience `list_orders` tool both answer "where is my
 * order / is it paid". Written twice they drifted on the first day (one filtered by contact OR
 * company, the other by contact only), so an order booked under the buyer's company showed on
 * the member's rail while the assistant told the customer they had none.
 *
 * Settlement — `payment_status`, `outstanding` — comes from `get_order_settlements`, the ONE
 * derivation of how much is owed on an order (CLAUDE.md anti-regression rule 1). Nothing here
 * subtracts anything.
 *
 * Sales orders only: on a purchase order this party would be the SUPPLIER, and "where is my
 * order" from a supplier is a different question.
 */

import type { DbClient } from './supabase-client.ts';
import { partyFilter, type ThreadCustomerParty } from './inbox-customer-party.ts';

export interface CustomerSalesOrder {
  id: string;
  order_number: string | null;
  status: string | null;
  /** The ledger-derived payment status, never the cached column. */
  payment_status: string | null;
  total: number;
  outstanding: number | null;
  currency: string;
  created_at: string;
}

export async function listCustomerSalesOrders(
  db: DbClient,
  args: { workspaceId: string; party: Pick<ThreadCustomerParty, 'contactId' | 'companyId'>; limit?: number },
): Promise<CustomerSalesOrder[]> {
  if (!args.party.contactId) return [];
  const { data: rows, error } = await db
    .from('orders')
    .select('id, order_number, status, total, currency, created_at')
    .eq('workspace_id', args.workspaceId)
    .eq('order_type', 'sales')
    .or(partyFilter(args.party, 'customer_contact_id', 'customer_company_id'))
    .order('created_at', { ascending: false })
    .limit(args.limit ?? 8);
  // A failed read is not "no orders". Surface it; the caller decides how loudly.
  if (error) throw new Error(`orders read failed: ${error.message}`);
  const orders = (rows || []) as Array<Record<string, unknown>>;
  if (!orders.length) return [];

  const { data: st, error: stErr } = await db.rpc('get_order_settlements', { p_order_ids: orders.map((o) => String(o.id)) });
  if (stErr) throw new Error(`get_order_settlements failed: ${stErr.message}`);
  const settled = new Map(
    ((st || []) as Array<{ order_id: string; outstanding: number; payment_status: string }>)
      .map((s) => [s.order_id, s]),
  );
  const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);
  return orders.map((o) => ({
    id: String(o.id),
    order_number: (o.order_number as string | null) ?? null,
    status: (o.status as string | null) ?? null,
    payment_status: settled.get(String(o.id))?.payment_status ?? null,
    total: num(o.total),
    outstanding: settled.has(String(o.id)) ? num(settled.get(String(o.id))!.outstanding) : null,
    currency: (o.currency as string | null) || 'EUR',
    created_at: String(o.created_at),
  }));
}
