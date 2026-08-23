/**
 * Zernio phone numbers — search, buy, list, release.
 *
 * Zernio provisions numbers in 54 countries ($3–$21/month) and "a WhatsApp number is just a
 * phone number with WhatsApp enabled on it". None of it was reachable from this platform: the
 * only way to get a WhatsApp sender was to already own one and connect it, which is a dead end
 * for any tenant that does not have one — and the commonest reason a workspace never turns
 * WhatsApp on.
 *
 * TENANCY. Every endpoint here takes or returns `profileId`, and the profile-per-workspace map
 * (`social_zernio_profiles`) is exactly that boundary: a purchase goes INTO the workspace's own
 * profile, the list is filtered BY it, a release is checked AGAINST it. Which is also why the
 * shared-default-profile fallback has to block the writes — see `assertOwnProfile`.
 *
 * Separate module rather than more of `zernio.ts` only because that file is already the shared
 * transport for two products; this is one feature's surface on top of it.
 *
 * Every exported call takes `supabase` and resolves secrets itself. That looks redundant next to
 * the handler doing it at entry, and is not: on the edge runtime the key may live only in
 * `platform_secrets`, and a wrapper that trusts its caller to have resolved first is one import
 * away from running on an unresolved (env-only) key — which fails as a 401 from Zernio, not as
 * anything that names the real cause. `resolveSecret` caches, so the repeat costs nothing.
 */
import { zernioApi, ensureZernioSecrets } from './zernio.ts';

type SupabaseLike = { from: (t: string) => any };

export interface AvailablePhoneNumber {
  phoneNumber: string;
  features: string[];
}

export interface PhoneNumberSearch {
  country: string;
  numberType: string | null;
  requireSms: boolean;
  numbers: AvailablePhoneNumber[];
}

/** `GET /v1/phone-numbers/available`. Voice is always required; `sms` narrows to texting. */
export async function searchAvailablePhoneNumbers(supabase: SupabaseLike, params: {
  country?: string;
  type?: string;
  prefix?: string;
  locality?: string;
  contains?: string;
  sms?: boolean;
  limit?: number;
}): Promise<PhoneNumberSearch> {
  await ensureZernioSecrets(supabase);
  const qs = new URLSearchParams();
  if (params.country) qs.set('country', params.country);
  if (params.type) qs.set('type', params.type);
  if (params.prefix) qs.set('prefix', params.prefix);
  if (params.locality) qs.set('locality', params.locality);
  if (params.contains) qs.set('contains', params.contains);
  if (params.sms) qs.set('sms', 'true');
  qs.set('limit', String(Math.min(Math.max(params.limit ?? 20, 1), 100)));

  const data = await zernioApi('GET', `/phone-numbers/available?${qs.toString()}`);
  return {
    country: data.country ?? params.country ?? 'US',
    numberType: data.numberType ?? null,
    requireSms: Boolean(data.requireSms),
    numbers: (data.numbers ?? []) as AvailablePhoneNumber[],
  };
}

export interface OwnedPhoneNumber {
  id: string;
  phoneNumber: string;
  country: string | null;
  status: string | null;
  profileId: string | null;
  monthlyCents: number | null;
  callingEnabled: boolean;
  /** A bring-your-own number, reported by Zernio under `connected`: not billed, no lifecycle. */
  broughtYourOwn: boolean;
  displayName: string | null;
}

/**
 * `GET /v1/phone-numbers`, ALWAYS filtered to one profile.
 *
 * `profileId` is a required parameter rather than an optional filter on purpose: unfiltered,
 * this returns every tenant's numbers on the operator's account, and a caller who forgets gets
 * that silently — a valid list, just somebody else's.
 */
export async function listPhoneNumbers(
  supabase: SupabaseLike,
  profileId: string,
  status?: string,
): Promise<OwnedPhoneNumber[]> {
  await ensureZernioSecrets(supabase);
  const qs = new URLSearchParams({ profileId });
  if (status) qs.set('status', status);
  const data = await zernioApi('GET', `/phone-numbers?${qs.toString()}`);

  const purchased = ((data.numbers ?? []) as Array<Record<string, unknown>>).map((n) => ({
    id: String(n._id ?? n.id ?? ''),
    phoneNumber: String(n.phoneNumber ?? ''),
    country: (n.country as string) ?? null,
    status: (n.status as string) ?? null,
    profileId: (n.profileId as string) ?? null,
    monthlyCents: typeof n.monthlyCents === 'number' ? n.monthlyCents : null,
    callingEnabled: Boolean(n.callingEnabled),
    broughtYourOwn: false,
    displayName: null,
  }));

  // `connected` is the BYO half of the same answer. Dropping it would show a tenant who had
  // connected their own number "no numbers" on a screen whose whole job is listing numbers.
  const connected = ((data.connected ?? []) as Array<Record<string, unknown>>)
    .filter((n) => n.profileId === profileId)
    .map((n) => ({
      id: String(n._id ?? n.id ?? n.phoneNumber ?? ''),
      phoneNumber: String(n.phoneNumber ?? ''),
      country: (n.country as string) ?? null,
      status: 'connected',
      profileId: (n.profileId as string) ?? null,
      monthlyCents: null,
      callingEnabled: Boolean(n.callingEnabled),
      broughtYourOwn: true,
      displayName: (n.displayName as string) ?? null,
    }));

  return [...purchased, ...connected];
}

export type PurchaseOutcome =
  | { kind: 'checkout'; message: string | null; checkoutUrl: string }
  | { kind: 'kyc_required'; country: string | null; numberType: string | null; kycUrl: string }
  | { kind: 'done'; message: string | null };

/**
 * `POST /v1/phone-numbers/purchase`.
 *
 * Three non-failure outcomes, and collapsing them is how a buy flow lies to the operator:
 *  - 200 returns a Stripe `checkoutUrl` — NOTHING is bought until that is paid;
 *  - 202 `kyc_required` means the country needs identity documents first, and returns the form;
 *  - anything else is a plain success message.
 * 402 (no payment method) and 409 (`PURCHASE_VELOCITY` / `AREA_CODE_UNAVAILABLE`) are real
 * failures whose specific cause is worth repeating instead of "purchase failed".
 */
export async function purchasePhoneNumber(supabase: SupabaseLike, params: {
  profileId: string;
  country?: string;
  numberType?: 'local' | 'mobile' | 'national' | 'toll_free';
  areaCode?: string;
  connectWhatsapp?: boolean;
  wantsSms?: boolean;
  wantsWhatsapp?: boolean;
  /** Idempotency key. Zernio also applies its own 10-minute duplicate-purchase velocity check. */
  purchaseIntentId?: string;
  allowMultiple?: boolean;
}): Promise<PurchaseOutcome> {
  await ensureZernioSecrets(supabase);
  const body: Record<string, unknown> = {
    profileId: params.profileId,
    country: params.country ?? 'US',
    connectWhatsapp: params.connectWhatsapp ?? true,
    wantsWhatsapp: params.wantsWhatsapp ?? true,
    wantsSms: params.wantsSms ?? false,
  };
  if (params.numberType) body.numberType = params.numberType;
  if (params.areaCode) body.areaCode = params.areaCode;
  if (params.purchaseIntentId) body.purchaseIntentId = params.purchaseIntentId.slice(0, 100);
  if (params.allowMultiple) body.allowMultiple = true;

  const data = await zernioApi('POST', '/phone-numbers/purchase', body);

  if (data?.status === 'kyc_required') {
    return {
      kind: 'kyc_required',
      country: data.country ?? null,
      numberType: data.numberType ?? null,
      kycUrl: String(data.kycUrl ?? ''),
    };
  }
  if (data?.checkoutUrl) {
    return { kind: 'checkout', message: data.message ?? null, checkoutUrl: String(data.checkoutUrl) };
  }
  return { kind: 'done', message: data?.message ?? null };
}

/**
 * `DELETE /v1/phone-numbers/{id}` — irreversible. It also disconnects the linked WhatsApp
 * account and decrements the operator's Stripe subscription (cancelling it on the last number).
 *
 * The caller MUST have established that the number belongs to the target workspace's profile
 * first. `id` is a bare record id on a shared operator account, so without that check any tenant
 * could cancel any other tenant's number by passing one — the textbook BOLA.
 */
export async function releasePhoneNumber(
  supabase: SupabaseLike,
  id: string,
): Promise<{ phoneNumber: string | null; releasedAt: string | null }> {
  await ensureZernioSecrets(supabase);
  const data = await zernioApi('DELETE', `/phone-numbers/${encodeURIComponent(id)}`);
  return {
    phoneNumber: data?.phoneNumber?.phoneNumber ?? null,
    releasedAt: data?.phoneNumber?.releasedAt ?? null,
  };
}

/**
 * Refuse a money/lifecycle operation when the workspace does not have a Zernio profile to itself.
 *
 * At the plan's profile ceiling `resolveWorkspaceProfile` falls back to the shared default
 * profile, and from that moment "the numbers on this workspace's profile" is several tenants'
 * numbers in one list. Buying into it is merely wasteful; releasing out of it cancels somebody
 * else's number and disconnects their WhatsApp. Reads stay allowed — it is the writes that stop.
 */
export async function assertOwnProfile(
  supabase: SupabaseLike,
  workspaceId: string,
  profileId: string,
): Promise<void> {
  const { data } = await supabase
    .from('social_zernio_profiles')
    .select('workspace_id')
    .eq('zernio_profile_id', profileId);

  const sharers = (data ?? []) as Array<{ workspace_id: string }>;
  if (sharers.length > 1) {
    throw new Error(
      `This workspace shares a Zernio profile with ${sharers.length - 1} other workspace(s), `
      + 'because the Zernio plan ran out of profiles. Buying or releasing a number here would '
      + 'affect them too. Raise the profile limit on the Zernio plan first.',
    );
  }
  if (sharers.length === 1 && sharers[0].workspace_id !== workspaceId) {
    throw new Error('The resolved Zernio profile does not belong to this workspace.');
  }
}
