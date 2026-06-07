/**
 * Shared lazy Stripe + Supabase client factories for every edge function that
 * touches Stripe (stripe-webhooks, stripe-api handlers, finance-pay-invoice,
 * future processors that share the same secret naming).
 *
 * Why this exists:
 *   Stripe credentials may live in either Deno.env (real deploy secret) OR the
 *   platform_secrets DB table (admin-saved at /admin/modules/payments-stripe/
 *   settings → Keys). The bootstrap pass in `_shared/secrets-bootstrap.ts`
 *   pre-populates Deno.env at handler start, BUT only if the function actually
 *   defers env reads until after bootstrap runs. Module-load `const x =
 *   Deno.env.get(...)` captures whatever env contains at parse time (often
 *   nothing on DB-fallback deploys), which defeats the whole pattern.
 *
 *   This module provides lazy getters + a memoised client factory. Every
 *   Stripe-touching function uses `getStripe()` / `getSupabase()` inside the
 *   request handler — after `bootstrapForFunction()` has populated env.
 *
 * Pattern at call site:
 *
 *   import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
 *   import { getStripe, getSupabase, noPaymentProviderResponse } from '../_shared/stripe-clients.ts';
 *
 *   Deno.serve(async (req) => {
 *     await bootstrapForFunction();
 *     const stripe = getStripe();
 *     const supabase = getSupabase();
 *     if (!stripe || !supabase) return noPaymentProviderResponse();
 *     // … use stripe / supabase normally
 *   });
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Stripe from 'https://esm.sh/stripe@14.10.0';

// ──────────────────────────────────────────────────────────────────────────
// Lazy env getters — never capture at module load
// ──────────────────────────────────────────────────────────────────────────

export const stripeSecretKey = () => Deno.env.get('STRIPE_SECRET_KEY') || '';
export const stripeWebhookSecret = () => Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';
export const supabaseUrlEnv = () => Deno.env.get('SUPABASE_URL') || '';
export const supabaseServiceKeyEnv = () => Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// #200 — platform-billing (operator SaaS revenue: subscriptions / credits / API) is collected
// on a DEDICATED Stripe account, separate from the default key (tenant invoice payments) and
// from per-tenant Connect (#182). These are optional — everything falls back to the default
// key until the operator configures a separate billing account, so existing deploys are
// unaffected.
export const platformBillingSecretKey = () => Deno.env.get('STRIPE_BILLING_SECRET_KEY') || '';
export const platformBillingWebhookSecret = () => Deno.env.get('STRIPE_BILLING_WEBHOOK_SECRET') || '';

/** True when a DISTINCT platform-billing Stripe account is configured (key set AND different
 *  from the default). Drives whether platform charges use a separate customer id + account. */
export function hasDistinctBillingAccount(): boolean {
  const b = platformBillingSecretKey();
  return !!b && b !== stripeSecretKey();
}

// ──────────────────────────────────────────────────────────────────────────
// Memoised client factories
// ──────────────────────────────────────────────────────────────────────────

let _stripe: Stripe | null = null;
let _billingStripe: Stripe | null = null;
let _supabase: SupabaseClient | null = null;

/**
 * Returns a memoised Stripe client. Null when STRIPE_SECRET_KEY can't be
 * resolved from either env or platform_secrets (after bootstrap). Caller
 * MUST handle the null case with a clean 503 response — `noPaymentProviderResponse`
 * is the canonical helper.
 */
export function getStripe(): Stripe | null {
  if (_stripe) return _stripe;
  const key = stripeSecretKey();
  if (!key) return null;
  _stripe = new Stripe(key, {
    apiVersion: '2023-10-16',
    httpClient: Stripe.createFetchHttpClient(),
  });
  return _stripe;
}

/**
 * Stripe client for PLATFORM revenue (subscriptions, credits, API) — #200. Prefers the
 * dedicated STRIPE_BILLING_SECRET_KEY; falls back to the default STRIPE_SECRET_KEY so existing
 * deploys keep collecting platform revenue on the default account until the operator sets up a
 * separate billing entity. Null only when neither key resolves.
 */
export function getPlatformBillingStripe(): Stripe | null {
  if (_billingStripe) return _billingStripe;
  const key = platformBillingSecretKey() || stripeSecretKey();
  if (!key) return null;
  _billingStripe = new Stripe(key, {
    apiVersion: '2023-10-16',
    httpClient: Stripe.createFetchHttpClient(),
  });
  return _billingStripe;
}

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

/**
 * Drop the memoised clients. Useful in tests or after a secret rotation when
 * the same worker needs to pick up a new key without restarting.
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
