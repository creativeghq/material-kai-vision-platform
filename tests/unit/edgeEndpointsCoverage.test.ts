/**
 * Edge endpoint ↔ OpenAPI parity guard.
 *
 * `scripts/edge-endpoints.json` is the hand-maintained source of truth that
 * `scripts/build-openapi-edge.mjs` compiles into the PUBLIC spec at
 * public/api/openapi-edge.json. Nothing tied it to the functions that actually
 * exist, so deleting an edge function left its entry behind and the published
 * spec kept advertising a dead endpoint.
 *
 * That is exactly what happened: 51ff18b6 (web-scrape path) and 75e9e843 (3 dead
 * functions) removed 11 functions between them; all 11 stayed in the spec until
 * this guard was added. Two live functions were also missing from it.
 *
 * Invariants:
 *   1. Every spec entry maps to a real supabase/functions/<name> dir — a phantom
 *      endpoint in a public API spec is worse than an undocumented one.
 *   2. Every real function is in the spec, OR on the KNOWN_UNDOCUMENTED debt
 *      list — so a NEW function without docs fails CI.
 *   3. The debt list may only shrink.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SPEC = join(ROOT, 'scripts/edge-endpoints.json');
const FUNCTIONS_DIR = join(ROOT, 'supabase/functions');

// Real, deployed edge functions with no entry in edge-endpoints.json. SHRINK by
// documenting each; never grow. A new undocumented function should fail instead.
// Emptied 2026-07-21: contracts-api and stock-api both gained spec entries in d5045782, and the
// "stays honest" assertion correctly failed until they were pruned. Keep at zero.
// Emptied again 2026-07-29: the Real Estate surfaces (api/public/feed + the buyer-digest and
// rent-invoicing crons), the consolidated monitoring-cron, the moodboard dormancy pair and
// crm-lead-score all gained spec entries. Keep at zero — a cron being internal is a reason to
// document its auth and payload, not a reason to hide it from the spec.
const KNOWN_UNDOCUMENTED = new Set<string>([]);

interface EndpointEntry { name: string }

const entries = (): EndpointEntry[] => JSON.parse(readFileSync(SPEC, 'utf8'));

/** Real function dirs. `_shared` (and any _prefixed dir) is library code, not an endpoint. */
const functionDirs = (): string[] =>
  readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
    .map((d) => d.name);

describe('edge endpoint ↔ OpenAPI parity', () => {
  const spec = entries();
  const dirs = functionDirs();

  it('parses both sides (guards against an empty read)', () => {
    expect(spec.length, 'edge-endpoints.json parsed empty').toBeGreaterThan(50);
    expect(dirs.length, 'no function dirs found').toBeGreaterThan(50);
  });

  it('every documented endpoint has a real function dir (no phantom endpoints)', () => {
    const real = new Set(dirs);
    const ghosts = spec.map((e) => e.name).filter((n) => !real.has(n)).sort();
    expect(
      ghosts,
      `edge-endpoints.json documents function(s) that do not exist: ${ghosts.join(', ')}. ` +
        `The public OpenAPI spec is built from this file — remove the entry when you ` +
        `delete a function.`,
    ).toEqual([]);
  });

  it('every real function is documented, or tracked debt (no NEW undocumented)', () => {
    const documented = new Set(spec.map((e) => e.name));
    const missing = dirs
      .filter((d) => !documented.has(d) && !KNOWN_UNDOCUMENTED.has(d))
      .sort();
    expect(
      missing,
      `Edge function(s) with no entry in scripts/edge-endpoints.json: ${missing.join(', ')}. ` +
        `Add an entry (name/tag/summary/methods/request/response) so it reaches the ` +
        `public spec, or add it to KNOWN_UNDOCUMENTED with a reason.`,
    ).toEqual([]);
  });

  it('KNOWN_UNDOCUMENTED stays honest — prune once documented or removed', () => {
    const documented = new Set(spec.map((e) => e.name));
    const real = new Set(dirs);
    const stale = [...KNOWN_UNDOCUMENTED]
      .filter((n) => documented.has(n) || !real.has(n))
      .sort();
    expect(stale, `Prune from KNOWN_UNDOCUMENTED (now documented or deleted): ${stale.join(', ')}`).toEqual([]);
  });

  it('endpoint names are unique', () => {
    const seen = new Set<string>();
    const dupes = spec.map((e) => e.name).filter((n) => (seen.has(n) ? true : (seen.add(n), false)));
    expect(dupes, `Duplicate entries in edge-endpoints.json: ${dupes.join(', ')}`).toEqual([]);
  });
});
