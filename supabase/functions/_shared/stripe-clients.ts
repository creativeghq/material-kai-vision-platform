/**
 * Shared lazy Stripe + Supabase client factories for every edge function that
 * touches Stripe (stripe-webhooks, stripe-api handlers, stripe-connect,
 * finance-pay-invoice, the bank feed, the payments provider registry).
 *
 * Why this exists:
 *   Stripe credentials may live in either Deno.env (a real deploy secret) OR the
 *   platform_secrets DB table (admin-saved at /admin/modules/payments-stripe/
 *   settings → Keys). Both have to work, and env has to win, because env is an
 *   explicit deployer choice and the DB store is self-service.
 *
 *   This file used to read the keys with `Deno.env.get()` and lean on
 *   `_shared/secrets-bootstrap.ts` having copied the DB rows into env first.
 *   That bootstrap CANNOT work on the Supabase edge runtime: `Deno.env.set`
 *   throws "The operation is not supported" there, which secrets-bootstrap.ts
 *   documents at its own catch site. So the DB half was dead — a key saved on
 *   the Keys tab was invisible to every Stripe function, for ever, and the 503
 *   those functions return tells the operator to go set it on exactly that tab.
 *   Only a real deploy secret ever worked.
 *
 *   The keys are therefore resolved through `_shared/secrets.ts → resolveSecret`,
 *   which reads env first and queries platform_secrets itself (30s row cache).
 *   That is the canonical path for every admin-editable secret in the platform.
 *
 * Pattern at call site — the getters are ASYNC, because resolving may hit the DB:
 *
 *   import { getStripe, getSupabase, noPaymentProviderResponse } from '../_shared/stripe-clients.ts';
 *
 *   Deno.serve(async (req) => {
 *     const stripe = await getStripe();
 *     if (!stripe) return noPaymentProviderResponse();
 *     // … use stripe normally
 *   });
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Stripe from 'https://esm.sh/stripe@14.10.0';
import { resolveSecret } from './secrets.ts';

// ──────────────────────────────────────────────────────────────────────────
// Supabase — env-only, and that is correct
// ──────────────────────────────────────────────────────────────────────────
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected by the platform itself and are
// never admin-editable. They also have to stay sync + env-only: resolveSecret needs this
// client to reach platform_secrets at all, so routing them through it would be circular.

export const supabaseUrlEnv = () => Deno.env.get('SUPABASE_URL') || '';
export const supabaseServiceKeyEnv = () => Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

let _supabase: SupabaseClient | null = null;

/**
 * Returns a memoised service-role Supabase client. Null when the URL or
 * service-role key can't be resolved — typically a misconfigured deploy.
 */
export function getSupabase(): SupabaseClient | null {
  if (_supabase) return _supabase;
  const url = supabaseUrlEnv();
  const key = supabaseServiceKeyEnv();
  if (!url || !key) return null;
  _supabase = createClient(url, key);
  return _supabase;
}

// ──────────────────────────────────────────────────────────────────────────
// Stripe keys — env first, platform_secrets second
// ──────────────────────────────────────────────────────────────────────────

/** Resolve one admin-editable secret. Falls back to bare env when there is no DB reach. */
async function secret(key: string): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) return Deno.env.get(key) || '';
  const r = await resolveSecret(supabase, key);
  return r.value || '';
}

export const stripeSecretKey = () => secret('STRIPE_SECRET_KEY');
export const stripeWebhookSecret = () => secret('STRIPE_WEBHOOK_SECRET');

// platform-billing (operator SaaS revenue: subscriptions / credits / API) is collected
// on a DEDICATED Stripe account, separate from the default key (tenant invoice payments) and
// from per-tenant Connect. These are optional — everything falls back to the default
// key until the operator configures a separate billing account, so existing deploys are
// unaffected.
export const platformBillingSecretKey = () => secret('STRIPE_BILLING_SECRET_KEY');
export const platformBillingWebhookSecret = () => secret('STRIPE_BILLING_WEBHOOK_SECRET');

/** True when a DISTINCT platform-billing Stripe account is configured (key set AND different
 *  from the default). Drives whether platform charges use a separate customer id + account. */
export async function hasDistinctBillingAccount(): Promise<boolean> {
  const [b, d] = await Promise.all([platformBillingSecretKey(), stripeSecretKey()]);
  return !!b && b !== d;
}

// ──────────────────────────────────────────────────────────────────────────
// Memoised client factories
// ──────────────────────────────────────────────────────────────────────────
// Memoised against the key they were BUILT from, not merely "built once". An admin rotating
// the key on the Keys tab changes what resolveSecret returns 30s later, and a worker still
// serving the old client would keep charging the old account with nothing raised.

interface Memo { key: string; client: Stripe }
let _stripe: Memo | null = null;
let _billingStripe: Memo | null = null;

function build(key: string): Stripe {
  return new Stripe(key, {
    apiVersion: '2023-10-16',
    httpClient: Stripe.createFetchHttpClient(),
  });
}

/**
 * Returns a memoised Stripe client for TENANT money (invoice checkout, Connect onboarding,
 * the bank feed). Null when STRIPE_SECRET_KEY resolves from neither env nor platform_secrets.
 * Caller MUST handle the null case with a clean 503 — `noPaymentProviderResponse` is the
 * canonical helper.
 */
export async function getStripe(): Promise<Stripe | null> {
  const key = await stripeSecretKey();
  if (!key) return null;
  if (_stripe?.key !== key) _stripe = { key, client: build(key) };
  return _stripe.client;
}

/**
 * Stripe client for PLATFORM revenue (subscriptions, credits, API) — #200. Prefers the
 * dedicated STRIPE_BILLING_SECRET_KEY; falls back to the default STRIPE_SECRET_KEY so existing
 * deploys keep collecting platform revenue on the default account until the operator sets up a
 * separate billing entity. Null only when neither key resolves.
 */
export async function getPlatformBillingStripe(): Promise<Stripe | null> {
  const key = (await platformBillingSecretKey()) || (await stripeSecretKey());
  if (!key) return null;
  if (_billingStripe?.key !== key) _billingStripe = { key, client: build(key) };
  return _billingStripe.client;
}

/**
 * Drop the memoised clients. Useful in tests or after a secret rotation when
 * the same worker needs to pick up new values without restarting.
 */
export function resetStripeClients(): void {
  _stripe = null;
  _billingStripe = null;
  _supabase = null;
}

// ──────────────────────────────────────────────────────────────────────────
// Canonical "no payment provider configured" response
// ──────────────────────────────────────────────────────────────────────────

const NO_PROVIDER_BODY = {
  error:
    'Payment processing is not configured. Ask an admin to enable a payment provider at ' +
    '/admin/modules → Payments → Providers and set the STRIPE_SECRET_KEY on ' +
    '/admin/modules/payments-stripe/settings → Keys.',
  code: 'no_payment_provider_configured',
} as const;

/**
 * 503 response with a consistent admin-actionable message + machine-readable
 * `code`. Every Stripe-touching endpoint that fails the configured-provider
 * check should return this so the frontend can branch on the code uniformly.
 *
 * Extra headers can be merged in for callers that need CORS, etc.
 */
export function noPaymentProviderResponse(extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(NO_PROVIDER_BODY), {
    status: 503,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}
