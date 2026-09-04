/**
 * Bid analysis — why the cheapest number on the screen is regularly not the cheapest offer.
 *
 * The failure this exists to prevent has one shape and it is expensive: a bid wins because of what
 * it LEFT OUT. Nothing about it looks wrong — the total is a real total of the lines the bidder
 * chose to price, the comparison table is correct, and the omission arrives months later as a
 * variation at a rate nobody competed on.
 *
 * The numbers live in SQL (`get_tender_bid_analysis` / `get_tender_bid_summary`), so what is
 * testable here is the layer that turns the derivation into questions — and the rule that layer
 * has to keep: every question names a line the analysis flagged, and there is no path to one
 * without a finding. A generated "have you allowed for scaffolding?" that no figure supports is
 * worse than silence: it teaches the reader the list is padding, and the two that matter get
 * skimmed with the rest.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripComments } from '../helpers/stripComments';
import {
  bidClarifications, clarificationsAsText, type BidAnalysisLine,
} from '@/modules/projects/lib/bidClarifications';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

const SERVICE = stripComments(read('src/modules/projects/services/tendersService.ts'));
const WORKSPACE = stripComments(read('src/modules/projects/components/TenderPackageWorkspace.tsx'));
const TOOL = stripComments(read('supabase/functions/_shared/tools/construction-tools.ts'));

const line = (over: Partial<BidAnalysisLine> = {}): BidAnalysisLine => ({
  package_item_id: 'i1',
  item_ref: '1.2',
  description: 'Disposal off site',
  unit: 'm3',
  quantity: 100,
  bid_id: 'bid-a',
  company_name: 'Alpha',
  amount: 1800,
  median_amount: 1850,
  variance_pct: -2.7,
  bidders_priced: 3,
  flag: 'ok',
  ...over,
});

describe('every question names a finding', () => {
  it('says nothing at all when nothing was flagged', () => {
    // The whole value of the list is that its presence means something. A package where three
    // bidders priced everything within a normal band has no questions, and inventing some would
    // train the reader to ignore the real ones.
    expect(bidClarifications([line(), line({ bid_id: 'bid-b' })])).toEqual([]);
  });

  it('raises exactly one question per flagged line, and none for the rest', () => {
    const out = bidClarifications([
      line({ flag: 'unpriced', amount: null, variance_pct: null }),
      line({ package_item_id: 'i2', item_ref: '1.1', description: 'Excavate', flag: 'ok' }),
      line({ package_item_id: 'i3', item_ref: '1.3', description: 'Blinding', flag: 'low_outlier', amount: 400, median_amount: 640, variance_pct: -37.5 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].items).toHaveLength(2);
    for (const q of out[0].items) {
      // The line is IN the question, not a footnote to it: a clarification a subcontractor cannot
      // trace to an item is one they answer with "which one?".
      expect(q.itemRef).toBeTruthy();
      expect(q.question).toContain(q.itemRef!);
    }
  });

  it('groups by bidder, because the questions are sent one email at a time', () => {
    const out = bidClarifications([
      line({ bid_id: 'a', company_name: 'Alpha', flag: 'unpriced', amount: null }),
      line({ bid_id: 'b', company_name: 'Beta', flag: 'low_outlier', amount: 400, median_amount: 900, variance_pct: -55 }),
    ]);
    expect(out.map((c) => c.companyName).sort()).toEqual(['Alpha', 'Beta']);
    expect(out.every((c) => c.items.length === 1)).toBe(true);
  });
});

describe('what each flag actually asks', () => {
  it('an unpriced line is asked about as a gap, never as an accusation', () => {
    const [c] = bidClarifications([line({ flag: 'unpriced', amount: null, variance_pct: null })]);
    const q = c.items[0].question;
    // The commonest true answer is "it is covered in our rate for 1.1", and that answer is the
    // useful one — but it has to be ASKED, because "included elsewhere" and "we missed it"
    // produce very different subcontracts.
    expect(q).toContain('covered elsewhere');
    expect(q).toContain('no price from you');
  });

  it('an unpriced line carries what the others charge, so the question has a number in it', () => {
    const [c] = bidClarifications([line({ flag: 'unpriced', amount: null, median_amount: 1850 })], 'EUR');
    expect(c.items[0].question).toMatch(/€1,850/);
  });

  it('says so when NOBODY priced the line, rather than quoting a median that does not exist', () => {
    const [c] = bidClarifications([line({ flag: 'unpriced', amount: null, median_amount: null })]);
    expect(c.items[0].question).toContain('Nobody has priced it');
    expect(c.items[0].question).not.toMatch(/€/);
  });

  it('a low outlier is asked to confirm SCOPE, not to justify the price', () => {
    const [c] = bidClarifications([
      line({ flag: 'low_outlier', amount: 400, median_amount: 1000, variance_pct: -60 }),
    ]);
    const q = c.items[0].question;
    // This is the question that pays for the whole feature: a rate well under everybody else
    // usually means the scope was read differently.
    expect(q).toContain('full scope');
    expect(q).toContain('60%');
    expect(q).toContain('below');
  });

  it('a high outlier is asked what the OTHERS may have missed', () => {
    const [c] = bidClarifications([
      line({ flag: 'high_outlier', amount: 2000, median_amount: 1000, variance_pct: 100 }),
    ]);
    // Not "you are too expensive". The high bidder is often the only one who spotted a real risk,
    // and finding that out before award is worth more than the saving.
    expect(c.items[0].question).toContain('the others may not have allowed for');
  });

  it('says how many prices the comparison rests on', () => {
    // A median from two bids and one from six are both "the median", and only one is worth putting
    // to a subcontractor.
    const [thin] = bidClarifications([
      line({ flag: 'low_outlier', amount: 400, median_amount: 1000, variance_pct: -60, bidders_priced: 1 }),
    ]);
    expect(thin.items[0].question).toContain('the only other price we hold');

    const [thick] = bidClarifications([
      line({ flag: 'low_outlier', amount: 400, median_amount: 1000, variance_pct: -60, bidders_priced: 5 }),
    ]);
    expect(thick.items[0].question).toContain('the 5 prices we hold');
  });

  it('puts the hole in the offer at the top of the list', () => {
    const [c] = bidClarifications([
      line({ package_item_id: 'i1', flag: 'high_outlier', amount: 2000, median_amount: 1000, variance_pct: 100 }),
      line({ package_item_id: 'i2', flag: 'low_outlier', amount: 400, median_amount: 1000, variance_pct: -60 }),
      line({ package_item_id: 'i3', flag: 'unpriced', amount: null }),
    ]);
    // A list nobody reads to the bottom should have the expensive question at the top.
    expect(c.items.map((i) => i.kind)).toEqual(['unpriced', 'low_outlier', 'high_outlier']);
  });

  it('the email text numbers the questions and names the bidder', () => {
    const [c] = bidClarifications([line({ flag: 'unpriced', amount: null, company_name: 'Alpha' })]);
    const text = clarificationsAsText(c);
    expect(text).toContain('Alpha');
    expect(text).toContain('1. ');
    expect(clarificationsAsText({ bidId: 'x', companyName: 'Nobody', items: [] })).toBe('');
  });
});

describe('the comparison is derived, and ranked on the figure that compares', () => {
  it('the client reads both RPCs rather than working the totals out', () => {
    expect(SERVICE).toContain("rpc('get_tender_bid_analysis'");
    expect(SERVICE).toContain("rpc('get_tender_bid_summary'");
  });

  it('nothing in the comparison sums a bid or decides an outlier', () => {
    // Scoped to the analysis section on purpose. The rate GRID totals as the operator types, which
    // is a data-entry aid over one bid's own lines and not a second opinion about anything; a
    // whole-file check flagged it and would have sent the next reader to the wrong place.
    const at = WORKSPACE.indexOf('const BidAnalysisSection');
    expect(at).toBeGreaterThan(-1);
    // To the next TOP-LEVEL declaration, not to the end of the file: the components below it are
    // somebody else's business, and reading them in would put the failure on the wrong line.
    const end = WORKSPACE.indexOf('\nconst ', at + 1);
    const section = WORKSPACE.slice(at, end === -1 ? WORKSPACE.length : end);
    expect(section).toContain('comparable_total');

    // The moment TypeScript adds up a column, its arithmetic and the ledger's can disagree — and a
    // wrong total is a valid number, so nothing raises.
    // ASSIGNING to it, not comparing against it — the lookahead is what lets the "lowest" badge
    // keep saying `b.comparable_total === cheapestComparable`.
    expect(section).not.toMatch(/comparable_total\s*=(?![=])/);
    expect(section).not.toMatch(/\.reduce\(/);
    // The outlier band lives in `get_tender_bid_analysis`, once. A threshold restated here would
    // make the badge and the flag disagree about the same line.
    expect(section).not.toMatch(/0\.75|1\.25/);
  });

  it('shows the submitted total AND the comparable one, and ranks on the comparable', () => {
    // Hiding the submitted figure would be its own dishonesty when the operator has the paper bid
    // in front of them; ranking on it is how the bid with the biggest gaps wins.
    expect(WORKSPACE).toContain('submitted_total');
    expect(WORKSPACE).toContain('comparable_total');
    expect(WORKSPACE).toContain('cheapestComparable');
    expect(WORKSPACE).toMatch(/cheapestComparable = summary\[0\]/);
  });

  it('an omission is shown as an estimate, and "nothing missing" is not shown as zero', () => {
    expect(WORKSPACE).toContain('b.lines_unpriced === 0');
    expect(WORKSPACE).toContain('unpriced_value');
  });
});

describe('the agent tool reports the derivation and never recomputes it', () => {
  it('reads both RPCs', () => {
    expect(TOOL).toContain("rpc('get_tender_bid_summary'");
    expect(TOOL).toContain("rpc('get_tender_bid_analysis'");
  });

  it('tells the model which total to rank on', () => {
    // Left to itself a model ranks on the biggest number it recognises as a price, which is
    // exactly the submitted one.
    expect(TOOL).toContain('Rank on comparable_total, never on submitted_total');
    expect(TOOL).toContain('do not recompute');
  });

  it('says when no bids are in, rather than returning an empty list to be read as agreement', () => {
    expect(TOOL).toContain('No bids have been received on this package yet');
  });

  it('every construction tool emits a chunk the hub can render', () => {
    // All five shipped emitting only `tool_progress`, four of them behind a `run:` quick-start —
    // a deterministic call with no model turn, so the user read the cheerful done copy over an
    // empty screen. Kept here as well as in toolkitCoverage because this is where it was found.
    for (const t of [
      'construction_cvr', 'construction_applications', 'construction_variations',
      'construction_tenders', 'construction_bid_analysis',
    ]) {
      expect(TOOL, `${t} is not emitted`).toContain(`type: '${t}'`);
    }
  });
});
