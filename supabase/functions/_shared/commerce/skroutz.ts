import { normaliseMoney, type RawLine } from './money.ts';
import type { AdapterConnection, CanonicalOrder } from './adapters.ts';

export const SKROUTZ_BASE = 'https://api.skroutz.gr';
export const SKROUTZ_ACCEPT = 'application/vnd.skroutz+json; version=3.0';

export const SKROUTZ_DOCUMENT_REQUEST: Record<string, CanonicalOrder['document_request']> = {
  receipt: 'receipt',
  invoice: 'invoice',
  invoice_39a: 'invoice_39a',
  invoice_vies: 'invoice_vies',
};

export const SKROUTZ_STATES = [
  'open', 'accepted', 'rejected', 'cancelled', 'expired',
  'dispatched', 'delivered', 'partially_delivered',
  'for_return', 'returned', 'partially_returned',
] as const;
export type SkroutzState = (typeof SKROUTZ_STATES)[number];

export const SKROUTZ_NEEDS_US: readonly string[] = ['open'];

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function fromSkroutz(payload: Record<string, unknown>, _conn: AdapterConnection, eventType: string | null): CanonicalOrder {
  const order = (payload.order ?? payload) as Record<string, unknown>;
  const details = (order.invoice_details ?? {}) as Record<string, unknown>;
  const requested = String(order.invoice_document ?? '').trim();
  const vat = String(details.vat_number ?? '').trim() || null;

  const rawLines: RawLine[] = ((order.line_items ?? []) as Record<string, unknown>[]).map((li) => ({
    sku: (li.shop_uid as string) ?? null,
    barcode: (li.ean as string) ?? null,
    name: String(li.product_name ?? li.name ?? 'Item'),
    qty: num(li.quantity),
    unit_price: num(li.unit_price ?? li.price),
    vat_percent: num(li.vat ?? li.vat_percentage),
  }));

  const shipping = num(order.courier_cost ?? order.shipping_cost);
  if (shipping > 0) {
    rawLines.push({ name: 'Shipping', qty: 1, unit_price: shipping, vat_percent: 0 });
  }

  const money = normaliseMoney(rawLines, { total: num(order.total_price), vat: num(order.vat_amount) }, true);
  const mapped = SKROUTZ_DOCUMENT_REQUEST[requested] ?? null;

  return {
    external_order_id: String(order.code ?? order.id ?? ''),
    external_order_number: (order.code as string) ?? null,
    external_state: (order.state as string) ?? null,
    currency: String(order.currency ?? 'EUR'),
    payment_status: order.paid ? 'paid' : 'unpaid',
    event_type: eventType,
    document_request: mapped,
    document_request_reason: mapped
      ? `Skroutz states invoice_document=${requested}.`
      : `Skroutz sent invoice_document=${requested || '(nothing)'}, which is not a document we can issue.`,
    customer: {
      name: String(details.company ?? order.customer_name ?? '') || null,
      email: (order.customer_email as string) ?? null,
      vat_number: vat,
      phone: (order.customer_phone as string) ?? null,
    },
    lines: money.lines,
    totals: { net: money.net, vat: money.vat, total: money.total, shipping_cost: shipping },
    reconciles: money.reconciles,
    raw: payload,
  };
}

export interface SkroutzCall {
  token: string;
  path: string;
  method?: 'GET' | 'POST' | 'PUT';
  body?: unknown;
}

export async function skroutzFetch({ token, path, method = 'GET', body }: SkroutzCall): Promise<Response> {
  return fetch(`${SKROUTZ_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: SKROUTZ_ACCEPT,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
