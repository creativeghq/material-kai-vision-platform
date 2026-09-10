/**
 * Stripe secret-resolution guard — the same defect the Zernio surface had, one provider over.
 * See [zernioSecretResolution.test.ts](./zernioSecretResolution.test.ts) for the twin.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { stripComments as sharedStripComments } from '../helpers/stripComments';

const FUNCTIONS_DIR = join(__dirname, '..', '..', 'supabase', 'functions');

/** The one file allowed to name these env vars and construct a Stripe client — it IS the factory. */
const CANONICAL = join('_shared', 'stripe-clients.ts');

const SECRET_KEYS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_BILLING_SECRET_KEY',
  'STRIPE_BILLING_WEBHOOK_SECRET',
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    // `deno check` vendors an npm cache into supabase/functions/<fn>/node_modules (gitignored).
    // Recursing in scans tens of thousands of dependency files — including other packages' own
    // *.test.ts fixtures — and readFileSync races the cache, so the walk ENOENTs on a file that
    // existed a moment earlier. Nothing under here is ours.
    if (entry === 'node_modules' || entry === '.deno') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

// Read the tree ONCE — comments stripped so prose and 503 copy never trip the scan.
const SOURCES = walk(FUNCTIONS_DIR).map((file) => ({
  rel: relative(FUNCTIONS_DIR, file).split(sep).join('/'),
  isCanonical: relative(FUNCTIONS_DIR, file) === CANONICAL,
  code: sharedStripComments(readFileSync(file, 'utf-8')),
}));

describe('Stripe secrets resolve through _shared/stripe-clients.ts, not Deno.env', () => {
  it('no function outside the canonical factory reads a Stripe env var', () => {
    const offenders: string[] = [];

    for (const { rel, isCanonical, code } of SOURCES) {
      if (isCanonical) continue;
      for (const key of SECRET_KEYS) {
        // Only an actual env read is a violation — naming the key in an error string is fine,
        // and is how the 503 tells an admin what to set.
        const re = new RegExp(`Deno\\.env\\.get\\(\\s*['"\`]${key}['"\`]`);
        if (re.test(code)) offenders.push(`${rel} reads ${key} from Deno.env`);
      }
    }

    expect(
      offenders,
      'Import { getStripe, getPlatformBillingStripe } from _shared/stripe-clients.ts instead — ' +
        'a local Deno.env read cannot see a platform_secrets value on the edge runtime.',
    ).toEqual([]);
  });

  it('nothing else constructs a Stripe client', () => {
    // crm-api/handlers/stripe-api-handler.ts carried `new Stripe(stripeSecretKey(), {...})` at
    // MODULE LOAD with its own copy of the getter. A second factory doesn't just miss the DB
    // fallback — it also misses every future fix to the first one.
    const offenders = SOURCES
      .filter((f) => !f.isCanonical && /new\s+Stripe\s*\(/.test(f.code))
      .map((f) => f.rel);

    expect(
      offenders,
      'Call getStripe() / getPlatformBillingStripe() — do not construct Stripe directly.',
    ).toEqual([]);
  });

  it('the canonical factory goes through resolveSecret and keeps env first', () => {
    const src = readFileSync(join(FUNCTIONS_DIR, CANONICAL), 'utf-8');

    expect(src).toMatch(/import \{ resolveSecret \} from '\.\/secrets\.ts'/);

    // Every Stripe key goes through the resolver, which is itself env-first.
    for (const key of SECRET_KEYS) {
      expect(src, `${key} must be resolved via resolveSecret`).toContain(`secret('${key}')`);
    }

    // The Supabase client stays env-only ON PURPOSE: resolveSecret needs it to reach
    // platform_secrets, so routing it through resolveSecret would be circular.
    expect(src).toContain("Deno.env.get('SUPABASE_URL')");
    expect(src).toContain("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')");
  });

  it('the client getters are async, and every caller awaits them', () => {
    // Resolving may hit the DB, so these had to stop being sync. A caller that forgets the
    // await gets a truthy Promise, sails past its own `if (!stripe)` guard, and dies later on
    // `stripe.checkout` — a 500 where the honest answer was a 503 naming the missing key.
    const canonical = SOURCES.find((f) => f.isCanonical)!;
    expect(canonical.code).toMatch(/export async function getStripe\(\): Promise<Stripe \| null>/);
    expect(canonical.code).toMatch(/export async function getPlatformBillingStripe\(\): Promise<Stripe \| null>/);

    const ASYNC_GETTERS = [
      'getStripe', 'getPlatformBillingStripe', 'hasDistinctBillingAccount',
      'stripeSecretKey', 'stripeWebhookSecret',
      'platformBillingSecretKey', 'platformBillingWebhookSecret',
    ];
    const offenders: string[] = [];

    for (const { rel, isCanonical, code } of SOURCES) {
      if (isCanonical) continue;
      for (const fn of ASYNC_GETTERS) {
        // The call site itself, so `await` stays OUTSIDE the match and is visible in `before`.
        // Matching an optional `(\w+\s+)?` prefix instead swallows the very `await` this is
        // looking for, and then reports every correctly-awaited call as an offender.
        const call = new RegExp(`\\b${fn}\\s*\\(\\s*\\)`, 'g');
        for (const m of code.matchAll(call)) {
          // `await x()`, `(await x())`, `!(await x())` and `(await x()) ?? y` all end the same way.
          const before = code.slice(Math.max(0, m.index! - 10), m.index!);
          if (!/await\s+$/.test(before)) {
            offenders.push(`${rel}: ${fn}() is not awaited`);
          }
        }
      }
    }

    expect(offenders, 'These getters resolve asynchronously — await them.').toEqual([]);
  });
});
