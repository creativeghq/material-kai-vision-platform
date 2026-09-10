/** #320 — stock leaves the warehouse only against a fiscal document. */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { stripComments as sharedStripComments, blankComments as sharedBlankComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const SCAN_DIRS = ['src', 'supabase/functions', 'api'];

/**
 * The generated Supabase types are a machine projection of the schema: they DECLARE every RPC's
 * signature, including the service-role-only ones, without calling anything. Scanning them finds
 * `_deliver_order_line_core` as a type key the moment the types are regenerated, which is noise —
 * a real call site can only ever appear in hand-written code, which is still fully in scope.
 */
const GENERATED = new Set(['src/integrations/supabase/types.ts'].map((p) => join(ROOT, p.replace(/\//g, sep))));

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e === 'node_modules' || e === 'dist') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|js)$/.test(e) && !GENERATED.has(p)) out.push(p);
  }
  return out;
}

/** Strip comments so prose describing the rule doesn't trip the scanner. */
function stripComments(src: string): string {
  return sharedStripComments(src);
}

const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));

describe('#320 stock moves only from a fiscal document context', () => {
  it('finds sources to scan', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  /**
   * The core is service-role only and deliberately unreachable from a browser session. A client
   * calling it by name is someone who hit the 403 and is on their way to granting EXECUTE to
   * `authenticated` — which would reopen the gate for every tenant at once.
   *
   * Edge functions are in scope too: they hold the service-role key, so for them the call would
   * SUCCEED. An edge function moving stock is only correct if it is itself a document context,
   * and the two that are do it in SQL, not over the wire.
   */
  it('nothing outside the database calls _deliver_order_line_core', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = stripComments(readFileSync(f, 'utf8'));
      for (const [i, line] of src.split('\n').entries()) {
        if (line.includes('_deliver_order_line_core')) {
          offenders.push(`${relative(ROOT, f)}:${i + 1}: ${line.trim().slice(0, 120)}`);
        }
      }
    }
    expect(
      offenders,
      'The stock-moving core is service-role internal. Dispatch goods by issuing the document — ' +
      '`issue_delivery_note` (Δελτίο Αποστολής) or `mark_invoice_issued` on the order\'s invoice — ' +
      'which moves the stock as a side effect of the fiscal act. Never call the core directly.\n' +
      offenders.join('\n'),
    ).toEqual([]);
  });

  /**
   * The issue named this specifically: "The order UI even advertises it". A promise in the UI is
   * how the behaviour got depended on, so the promise has to go with the behaviour. This is a
   * copy assertion and therefore brittle by nature — but it is brittle in the safe direction:
   * it fails when someone reinstates the claim, which is exactly the moment worth interrupting.
   */
  it('the order window never claims that marking a line delivered moves stock', () => {
    const offenders: string[] = [];
    // "delivered ... moves ... stock" on one line, in either order, ignoring markup between.
    const RE = /(delivered[^\n]{0,80}moves?[^\n]{0,40}(warehouse )?stock)|((warehouse )?stock[^\n]{0,60}when[^\n]{0,30}delivered)/i;
    for (const f of files.filter((p) => /finance|warehouse|orders/i.test(p))) {
      const src = readFileSync(f, 'utf8'); // copy lives in JSX, not comments — do NOT strip
      for (const [i, line] of src.split('\n').entries()) {
        // The negated form is the CORRECT copy ("does not move warehouse stock") — leave it be.
        if (RE.test(line) && !/not\s+move|no\s+stock|never\s+moves?/i.test(line)) {
          offenders.push(`${relative(ROOT, f)}:${i + 1}: ${line.trim().slice(0, 140)}`);
        }
      }
    }
    expect(
      offenders,
      'Since #320 the delivered quantity is a picking marker: it drives order fulfilment status ' +
      'and moves no stock. Telling an operator otherwise makes them read a correct warehouse ' +
      'count as a broken one.\n' + offenders.join('\n'),
    ).toEqual([]);
  });
});
