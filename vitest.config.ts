import { defineConfig } from 'vitest/config';
import path from 'path';

// Test runner for the repo's two non-e2e test tiers (e2e stays on Playwright):
//   • tests/unit/**        — hermetic, pure-function tests. No network, no secrets. `npm test`.
//   • tests/integration/** — run against the LIVE deployed system with a service-role key,
//                            same philosophy as scripts/smoke. `npm run test:integration`.
//                            They self-SKIP when SUPABASE_SERVICE_ROLE_KEY is absent so a
//                            local `npm test` never drags them in.
//
// Kept separate from vite.config.ts on purpose: the app build config (manualChunks, spark
// dedupe, define-injected env) is irrelevant to — and would only slow — the test runner.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'node',
    // tests/security/** was missing until 2026-07-17, so the #183 inbound-credential
    // isolation guard sat uncollected — and unrun — since 2026-06-07. It is hermetic
    // (source-level greps, no network), so it belongs with the unit tier.
    // If you add a new tests/<tier>/ directory, add it here or it silently never runs.
    include: [
      'tests/unit/**/*.test.ts',
      'tests/security/**/*.test.ts',
      'tests/integration/**/*.test.ts',
    ],
    // Integration tests hit prod; give them room. Unit tests finish in ms regardless.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Retry transport flakes. The integration tier makes ~68 real network calls to live
    // endpoints, so a single ECONNRESET is a matter of when, not if — and because the deploy
    // job gates on this suite, one blip blocks EVERY deploy. That happened on 2026-07-28:
    // `hr-careers-public` died on `read ECONNRESET` with 67 of 68 passing, and it held back an
    // email-guard fix for half an hour while the bug it fixed kept firing.
    //
    // This does not paper over real failures: a genuine bug fails all three attempts. Hermetic
    // unit tests are deterministic, so a retry never changes their verdict — only the wall-clock
    // of an already-failing run, by milliseconds. If a test only passes on retry, that is a
    // signal worth chasing, not a green light.
    retry: 2,
  },
});
