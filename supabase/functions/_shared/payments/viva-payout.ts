/**
 * Viva.com money OUT — the Bank transfer API.
 *
 * Viva is not only a card rail. A merchant account holds wallets with real balances, and
 * `/banktransfers/v1` sends from one of them to an external IBAN. That makes Viva the second
 * provider that can MOVE money, which is why the audit ledger it writes into is
 * `payout_instructions` and not a Viva-shaped table of its own.
 *
 * Three things about this API decide the shape of everything below.
 *
 *  1. **Different credentials from the ones that charge cards.** The transfer scope
 *     (`urn:viva:payments:core:api:banktransfers`) belongs to Viva's "Account Transactions
 *     Credentials", a separate client pair in Settings → API Access — NOT the Smart Checkout
 *     client in `client_id`/`client_secret`. They live in `transfer_client_id` /
 *     `transfer_client_secret`, and their absence is the switch: no transfer credentials means
 *     this workspace cannot send, and the UI must not offer it.
 *
 *  2. **The recipient is LINKED first, then paid.** You cannot send to a bare IBAN. Linking
 *     mints a `bankAccountId` and validates the IBAN in the same call, so it is the exact twin
 *     of creating a Revolut counterparty — stored beside it on `crm_bank_accounts` and reused,
 *     never re-minted per payment.
 *
 *  3. **Amounts are MINOR units**, like every other Viva amount (`amountMinor` in
 *     viva-provider.ts). An integer euro figure sent here is a hundredfold underpayment that
 *     Viva will happily execute.
 *
 * Docs: https://developer.viva.com/apis-for-payments/bank-transfer-api/
 * Spec: https://developer.viva.com/downloads/payment-api.yaml (paths /banktransfers/v1/…)
 *
 * NOT YET EXERCISED against the live API — every shape here is read off that spec, the same
 * position the Revolut money-out leg is in. Expect first-contact corrections, and make the first
 * real transfer a small one.
 */
import { vivaHosts } from './viva-provider.ts';

/** What a workspace needs before it can send money through Viva. Absence = cannot send. */
export interface VivaTransferContext {
  workspaceId: string;
  transferClientId: string;
  transferClientSecret: string;
  isSandbox: boolean;
}

/**
 * Load the transfer credentials for a workspace, or null.
 *
 * Deliberately separate from `vivaProvider.resolveContext` — that answers "can this tenant CHARGE
 * a card", which is a different entitlement with different keys. Reusing it would offer money-out
 * to every workspace that can take a payment.
 */
export async function resolveVivaTransferContext(
  supabase: any,
  workspaceId: string,
): Promise<VivaTransferContext | null> {
  const { data, error } = await supabase
    .from('workspace_viva_config')
    .select('transfer_client_id, transfer_client_secret, environment, enabled')
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (error) {
    console.error('[payments/viva-payout] config read failed:', error.message || error);
    return null;
  }
  if (!data || !data.enabled) return null;
  if (!data.transfer_client_id || !data.transfer_client_secret) return null;

  return {
    workspaceId,
    transferClientId: String(data.transfer_client_id),
    transferClientSecret: String(data.transfer_client_secret),
    isSandbox: String(data.environment ?? 'production') !== 'production',
  };
}

/**
 * Client-credentials token for the TRANSFER client.
 *
 * Cached per client id + host, and never in the same slot as the checkout token: two clients with
 * different entitlements answering to one cache key is how a charge would start being attempted
 * with a transfer-only token (and vice versa), failing with an authorization error that names
 * neither.
 */
const transferTokenCache = new Map<string, { token: string; expiresAt: number }>();

export async function getVivaTransferToken(ctx: VivaTransferContext): Promise<string> {
  const hosts = vivaHosts(ctx.isSandbox);
  const cacheKey = `transfer:${hosts.accounts}:${ctx.transferClientId}`;
  const hit = transferTokenCache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now() + 60_000) return hit.token;

  const res = await fetch(`${hosts.accounts}/connect/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${ctx.transferClientId}:${ctx.transferClientSecret}`)}`,
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Viva transfer token request failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const out = await res.json();
  const token = out?.access_token as string | undefined;
  if (!token) throw new Error('Viva transfer token response contained no access_token');
  const ttl = Number(out?.expires_in ?? 3600);
  transferTokenCache.set(cacheKey, { token, expiresAt: Date.now() + ttl * 1000 });
  return token;
}

async function vivaTransferJson<T>(
  ctx: VivaTransferContext,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const hosts = vivaHosts(ctx.isSandbox);
  const token = await getVivaTransferToken(ctx);
  const res = await fetch(`${hosts.api}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    // Viva answers a missing entitlement with 401/403 and a body that names neither the scope nor
    // the credential set, so say which credential we used — the commonest cause by far is the
    // Smart Checkout client being pasted into the transfer fields.
    throw new Error(
      `Viva ${path} failed (${res.status}): ${text.slice(0, 300)}`
      + (res.status === 401 || res.status === 403
        ? ' — check these are the Account Transactions credentials, and that "Allow transfers between accounts" is ticked in the Viva banking app.'
        : ''),
    );
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export interface VivaWallet {
  walletId: number;
  /** Currency as ISO-4217 NUMERIC (978 = EUR) — Viva's convention throughout. */
  currencyCode: number;
  available: number;
  amount: number;
  isPrimary: boolean;
  friendlyName: string | null;
  iban: string | null;
}

/** The merchant's wallets — the accounts money can be sent FROM. */
export async function listVivaWallets(ctx: VivaTransferContext): Promise<VivaWallet[]> {
  const out = await vivaTransferJson<unknown>(ctx, '/merchants/v1/wallets', { method: 'GET' });
  const rows = Array.isArray(out) ? out : ((out as { items?: unknown[] })?.items ?? []);
  return (rows as Array<Record<string, unknown>>).map((w) => ({
    walletId: Number(w.walletId ?? 0),
    currencyCode: Number(w.currencyCode ?? 0),
    available: Number(w.available ?? 0),
    amount: Number(w.amount ?? 0),
    isPrimary: Boolean(w.isPrimary),
    friendlyName: (w.friendlyName as string) ?? null,
    iban: w.iban == null ? null : String(w.iban),
  })).filter((w) => w.walletId > 0);
}

export interface VivaLinkedAccount {
  bankAccountId: string;
  /** True when the "external" IBAN is actually inside Viva — a wallet, not a bank transfer. */
  isVivaIban: boolean;
  bankName: string | null;
}

/**
 * Link a beneficiary IBAN and get the id every later transfer names.
 *
 * The call validates the IBAN, so a rejection here IS the account-number check — there is no
 * separate validate step to skip. It is not, however, a name check: Viva does not confirm that
 * `beneficiaryName` belongs to the IBAN, so this is weaker than Revolut's VoP and the caller must
 * not present it to an operator as if a name had been verified.
 */
export async function linkVivaBankAccount(
  ctx: VivaTransferContext,
  input: { iban: string; beneficiaryName: string; friendlyName?: string },
): Promise<VivaLinkedAccount> {
  const out = await vivaTransferJson<Record<string, unknown>>(ctx, '/banktransfers/v1/bankaccounts', {
    method: 'POST',
    body: JSON.stringify({
      iban: input.iban.replace(/\s+/g, '').toUpperCase(),
      beneficiaryName: input.beneficiaryName,
      ...(input.friendlyName ? { friendlyName: input.friendlyName } : {}),
    }),
  });
  const bankAccountId = String(out.bankAccountId ?? '');
  if (!bankAccountId) throw new Error('Viva linked the account but returned no bankAccountId');
  return {
    bankAccountId,
    isVivaIban: Boolean(out.isVivaIban),
    bankName: (out.bankName as string) ?? null,
  };
}

export interface VivaTransferResult {
  commandId: string | null;
  walletTransactionId: string | null;
  isInstant: boolean;
  /** The SENDER's fee only — Viva is explicit that the beneficiary's own fee is not included. */
  fee: number;
}

/**
 * Execute the transfer.
 *
 * `amount` is in MINOR units. Without `bankCommandId` Viva defaults to instructionType=Shared and
 * isInstant=false, which is the cheap, ordinary SEPA behaviour — we do not quote a fee command,
 * because doing so would commit the workspace to a fee it never saw.
 */
export async function sendVivaBankTransfer(
  ctx: VivaTransferContext,
  input: { bankAccountId: string; walletId: number; amountMinor: number; description?: string },
): Promise<VivaTransferResult> {
  if (!Number.isInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error('Viva transfer amount must be a positive integer in minor units');
  }
  const out = await vivaTransferJson<Record<string, unknown>>(
    ctx,
    `/banktransfers/v1/bankaccounts/${encodeURIComponent(input.bankAccountId)}:send`,
    {
      method: 'POST',
      body: JSON.stringify({
        amount: input.amountMinor,
        walletId: input.walletId,
        ...(input.description ? { description: input.description.slice(0, 140) } : {}),
      }),
    },
  );
  return {
    commandId: out.commandId == null ? null : String(out.commandId),
    walletTransactionId: out.walletTransactionId == null ? null : String(out.walletTransactionId),
    isInstant: Boolean(out.isInstant),
    fee: Number(out.fee ?? 0),
  };
}
