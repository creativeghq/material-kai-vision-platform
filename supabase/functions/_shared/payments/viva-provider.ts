/**
 * Viva.com as a `PaymentProvider` (per-tenant BYOK).
 *
 * Unlike Stripe (platform key + Connect destination), every tenant brings their OWN Viva
 * merchant account and funds settle directly to their wallet. We never fall back to the
 * operator's credentials — an unconfigured workspace simply cannot charge.
 *
 * THREE HOST FAMILIES, and they are not interchangeable:
 *   accounts.*  — OAuth2 token issuance
 *   api.*       — OAuth2-authenticated REST (create order, retrieve transaction)
 *   www.*       — Basic-auth legacy API, RF codes, and the customer checkout redirect
 *
 * UNIT CONVENTIONS DIFFER PER CALL — do not share a parser:
 *   create order request   → MINOR units (10037 = €100.37), min 30
 *   webhook EventData      → MAJOR units, signed (negative on reversal)
 *   retrieve transaction   → MAJOR units, camelCase
 *
 * Docs: https://developer.viva.com/apis-for-payments/payment-api/
 *       https://developer.viva.com/payment-tools/rf-code-payments/
 */

import type {
  ChargeResult,
  CreateChargeInput,
  PaymentProvider,
  PaymentProviderContext,
} from './types.ts';

interface VivaHosts {
  accounts: string;
  api: string;
  www: string;
}

export function vivaHosts(isSandbox: boolean): VivaHosts {
  return isSandbox
    ? {
      accounts: 'https://demo-accounts.vivapayments.com',
      api: 'https://demo-api.vivapayments.com',
      www: 'https://demo.vivapayments.com',
    }
    : {
      accounts: 'https://accounts.vivapayments.com',
      api: 'https://api.vivapayments.com',
      www: 'https://www.vivapayments.com',
    };
}

/** ISO 4217 numeric codes — Viva wants the NUMBER (978), not the letters (EUR). */
const CURRENCY_NUMERIC: Record<string, number> = {
  EUR: 978, RON: 946, PLN: 985, CZK: 203, HUF: 348, SEK: 752, DKK: 208, GBP: 826,
};

/** The 8 currencies Viva Smart Checkout supports. */
export const VIVA_CURRENCIES = Object.keys(CURRENCY_NUMERIC);

/**
 * OAuth2 client-credentials token. Cached in-process for slightly less than its 3600s TTL
 * so a burst of charges doesn't re-authenticate per request. Keyed by client_id + host so
 * two tenants (or demo/prod) never share a token.
 */
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export async function getVivaAccessToken(ctx: PaymentProviderContext): Promise<string> {
  const { client_id, client_secret } = ctx.credentials;
  if (!client_id || !client_secret) throw new Error('Viva client credentials missing');

  const hosts = vivaHosts(ctx.isSandbox);
  const cacheKey = `${hosts.accounts}:${client_id}`;
  const hit = tokenCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now() + 60_000) return hit.token;

  // No `scope` parameter — Viva derives scope from the client's entitlements and
  // RETURNS it. Sending one is undocumented.
  const res = await fetch(`${hosts.accounts}/connect/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${client_id}:${client_secret}`)}`,
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Viva token request failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const out = await res.json();
  const token = out?.access_token as string | undefined;
  if (!token) throw new Error('Viva token response contained no access_token');

  const ttl = Number(out?.expires_in ?? 3600);
  tokenCache.set(cacheKey, { token, expiresAt: Date.now() + ttl * 1000 });
  return token;
}

/**
 * Extract Viva's orderCode WITHOUT letting JS truncate it.
 *
 * orderCode is int64 (16 digits in practice) — larger than Number.MAX_SAFE_INTEGER, so
 * `JSON.parse` silently corrupts the last digits. We therefore pull it out of the RAW
 * response text with a regex before any parse touches it.
 */
export function extractOrderCode(rawBody: string): string | null {
  const m = rawBody.match(/"orderCode"\s*:\s*"?(\d+)"?/i);
  return m ? m[1] : null;
}

/**
 * Create a Viva payment order and return the checkout redirect.
 *
 * The success/failure URLs are NOT settable here — Viva takes them from the payment
 * SOURCE (`sourceCode`) configured in the merchant's dashboard, and returns the customer
 * with `?t={transactionId}&s={orderCode}`. Our return route resolves the invoice from
 * `s` via invoice_payment_intents.
 */
/** Viva's sentinel paymentTimeout for a never-expiring order (confirmed on demo:
 *  ExpirationDate comes back null). Used for RF codes printed on a document, which a
 *  customer may pay days later — a default ~30-minute order would be dead on arrival. */
export const VIVA_NEVER_EXPIRES = 65535;

async function createVivaOrder(
  input: CreateChargeInput,
  ctx: PaymentProviderContext,
  opts: { disableExactAmount?: boolean; paymentTimeout?: number } = {},
): Promise<{ orderCode: string }> {
  const token = await getVivaAccessToken(ctx);
  const hosts = vivaHosts(ctx.isSandbox);

  const currency = input.currency.toUpperCase();
  const numeric = CURRENCY_NUMERIC[currency];
  if (!numeric) throw new Error(`Viva does not support ${currency}`);

  // MINOR units here (and only here).
  const amountMinor = Math.round(input.amount * 100);
  if (amountMinor < 30) throw new Error('Viva minimum charge is 0.30');

  const res = await fetch(`${hosts.api}/checkout/v2/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      amount: amountMinor,
      currencyCode: numeric,
      customerTrns: input.description,
      // Our own reference; surfaces in the tenant's Viva banking app.
      merchantTrns: `${input.invoiceNumber} / ${input.invoiceId}`,
      sourceCode: ctx.credentials.source_code || 'Default',
      tags: ['materialshub', `invoice:${input.invoiceId}`],
      ...(opts.disableExactAmount ? { disableExactAmount: true } : {}),
      ...(opts.paymentTimeout != null ? { paymentTimeout: opts.paymentTimeout } : {}),
    }),
  });

  const rawBody = await res.text();
  if (!res.ok) {
    throw new Error(`Viva create-order failed (${res.status}): ${rawBody.slice(0, 300)}`);
  }

  const orderCode = extractOrderCode(rawBody);
  if (!orderCode) {
    throw new Error(`Viva create-order returned no orderCode: ${rawBody.slice(0, 300)}`);
  }
  return { orderCode };
}

/**
 * Mint a NEVER-EXPIRING RF code for an invoice/proforma document (as opposed to the
 * transient one a buyer mints on the pay page). Returns the order + RF so the caller can
 * persist an invoice_payment_intents row and print the code on the document.
 */
export async function mintInvoiceRf(
  ctx: PaymentProviderContext,
  input: { invoiceId: string; invoiceNumber: string; amount: number; currency: string; description: string },
): Promise<{ orderCode: string; rfCode: string }> {
  const { orderCode } = await createVivaOrder(
    { ...input, method: 'bank_reference', successUrl: undefined, cancelUrl: undefined } as CreateChargeInput,
    ctx,
    { paymentTimeout: VIVA_NEVER_EXPIRES },
  );
  const rfCode = await generateRfCode(orderCode, ctx);
  return { orderCode, rfCode };
}

/**
 * Generate the 20-digit RF Creditor Reference for an order (Greek merchants only).
 *
 * Two things worth knowing:
 *  1. This endpoint takes NO authentication — which makes an orderCode semi-secret.
 *     Never expose one on a public surface beyond the buyer who owns it.
 *  2. Viva does NOT publish this call's success schema: the OpenAPI `200` example is the
 *     placeholder string "200 No Content" while the prose says it returns the RF code.
 *     So the parser below is deliberately defensive — it accepts the plausible shapes and
 *     otherwise regex-scans for the RF pattern, logging the raw body so the first real
 *     demo call tells us the true shape instead of failing silently.
 */
export async function generateRfCode(
  orderCode: string,
  ctx: PaymentProviderContext,
): Promise<string> {
  const hosts = vivaHosts(ctx.isSandbox);
  const res = await fetch(`${hosts.www}/web2/checkout/v2/paymentsessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // orderCode is declared `type: string` in Viva's own schema — send it as one.
    body: JSON.stringify({ orderCode }),
  });

  const rawBody = await res.text();
  if (!res.ok) {
    // Documented errors are {status, message, eventId}; 5501 = order not found.
    throw new Error(`Viva RF generation failed (${res.status}): ${rawBody.slice(0, 300)}`);
  }

  const rf = parseRfCode(rawBody);
  if (!rf) {
    console.error('[payments/viva] RF response shape unrecognised — raw body:', rawBody.slice(0, 500));
    throw new Error('Viva returned no recognisable RF code');
  }
  return rf;
}

/**
 * Pull an RF code out of the RF-generation response.
 *
 * CONFIRMED against Viva demo (2026-08-03), which Viva does NOT document — the real
 * success body is:  {"rfPaymentCode":"RF12907263102785539868300"}
 * i.e. `rfPaymentCode`, value `RF` + ~23 digits (longer than the "20-digit" the prose
 * claims). The parser stays defensive anyway (unknown-key + regex fallbacks) so a future
 * shape change degrades to a logged raw body rather than a silent wrong parse.
 *
 * RF is an ISO-11649 Creditor Reference: `RF` + 2 check digits + up to 21 more chars.
 */
export function parseRfCode(rawBody: string): string | null {
  // RF + 2 check digits + 8..25 trailing chars. Deliberately wider than the observed 23
  // so we never under-match a valid code again.
  const RF_RE = /\bRF\d{2}[A-Z0-9]{8,25}\b/i;

  const direct = rawBody.match(RF_RE);
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return direct ? direct[0].toUpperCase() : null;
  }

  if (typeof parsed === 'string') {
    const m = parsed.match(RF_RE);
    return m ? m[0].toUpperCase() : null;
  }
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    // `rfPaymentCode` is the confirmed key; the rest are belt-and-braces.
    for (const key of ['rfPaymentCode', 'rfCode', 'RfCode', 'rf', 'paymentCode', 'referenceNumber', 'code']) {
      const v = obj[key];
      if (typeof v === 'string' && RF_RE.test(v)) return v.toUpperCase();
    }
  }
  return direct ? direct[0].toUpperCase() : null;
}

export const vivaProvider: PaymentProvider = {
  slug: 'viva',
  label: 'Viva.com',
  // RF generation is confirmed against Viva demo (2026-08-03): the code + parser + the
  // {"rfPaymentCode":"RF…"} response shape are all verified live, and settlement reconciles
  // via order-state polling (retrieveVivaOrder, StateId===3) driven by the 2054 webhook plus
  // a periodic safety-net sweep. Still needs ONE real bank transfer to confirm the
  // 2054→StateId=3 timing end-to-end; until then a tenant enables it deliberately per-workspace
  // (methods jsonb), it is never on by default. Card is fully wired and proven.
  methods: ['card', 'bank_reference'],
  currencies: VIVA_CURRENCIES,

  async resolveContext(supabase: any, workspaceId: string): Promise<PaymentProviderContext | null> {
    const { data, error } = await supabase
      .from('workspace_viva_config')
      .select('client_id, client_secret, merchant_id, api_key, source_code, environment, enabled, methods, webhook_verified_at')
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (error) {
      console.error('[payments/viva] config read failed:', error.message || error);
      return null;
    }
    // BYOK: no row, disabled, or incomplete credentials → this tenant cannot charge.
    // We deliberately do NOT fall back to any operator-level Viva account.
    // CRITICAL (settlement invariant): this gate is the AUTHORITATIVE "can Viva be offered?" check —
    // the customer pay page offers a provider purely on resolveContext≠null. It MUST require everything
    // the settlement loop needs, or a customer can pay a charge that can never be recorded:
    //   • merchant_id — the ONLY key viva-webhooks uses to map an inbound delivery back to this
    //     workspace. Missing it ⇒ the webhook drops every delivery ⇒ paid-but-unsettled.
    //   • api_key — required by retrieveVivaTransaction, the webhook's security read-back boundary.
    //   • webhook_verified_at — proves the tenant actually completed webhook setup, so deliveries arrive.
    // (Previously only client_id+client_secret were required, matching the client-side "connected"
    // definition to the server's; the two had diverged.)
    if (!data || !data.enabled) return null;
    if (!data.client_id || !data.client_secret) return null;
    if (!data.merchant_id || !data.api_key || !data.webhook_verified_at) return null;

    return {
      workspaceId,
      credentials: {
        client_id: data.client_id,
        client_secret: data.client_secret,
        merchant_id: data.merchant_id ?? '',
        api_key: data.api_key ?? '',
        source_code: data.source_code ?? 'Default',
        // Consumed by the registry to intersect offered methods.
        __methods: Array.isArray(data.methods) ? data.methods.join(',') : '',
      },
      isSandbox: (data.environment ?? 'demo') !== 'production',
    };
  },

  async createCharge(input: CreateChargeInput, ctx: PaymentProviderContext): Promise<ChargeResult> {
    // Honor the tenant's ENABLED method subset at charge time, not just the provider's full capability.
    // Discovery intersects `methods`, but a crafted request could ask for a method the seller disabled
    // (e.g. bank_reference on a card-only workspace) — the dispatch validates against provider.methods,
    // so enforce the per-tenant subset here too.
    const enabled = String(ctx.credentials.__methods ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (enabled.length && !enabled.includes(input.method)) {
      throw new Error(`Payment method "${input.method}" is not enabled for this workspace.`);
    }
    const hosts = vivaHosts(ctx.isSandbox);
    const { orderCode } = await createVivaOrder(input, ctx);

    if (input.method === 'bank_reference') {
      const rfCode = await generateRfCode(orderCode, ctx);
      return {
        kind: 'bank_reference',
        rfCode,
        amount: input.amount,
        currency: input.currency.toUpperCase(),
        orderCode,
      };
    }

    return {
      kind: 'redirect',
      // Checkout lives on the www./demo. host, NOT api.
      url: `${hosts.www}/web/checkout?ref=${orderCode}`,
      orderCode,
    };
  },
};

/**
 * Re-read a transaction from Viva. This is the SECURITY BOUNDARY for the webhook: payment
 * webhooks carry no per-message signature, so we treat a delivery as a trigger only and
 * trust nothing but this response's own orderCode / statusId / amount.
 *
 * Amounts here are MAJOR units, camelCase (a third convention — see the file header).
 */
export async function retrieveVivaTransaction(
  transactionId: string,
  ctx: PaymentProviderContext,
): Promise<{
  orderCode: string | null;
  statusId: string;
  amount: number;
  currencyCode: string;
  transactionTypeId: number;
  raw: Record<string, unknown>;
}> {
  const token = await getVivaAccessToken(ctx);
  const hosts = vivaHosts(ctx.isSandbox);

  const res = await fetch(`${hosts.api}/checkout/v2/transactions/${transactionId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const rawBody = await res.text();
  if (!res.ok) {
    throw new Error(`Viva retrieve-transaction failed (${res.status}): ${rawBody.slice(0, 300)}`);
  }

  const orderCode = extractOrderCode(rawBody); // string-safe, pre-parse
  const t = JSON.parse(rawBody) as Record<string, unknown>;

  return {
    orderCode,
    statusId: String(t.statusId ?? ''),
    amount: Number(t.amount ?? 0),
    currencyCode: String(t.currencyCode ?? ''),
    transactionTypeId: Number(t.transactionTypeId ?? -1),
    raw: t,
  };
}

/** Viva order StateId. 3 = Paid is the one that means "collect it". */
export const VIVA_ORDER_STATE = {
  PENDING: 0,
  EXPIRED: 1,
  CANCELLED: 2,
  PAID: 3,
} as const;

/**
 * Re-read an ORDER's state (`GET /api/orders/{orderCode}`, Basic auth on the www. host).
 *
 * This is how RF / bank-transfer settlement is confirmed. A bank transfer produces NO card
 * `TransactionId` — the `Account Transaction Created` (2054) webhook only tells us "money
 * moved on the wallet", not which order. So instead of a transaction read-back we poll the
 * order the RF code was minted against: `StateId === 3` means the transfer landed. Keyed on
 * orderCode alone, which we hold in `invoice_payment_intents`.
 *
 * Verified against Viva demo 2026-08-03: returns `{OrderCode, StateId, RequestAmount, …}`,
 * amount in MAJOR units.
 */
export async function retrieveVivaOrder(
  orderCode: string,
  ctx: PaymentProviderContext,
): Promise<{ orderCode: string; stateId: number; amount: number; raw: Record<string, unknown> }> {
  const { merchant_id, api_key } = ctx.credentials;
  if (!merchant_id || !api_key) throw new Error('Viva merchant credentials missing for order retrieve');

  const hosts = vivaHosts(ctx.isSandbox);
  const res = await fetch(`${hosts.www}/api/orders/${orderCode}`, {
    headers: { Authorization: `Basic ${btoa(`${merchant_id}:${api_key}`)}` },
  });
  const rawBody = await res.text();
  if (!res.ok) {
    throw new Error(`Viva retrieve-order failed (${res.status}): ${rawBody.slice(0, 300)}`);
  }

  const oc = extractOrderCodePascal(rawBody) ?? orderCode; // string-safe (order-retrieve is PascalCase)
  const o = JSON.parse(rawBody) as Record<string, unknown>;
  return {
    orderCode: oc,
    stateId: Number(o.StateId ?? -1),
    amount: Number(o.RequestAmount ?? 0),
    raw: o,
  };
}

/** Order-retrieve returns PascalCase `OrderCode` — pull it string-safe like the camelCase one. */
function extractOrderCodePascal(rawBody: string): string | null {
  const m = rawBody.match(/"OrderCode"\s*:\s*"?(\d+)"?/);
  return m ? m[1] : null;
}
