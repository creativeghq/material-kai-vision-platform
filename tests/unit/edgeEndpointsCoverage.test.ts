/** Edge endpoint ↔ OpenAPI parity guard. */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SPEC = join(ROOT, 'scripts/edge-endpoints.json');
const FUNCTIONS_DIR = join(ROOT, 'supabase/functions');

// Real, deployed edge functions with no entry in edge-endpoints.json. SHRINK by
// documenting each; never grow. A new undocumented function should fail instead.
// Emptied: contracts-api and stock-api both gained spec entries, and the
// "stays honest" assertion correctly failed until they were pruned. Keep at zero.
const KNOWN_UNDOCUMENTED = new Set<string>([]);

interface EndpointEntry { name: string }

const entries = (): EndpointEntry[] => JSON.parse(readFileSync(SPEC, 'utf8'));

/** Real function dirs. `_shared` (and any _prefixed dir) is library code, not an endpoint. */
const functionDirs = (): string[] =>
  readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('.'))
    .filter((d) => existsSync(join(FUNCTIONS_DIR, d.name, 'index.ts')))
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
