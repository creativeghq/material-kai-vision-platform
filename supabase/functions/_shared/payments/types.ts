/**
 * payment-provider abstraction (server side).
 *
 * Mirrors `_shared/fiscal/types.ts`, with one deliberate difference: fiscal picks ONE
 * winning connector per capability, whereas payments are **multi-select** — a seller may
 * offer Stripe card AND Viva RF bank transfer on the same invoice and let the customer
 * choose. So the resolver returns an array, not a winner.
 *
 * A provider produces one of two fundamentally different things:
 *   - a **redirect** the customer is sent to (hosted card checkout), or
 *   - a **bank reference** the customer pays from their own banking app (Viva RF code),
 *     where settlement arrives later and is reconciled by webhook.
 * The hosted pay page renders each differently, so the shape is discriminated.
 */

/** Provider slug — always matches the module slug suffix (`payments-<slug>`). */
export type PaymentProviderSlug = 'stripe' | 'viva' | 'revolut';

/** A concrete way to pay, as offered to the customer. */
export type PaymentMethodKind = 'card' | 'bank_reference';

export interface PaymentProviderContext {
  /** Tenant whose merchant account collects the funds. */
  workspaceId: string;
  /** Resolved credentials — shape is provider-specific. */
  credentials: Record<string, string>;
  /** Demo/sandbox vs live. */
  isSandbox: boolean;
}

export interface CreateChargeInput {
  invoiceId: string;
  /** Charge amount in MAJOR units, already clamped server-side to [min, amount_due]. */
  amount: number;
  currency: string;
  /** Customer-visible line description, e.g. "Deposit — Invoice INV-0042". */
  description: string;
  /** Human invoice number, for the provider's own merchant-side reference. */
  invoiceNumber: string;
  /** Which of the provider's methods to use. */
  method: PaymentMethodKind;
  successUrl?: string;
  cancelUrl?: string;
}

/** Hosted checkout — send the customer here. */
export interface RedirectCharge {
  kind: 'redirect';
  url: string;
  /** Provider-side order/session id, persisted on invoice_payment_intents. */
  orderCode: string;
}

/** Bank-reference — show these details; money arrives asynchronously. */
export interface BankReferenceCharge {
  kind: 'bank_reference';
  /** Creditor Reference (RF…) the customer quotes as the payment reason. */
  rfCode: string;
  iban?: string;
  amount: number;
  currency: string;
  orderCode: string;
}

export type ChargeResult = RedirectCharge | BankReferenceCharge;

export interface PaymentProvider {
  slug: PaymentProviderSlug;
  /** Display name for the hosted pay page's method chooser. */
  label: string;
  /** Which methods this provider can offer at all (a workspace may enable a subset). */
  methods: PaymentMethodKind[];
  /** Currencies this provider can charge; `null` = no restriction (Stripe). */
  currencies: string[] | null;
  /**
   * Resolve this tenant's credentials. Returns null when the workspace has not
   * connected the provider yet — the caller reports "not connected", never falls back
   * to another tenant's or the operator's keys.
   */
  resolveContext(supabase: any, workspaceId: string): Promise<PaymentProviderContext | null>;
  /** Create a charge. Throws on provider error; the caller maps that to a 502. */
  createCharge(input: CreateChargeInput, ctx: PaymentProviderContext): Promise<ChargeResult>;
}

/** A provider that is enabled AND configured for a given workspace. */
export interface AvailableProvider {
  slug: PaymentProviderSlug;
  label: string;
  /** Methods offered to the customer = provider methods ∩ workspace's enabled methods. */
  methods: PaymentMethodKind[];
  /** False when entitled but not yet connected — surfaced to the seller, not the buyer. */
  configured: boolean;
}
