/** Money-derivation guard for the configurator (#321 M2, #260 Phase 1). */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { stripComments as sharedStripComments, blankComments as sharedBlankComments } from '../helpers/stripComments';

const ROOT = process.cwd();

/** Everything that is allowed to know a configuration has a price. */
const CONFIGURATOR_PATHS = [
  'src/services/productConfiguratorService.ts',
  'src/components/features/configurator',
  'src/embed',
];

function walk(target: string, out: string[] = []): string[] {
  const abs = join(ROOT, target);
  if (!existsSync(abs)) return out;
  if (statSync(abs).isFile()) { out.push(abs); return out; }
  for (const e of readdirSync(abs)) {
    const p = join(abs, e);
    if (statSync(p).isDirectory()) walk(relative(ROOT, p), out);
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

/** Strip comments so prose describing the rule doesn't trip the scanner. */
function stripComments(src: string): string {
  return sharedStripComments(src);
}

const FILES = CONFIGURATOR_PATHS.flatMap((p) => walk(p))
  .map((path) => ({ path, src: stripComments(readFileSync(path, 'utf8')) }));

const rel = (p: string) => relative(ROOT, p).replace(/\\/g, '/');

describe('configured price has exactly one derivation', () => {
  it('finds the configurator sources (guards against a vacuous pass)', () => {
    expect(FILES.length, 'scanned no files — did the paths move?').toBeGreaterThan(0);
    expect(
      FILES.some((f) => f.path.endsWith('productConfiguratorService.ts')),
      'the service itself was not scanned',
    ).toBe(true);
  });

  /**
   * Showing ONE option's delta ("Velvet +€40") is formatting an authored value and is fine.
   * ADDING deltas together is deriving the total, and that belongs in SQL.
   */
  it('never sums price_delta in TypeScript', () => {
    const offenders: string[] = [];
    for (const { path, src } of FILES) {
      for (const [i, line] of src.split('\n').entries()) {
        if (!line.includes('price_delta')) continue;
        if (/\breduce\b|\+=|\+\s*\w*price_delta|price_delta\s*\+|\bsum\b/i.test(line)) {
          offenders.push(`${rel(path)}:${i + 1}`);
        }
      }
    }
    expect(
      offenders,
      'call get_configured_product_price (via productConfiguratorService.priceConfiguration) '
      + 'instead of summing price_delta — the total is derived in SQL',
    ).toEqual([]);
  });

  it('never computes configured_price by arithmetic', () => {
    const offenders: string[] = [];
    for (const { path, src } of FILES) {
      for (const [i, line] of src.split('\n').entries()) {
        if (!/configured_price|configuredPrice/.test(line)) continue;
        // Assignment from an expression containing + or - over another value.
        if (/(configured_price|configuredPrice)\s*[:=]\s*[^;,\n]*[+\-][^;,\n]*/.test(line)
          && !/\?\?|\|\||toFixed|format/.test(line)) {
          offenders.push(`${rel(path)}:${i + 1}`);
        }
      }
    }
    expect(
      offenders,
      'configured_price comes from the SQL derivation already computed — do not rebuild it',
    ).toEqual([]);
  });

  it('the service reaches the derivation by RPC, not by rebuilding it', () => {
    const service = FILES.find((f) => f.path.endsWith('productConfiguratorService.ts'));
    expect(service, 'service file missing').toBeTruthy();
    expect(
      service!.src.includes('get_configured_product_price'),
      'productConfiguratorService must call the SQL derivation',
    ).toBe(true);
  });
});
