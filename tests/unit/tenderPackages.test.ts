/**
 * Package tendering — the award, the comparison, and the two ways a subcontract goes wrong.
 *
 * The award is the highest-risk write in the whole construction build: it creates a purchase
 * order, its lines, the recomputed totals, the package stamp and the losing bids. Anti-regression
 * rule 4 exists for exactly this shape — if it were a sequence of client writes, the order would
 * commit, the stamp would fail, the screen would say Failed, and the operator would press the only
 * button offered and let the same package twice.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripComments } from '../helpers/stripComments';
import {
  PACKAGE_STATUSES, BID_STATUSES, PACKAGE_LIVE_STATUSES, isBidComparable,
} from '@/modules/projects/tenderVocabulary';

const ROOT = process.cwd();
const SERVICE = readFileSync(
  resolve(ROOT, 'src/modules/projects/services/tendersService.ts'), 'utf8',
);
const CARD = readFileSync(
  resolve(ROOT, 'src/modules/projects/components/TenderPackagesCard.tsx'), 'utf8',
);

describe('tender vocabulary', () => {
  it('mirrors both CHECK constraints', () => {
    expect(PACKAGE_STATUSES).toEqual(['draft', 'issued', 'closed', 'awarded', 'cancelled']);
    expect(BID_STATUSES).toEqual(['invited', 'received', 'declined', 'withdrawn']);
  });

  /**
   * Only a received bid belongs in a comparison, and it is the same set `award_tender_package`
   * will accept. An invited bid has no prices — showing it puts an empty column beside real ones
   * and makes a total read as a bid of zero.
   */
  it('compares received bids only', () => {
    expect(isBidComparable('received')).toBe(true);
    for (const s of ['invited', 'declined', 'withdrawn'] as const) {
      expect(isBidComparable(s)).toBe(false);
    }
  });

  it('does not treat an awarded package as still live', () => {
    expect(PACKAGE_LIVE_STATUSES).not.toContain('awarded');
    expect(PACKAGE_LIVE_STATUSES).not.toContain('cancelled');
  });
});

describe('the tenders service', () => {
  it('awards through ONE rpc, never a sequence of writes', () => {
    // The order, its lines, the totals, the package stamp and the losing bids move together.
    const code = stripComments(SERVICE);
    const award = code.slice(code.indexOf('async award('));
    const body = award.slice(0, award.indexOf('\n  },'));
    expect(body).toContain("supabase.rpc('award_tender_package'");
    expect(body).not.toContain('.insert(');
    expect(body).not.toContain('.update(');
    expect(body).not.toMatch(/from\('orders'\)/);
  });

  it('never sends the generated bid amount', () => {
    const code = stripComments(SERVICE);
    const setRate = code.slice(code.indexOf('async setRate('));
    const body = setRate.slice(0, setRate.indexOf('\n  },'));
    expect(body).toContain('rate');
    expect(body).not.toMatch(/\bamount\b/);
  });

  it('never multiplies quantity by rate', () => {
    const code = stripComments(SERVICE);
    expect(code).not.toMatch(/quantity\s*\*\s*rate/);
    expect(code).not.toMatch(/rate\s*\*\s*quantity/);
  });

  /**
   * The enquiry carries the quantity, not our rate. Sending our own price out with the enquiry
   * answers the question the tender exists to ask.
   */
  it('copies quantities into a package but never rates', () => {
    const code = stripComments(SERVICE);
    const fn = code.slice(code.indexOf('async addItemsFromSchedule('));
    const body = fn.slice(0, fn.indexOf('\n  },'));
    expect(body).toContain('quantity: l.quantity');
    expect(body).not.toMatch(/\brate\b/);
  });

  it('freezes the quantity onto a bid when the subcontractor is invited', () => {
    // Re-measuring the package later must not restate what somebody was asked to price.
    const code = stripComments(SERVICE);
    const fn = code.slice(code.indexOf('async invite('));
    const body = fn.slice(0, fn.indexOf('\n  },'));
    expect(body).toContain('quantity: i.quantity');
    expect(body).not.toMatch(/rate:/);
  });

  it('sets a received bid and its date together', () => {
    // `tender_bids_received_has_date` refuses a received bid with no date.
    const code = stripComments(SERVICE);
    const fn = code.slice(code.indexOf('async setBidStatus('));
    const body = fn.slice(0, fn.indexOf('\n  },'));
    expect(body).toContain('submitted_at');
    expect((body.match(/\.update\(/g) ?? []).length).toBe(1);
  });
});

/**
 * The guard I did not have, and should have.
 *
 * I shipped this feature with the SQL, the service and the probes complete and the UI a shell:
 * of nine service methods the card called four, so a package could never be filled, nobody could
 * be invited and no rate could be entered. The comparison rendered an empty package for ever.
 * Unreachable work is the failure this codebase guards against everywhere else — a tool in no
 * cluster, a push site no agent lists, a cost-code column no screen can set — and tendering had
 * no equivalent check.
 */
describe('every tender operation is reachable from a screen', () => {
  const UI = [
    CARD,
    readFileSync(resolve(ROOT, 'src/modules/projects/components/TenderPackageWorkspace.tsx'), 'utf8'),
  ].join('\n');

  /** Service methods that write or read on a user's behalf, and must therefore be callable. */
  const methodNames = (): string[] =>
    [...stripComments(SERVICE).matchAll(/^ {2}async ([a-zA-Z]+)\(/gm)].map((m) => m[1]);

  it('parses the service (guards against an empty read)', () => {
    expect(methodNames().length).toBeGreaterThan(8);
  });

  it('has a caller for every service method', () => {
    const unreachable = methodNames().filter((m) => !UI.includes(`tendersService.${m}(`));
    expect(unreachable).toEqual([]);
  });

  it('can actually fail — a method nobody calls is reported', () => {
    // Proves the check above is load-bearing rather than vacuously true.
    expect(UI.includes('tendersService.aMethodThatDoesNotExist(')).toBe(false);
  });
});

describe('the comparison', () => {
  it('never renders an unpriced line as zero', () => {
    // A bid that wins on what it omitted is the classic way a subcontract goes wrong.
    expect(CARD).toContain('not priced');
    expect(CARD).toContain('c?.amount === null');
  });

  it('excludes bids that are not received', () => {
    expect(CARD).toContain('isBidComparable(r.bid_status)');
  });

  it('shows a total per bidder rather than one cheapest verdict', () => {
    // The lowest total often belongs to the bid with the most exclusions.
    expect(CARD).toContain('bidTotal');
    expect(CARD).not.toMatch(/cheapest\s*=|winner\s*=/);
  });

  it('marks the lowest line from the SQL flag, not its own comparison', () => {
    // `is_lowest` is computed in get_package_bid_comparison over priced amounts only. Recomputing
    // it here would be free to disagree about what counts as a price.
    expect(CARD).toContain('c?.is_lowest');
    expect(CARD).not.toMatch(/Math\.min\(/);
  });
});
