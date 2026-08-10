/**
 * Order-intake shapes. Issue #342 §3.
 *
 * The intake is a proposal, not an order. It lives in `inbox_threads.metadata.order_intake` and
 * NOTHING is written to `orders` until a member approves it — see the measurement in #342 for why
 * a marked `orders` row was rejected (burned order numbers, an integrity check that would
 * heal-rewrite the model's output, and finance RLS that makes "sales may approve" harder).
 */

export type IntakeStatus = 'pending_review' | 'approved' | 'rejected';

/** How a line got its `product_id`. `none` = no catalog match; the line stays ad-hoc. */
export type MatchMethod = 'mivaa' | 'ilike' | 'visual' | 'manual' | 'none';

/** Where `unit_price` came from. The model NEVER supplies one. */
export type PriceSource = 'resolver' | 'manual';

export interface IntakeItem {
  line_no: number;
  /** The customer's own words for this line, kept verbatim so a reviewer can check the reading. */
  raw_text: string;
  product_id: string | null;
  match_method: MatchMethod;
  match_confidence: number | null;
  /** Alternative catalog matches, so the reviewer picks rather than re-searching. */
  candidates?: Array<{ product_id: string; name: string; score: number | null }>;
  description: string;
  quantity: number;
  /** Ex-VAT. Null when nothing could price it — a flagged gap, never a guess. */
  unit_price: number | null;
  unit_cost: number | null;
  measurement_unit_code: string | null;
  vat_percent: number | null;
  unit_price_source: PriceSource;
  needs_review: boolean;
}

export interface IntakeConfirmation {
  channel: 'whatsapp' | 'whatsapp_template' | 'email' | 'none';
  status: 'sent' | 'failed' | 'unavailable';
  at: string;
  detail?: string | null;
}

export interface OrderIntake {
  status: IntakeStatus;
  channel: string;
  /** The `inbox_messages.id` whose arrival produced this reading. */
  source_message_id: string | null;
  customer_contact_id: string | null;
  customer_company_id: string | null;
  currency: string;
  confidence: number | null;
  requested_delivery_date: string | null;
  notes: string | null;
  /** Set on approval. Its presence is what makes conversion idempotent. */
  order_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  /** Outcome of telling the customer (#342 §4a) — "approved but never told" must be visible. */
  confirmation?: IntakeConfirmation | null;
  items: IntakeItem[];
  created_at: string;
  updated_at: string;
}

/** Per-workspace gate, at `workspaces.settings.order_intake`. Disabled by default. */
export interface OrderIntakeSettings {
  /**
   * Off unless a workspace opts in. #209 shipped manual-only agent takeover because
   * "auto-engaging billing without an explicit opt-in felt wrong" — the same reasoning.
   */
  enabled: boolean;
  /** Currency for a proposal when the conversation does not state one. */
  currency: string;
  /** Credits per extraction, debited before the model call (invariant 10). */
  cost: number;
}

export const DEFAULT_ORDER_INTAKE_SETTINGS: OrderIntakeSettings = {
  enabled: false,
  currency: 'EUR',
  cost: 2,
};

/** Sum of the lines, for display only. The authoritative total is `recompute_order_totals`. */
export function intakeDisplayTotal(items: IntakeItem[]): { net: number; priced: number; unpriced: number } {
  let net = 0;
  let priced = 0;
  let unpriced = 0;
  for (const it of items) {
    if (it.unit_price == null) { unpriced++; continue; }
    priced++;
    net += (Number(it.quantity) || 0) * Number(it.unit_price);
  }
  return { net: Math.round(net * 100) / 100, priced, unpriced };
}
