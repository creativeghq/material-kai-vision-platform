/**
 * The registry decides whether a model can run, and it must be asked BEFORE the credit debit.
 *
 * MIVAA's interior roster consults `generation_models`, so a down model never enters the grid.
 * The edge functions did not, and the two Replicate models reachable ONLY from the edge —
 * `flux-depth-pro` (redesign / copy-style) and `runway-gen4-turbo` (video) — therefore went
 * debit → call → fail → refund on every attempt. Measured 2026-08-22: a `mode:'redesign'` call
 * debited 20 credits, got `500 REPLICATE_API_TOKEN not set` (the token is on the MIVAA droplet,
 * NOT in the edge environment), and refunded 20. The ledger nets to zero, so billing looks
 * perfect and the user just waits for a generic failure.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  checkGenerationModelHealth,
  unavailableMessage,
} from '../../supabase/functions/_shared/generation-health.ts';
import { PRICING_KEY_BY_LABEL } from '../../supabase/functions/_shared/generation-routing.ts';

/** Minimal stand-in for the postgrest builder chain the helper uses. */
function fakeDb(row: unknown, error: unknown = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: row, error }),
        }),
      }),
    }),
  } as never;
}

describe('generation health gate', () => {
  it('lets an active + enabled model through', async () => {
    const h = await checkGenerationModelHealth(
      fakeDb({ id: 'gemini-3-pro-image', enabled: true, status: 'active' }),
      'gemini-3-pro-image',
    );
    expect(h.runnable).toBe(true);
  });

  it('blocks a degraded model and surfaces the operator reason verbatim', async () => {
    const reason = 'Replicate account has insufficient credit — 402 with a valid token.';
    const h = await checkGenerationModelHealth(
      fakeDb({
        id: 'flux-depth-pro',
        enabled: true,
        status: 'degraded',
        last_probe_error: reason,
      }),
      'flux-depth-pro',
    );
    expect(h.runnable).toBe(false);
    expect(h.reason).toBe(reason);
  });

  it('blocks a disabled model even when its status still reads active', async () => {
    const h = await checkGenerationModelHealth(
      fakeDb({ id: 'sd3', enabled: false, status: 'active' }),
      'sd3',
    );
    expect(h.runnable).toBe(false);
  });

  it('FAILS OPEN on an unreadable registry, an unknown id, and an empty id', async () => {
    // The gate turns a known-down model into a clear message. It must never become a new
    // single point of failure that stops generation when the registry cannot be read.
    expect((await checkGenerationModelHealth(fakeDb(null, { message: 'boom' }), 'x')).runnable).toBe(true);
    expect((await checkGenerationModelHealth(fakeDb(null), 'not-in-registry')).runnable).toBe(true);
    expect((await checkGenerationModelHealth(fakeDb(null), '')).runnable).toBe(true);
  });

  it('tells the user plainly that nothing was charged', async () => {
    // The failure this replaces DID debit and refund, so "your credits are fine" is the first
    // thing anyone wants to know.
    const msg = unavailableMessage('flux-depth-pro', 'Set the edge secret AND fund the account.');
    expect(msg).toContain('flux-depth-pro');
    expect(msg).toContain('no credits were charged');
    expect(msg).toContain('Set the edge secret');
  });

  it('is asked BEFORE the debit in generate-interior-gemini, not after', () => {
    // Order is the whole point: after the debit it is just a nicer error message on money that
    // has already moved.
    const src = readFileSync(
      join(process.cwd(), 'supabase/functions/generate-interior-gemini/index.ts'),
      'utf8',
    );
    const gate = src.indexOf('checkGenerationModelHealth(');
    const debit = src.indexOf('await deductCredits(');
    expect(gate, 'generate-interior-gemini must call checkGenerationModelHealth').toBeGreaterThan(-1);
    expect(debit, 'expected a deductCredits call to order against').toBeGreaterThan(-1);
    expect(gate, 'the health gate must run BEFORE deductCredits').toBeLessThan(debit);
  });

  it('looks the model up by REGISTRY id, not by the response label', () => {
    // `grok-aurora` is the label in the response payload; `xai-aurora` is the registry row.
    // Querying by the label would silently find nothing and fail open forever.
    expect(PRICING_KEY_BY_LABEL['grok-aurora']).toBe('xai-aurora');
    const src = readFileSync(
      join(process.cwd(), 'supabase/functions/generate-interior-gemini/index.ts'),
      'utf8',
    );
    expect(src).toContain('PRICING_KEY_BY_LABEL[modelLabel] ?? modelLabel');
  });
});
