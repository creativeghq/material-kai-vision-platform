// deno-lint-ignore-file no-explicit-any
import { normaliseMoney, type RawLine, type NormalisedMoney } from './money.ts';

export interface AdapterConnection {
  id: string;
  platform: string;
  vat_number_key?: string | null;
  invoice_request_key?: string | null;
}

export interface CanonicalOrder {
  external_order_id: string;
  external_order_number: string | null;
  external_state: string | null;
  currency: string;
  payment_status: string | null;
  event_type: string | null;
  document_request: 'receipt' | 'invoice' | 'invoice_39a' | 'invoice_vies' | null;
  document_request_reason: string;
  customer: { name: string | null; email: string | null; vat_number: string | null; phone: string | null };
  lines: RawLine[];
  totals: { net: number; vat: number; total: number; shipping_cost: number };
  reconciles: boolean;
  raw: unknown;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Client-supplied, so a CLAIM: uuid here, in-workspace in SQL, else fall through to the ladder. */
function claimedProductId(value: unknown): string | null {
  const s = String(value ?? '').trim();
  return UUID.test(s) ? s : null;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** UNRESOLVED stays null and lands for review — never a silent fall back to a receipt. */
function deriveDocumentRequest(
  conn: AdapterConnection,
  vatNumber: string | null,
  invoiceFlag: string | null,
): { request: CanonicalOrder['document_request']; reason: string } {
  if (!conn.vat_number_key && !conn.invoice_request_key) {
    return { request: null, reason: 'No VAT-number or invoice-request key is configured on this connection, so what the buyer asked for is unknown.' };
  }
  const asked = invoiceFlag != null && /^(1|true|yes|invoice|τιμολ)/i.test(invoiceFlag.trim());
  if (asked && !vatNumber) {
    return { request: null, reason: 'The buyer asked for an invoice but no VAT number resolved from the configured key.' };
  }
  if (vatNumber) return { request: 'invoice', reason: `VAT number ${vatNumber} found on the order.` };
  return { request: 'receipt', reason: 'No VAT number on the order and no invoice requested.' };
}

function shippingLine(amount: number, tax: number, pricesIncludeTax: boolean): RawLine {
  const netAmount = pricesIncludeTax && tax > 0 ? amount - tax : amount;
  return {
    name: 'Shipping',
    qty: 1,
    unit_price: amount,
    vat_percent: netAmount > 0 ? Math.round((tax / netAmount) * 10000) / 100 : 0,
  };
}

function finish(
  base: Omit<CanonicalOrder, 'lines' | 'totals' | 'reconciles'>,
  money: NormalisedMoney,
  shipping: number,
): CanonicalOrder {
  return {
    ...base,
    lines: money.lines,
    totals: { net: money.net, vat: money.vat, total: money.total, shipping_cost: shipping },
    reconciles: money.reconciles,
  };
}

export function fromShopify(payload: any, conn: AdapterConnection, eventType: string | null): CanonicalOrder {
  const attrs: any[] = Array.isArray(payload?.note_attributes) ? payload.note_attributes : [];
  const attr = (key: string | null | undefined) =>
    key ? (attrs.find((a) => String(a?.name ?? '').toLowerCase() === key.toLowerCase())?.value ?? null) : null;

  const vatNumber = attr(conn.vat_number_key);
  const invoiceFlag = attr(conn.invoice_request_key);
  const doc = deriveDocumentRequest(conn, vatNumber ? String(vatNumber) : null, invoiceFlag ? String(invoiceFlag) : null);

  const rawLines: RawLine[] = (payload?.line_items ?? []).map((li: any) => {
    const props: any[] = Array.isArray(li?.properties) ? li.properties : [];
    const claimed = props.find((p) => String(p?.name ?? '') === '_materialkai_product_id')?.value;
    const rate = (li?.tax_lines ?? []).reduce((s: number, t: any) => s + num(t?.rate), 0) * 100;
    return {
      sku: li?.sku ?? null,
      barcode: li?.barcode ?? null,
      product_id: claimedProductId(claimed),
      name: String(li?.title ?? li?.name ?? 'Item'),
      qty: num(li?.quantity),
      unit_price: num(li?.price),
      vat_percent: rate,
    };
  });

  const shipping = (payload?.shipping_lines ?? []).reduce((s: number, l: any) => s + num(l?.price), 0);
  const shippingTax = (payload?.shipping_lines ?? []).reduce(
    (s: number, l: any) => s + (l?.tax_lines ?? []).reduce((t: number, x: any) => t + num(x?.price), 0), 0);
  if (shipping > 0) rawLines.push(shippingLine(shipping, shippingTax, Boolean(payload?.taxes_included)));
  const money = normaliseMoney(rawLines, {
    total: payload?.total_price, vat: payload?.total_tax,
  }, Boolean(payload?.taxes_included));

  return finish({
    external_order_id: String(payload?.id ?? ''),
    external_order_number: payload?.name ?? null,
    external_state: payload?.financial_status ?? null,
    currency: String(payload?.currency ?? 'EUR'),
    payment_status: payload?.financial_status ?? null,
    event_type: eventType,
    document_request: doc.request,
    document_request_reason: doc.reason,
    customer: {
      name: [payload?.customer?.first_name, payload?.customer?.last_name].filter(Boolean).join(' ') || payload?.billing_address?.name || null,
      email: payload?.customer?.email ?? payload?.email ?? null,
      vat_number: vatNumber ? String(vatNumber) : null,
      phone: payload?.customer?.phone ?? payload?.billing_address?.phone ?? null,
    },
    raw: payload,
  }, money, shipping);
}

export function fromWooCommerce(payload: any, conn: AdapterConnection, eventType: string | null): CanonicalOrder {
  const meta: any[] = Array.isArray(payload?.meta_data) ? payload.meta_data : [];
  const metaValue = (key: string | null | undefined) =>
    key ? (meta.find((m) => String(m?.key ?? '').toLowerCase() === key.toLowerCase())?.value ?? null) : null;

  const vatNumber = metaValue(conn.vat_number_key);
  const invoiceFlag = metaValue(conn.invoice_request_key);
  const doc = deriveDocumentRequest(conn, vatNumber ? String(vatNumber) : null, invoiceFlag ? String(invoiceFlag) : null);

  const rawLines: RawLine[] = (payload?.line_items ?? []).map((li: any) => {
    // `total` is AFTER discount and `subtotal` before it; the customer paid `total`.
    const lineNet = num(li?.total);
    const lineTax = num(li?.total_tax);
    const qty = num(li?.quantity) || 1;
    return {
      sku: li?.sku ?? null,
      product_id: claimedProductId(li?.meta_data?.find?.((m: any) => m?.key === '_materialkai_product_id')?.value),
      name: String(li?.name ?? 'Item'),
      qty,
      unit_price: lineNet / qty,
      vat_percent: lineNet > 0 ? Math.round((lineTax / lineNet) * 10000) / 100 : 0,
    };
  });

  const shipping = num(payload?.shipping_total);
  if (shipping > 0) rawLines.push(shippingLine(shipping, num(payload?.shipping_tax), false));
  const money = normaliseMoney(rawLines, {
    total: payload?.total, vat: payload?.total_tax,
  }, false);

  return finish({
    external_order_id: String(payload?.id ?? ''),
    external_order_number: payload?.number != null ? String(payload.number) : null,
    external_state: payload?.status ?? null,
    currency: String(payload?.currency ?? 'EUR'),
    payment_status: payload?.status ?? null,
    event_type: eventType,
    document_request: doc.request,
    document_request_reason: doc.reason,
    customer: {
      name: [payload?.billing?.first_name, payload?.billing?.last_name].filter(Boolean).join(' ') || payload?.billing?.company || null,
      email: payload?.billing?.email ?? null,
      vat_number: vatNumber ? String(vatNumber) : null,
      phone: payload?.billing?.phone ?? null,
    },
    raw: payload,
  }, money, shipping);
}

export function fromGeneric(payload: any, _conn: AdapterConnection, eventType: string | null): CanonicalOrder {
  const rawLines: RawLine[] = (payload?.lines ?? []).map((l: any) => ({
    sku: l?.sku ?? null,
    barcode: l?.barcode ?? null,
    product_id: claimedProductId(l?.product_id),
    name: String(l?.name ?? 'Item'),
    qty: num(l?.qty),
    unit_price: num(l?.unit_price),
    vat_percent: num(l?.vat_percent),
  }));
  const shipping = num(payload?.totals?.shipping_cost);
  if (shipping > 0) rawLines.push(shippingLine(shipping, num(payload?.totals?.shipping_tax), Boolean(payload?.prices_include_tax)));
  const money = normaliseMoney(rawLines, {
    total: payload?.totals?.total, vat: payload?.totals?.vat,
  }, Boolean(payload?.prices_include_tax));

  const vat = payload?.customer?.vat_number ? String(payload.customer.vat_number) : null;
  return finish({
    external_order_id: String(payload?.external_order_id ?? ''),
    external_order_number: payload?.external_order_number ?? null,
    external_state: payload?.external_state ?? null,
    currency: String(payload?.currency ?? 'EUR'),
    payment_status: payload?.payment_status ?? null,
    event_type: eventType,
    document_request: vat ? 'invoice' : 'receipt',
    document_request_reason: vat ? `VAT number ${vat} stated on the order.` : 'No VAT number stated on the order.',
    customer: {
      name: payload?.customer?.name ?? null,
      email: payload?.customer?.email ?? null,
      vat_number: vat,
      phone: payload?.customer?.phone ?? null,
    },
    raw: payload,
  }, money, shipping);
}

export const ADAPTERS: Record<string, (p: any, c: AdapterConnection, e: string | null) => CanonicalOrder> = {
  shopify: fromShopify,
  woocommerce: fromWooCommerce,
  generic: fromGeneric,
};
