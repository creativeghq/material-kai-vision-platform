/**
 * A deal's forecast can be measured against what it actually billed (#378 C3).
 *
 * `quotes`, `orders` and `invoices` all carry `deal_id`, and every chain function that creates one
 * from another dropped it — measured: 0 mentions across all eight, against 2 each for
 * `project_id`, which had exactly this defect in exactly these functions and was fixed under class
 * A of the same issue. So a won deal's paper trail stopped at the quote, and `get_deal_forecast`
 * weighted a number somebody TYPED into `crm_deals.value` with nothing to compare it to.
 *
 * The fix is SQL — the chain carries `deal_id`, the probe that guards `project_id` was generalised
 * to both columns, and `get_deal_forecast` returns the actuals beside the forecast so accuracy is
 * one call and one scope rather than a subtraction someone does in TypeScript.
 *
 * SQL in this project is applied through the MCP and never committed, so this file guards the
 * TypeScript half only, and a green run here does NOT prove the chain carries the column. That is
 * verified by a rolled-back probe: quote(deal) → order → pre-invoice, asserting the deal id on
 * both, plus a probe that watches the integrity detector FIRE on a function that names
 * `project_id` and not `deal_id` — the exact case the project-only version was blind to.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const src = (p: string) => stripComments(read(p));

const DEALS = 'src/services/dealsService.ts';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.tsx?$/.test(entry)) out.push(rel);
  }
  return out;
}

describe('#378 C3 — the actuals come from SQL, formatted here', () => {
  it('the forecast row carries the actuals', () => {
    // If a later edit drops these from the interface the callers stop compiling, which is the
    // point: the alternative is a component quietly reading `undefined` and rendering "€0".
    const deals = src(DEALS);
    const row = deals.slice(deals.indexOf('export interface DealForecastRow'));
    const body = row.slice(0, row.indexOf('}'));
    expect(body).toMatch(/invoiced_net: number;/);
    expect(body).toMatch(/won_invoiced_net: number;/);
    expect(body).toMatch(/deals_with_invoices: number;/);
  });

  it('nothing re-derives a deal total from invoices in TypeScript', () => {
    /**
     * The rule CLAUDE.md states for every money quantity, applied to this one. A per-deal sum of
     * invoices written here would be a second derivation that agrees today: it would miss the
     * void filter, or sum `total` where the deal's own value is net, and the answer would be a
     * plausible number nobody can trace.
     *
     * The scan looks for the two shapes that would do it — an aggregate over invoices keyed by
     * deal, and a reduce over a deal's invoices.
     */
    const offenders: string[] = [];
    for (const file of [...walk('src/services'), ...walk('src/modules/crm'), ...walk('src/components/business/crm')]) {
      const text = stripComments(read(file));
      if (!/deal/i.test(text)) continue;
      if (/from\('invoices'\)[\s\S]{0,400}?\.eq\('deal_id'/.test(text)
        && /reduce\(|\+=/.test(text)) {
        offenders.push(relative('.', file).replace(/\\/g, '/'));
      }
    }
    expect(offenders,
      'These read a deal\'s invoices and add them up. `get_deal_forecast` returns the answer '
      + `derived, with the void filter and the net/gross decision already made:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('forecast accuracy is not computed here either', () => {
    // `won_invoiced_net` and `won_value` are the pair; the ratio between them is a judgement about
    // what "accuracy" means, and it belongs in one place. Today nothing computes it — this fails
    // when the first component starts to, so the decision gets made deliberately.
    const offenders: string[] = [];
    for (const file of [...walk('src/services'), ...walk('src/modules/crm'), ...walk('src/components/business/crm')]) {
      const text = stripComments(read(file));
      if (/won_invoiced_net\s*[/*-]\s*|won_value\s*[/*-]\s*won_invoiced_net/.test(text)) {
        offenders.push(relative('.', file).replace(/\\/g, '/'));
      }
    }
    expect(offenders,
      'Accuracy is a derived money ratio. Derive it in SQL beside the two figures it compares, '
      + `not in a component:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('the service says which figure is net, and why', () => {
    // The pairing hazard is the whole reason the column is named `_net`: `crm_deals.value` is a
    // pipeline figure and `invoices.total` is gross, so summing the wrong one makes every reading
    // 24% high at the Greek standard rate — right order of magnitude, right direction, flattering.
    expect(read(DEALS)).toMatch(/NET on purpose/);
  });
});
