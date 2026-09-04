/**
 * The public price, and the one way it goes wrong.
 *
 * A price on a marketing page is a money quantity with two possible sources: the plans that bill,
 * and a number somebody typed into a component. The second one is the drift anti-regression rule 1
 * exists to prevent, and here it has a sharper edge than usual — a stale figure on a public page is
 * not an inconvenience, it is a quote the checkout will not honour, and it is what a customer
 * screenshots.
 *
 * So: the page reads `get_public_pricing()`, and when that fails it shows NO price rather than a
 * fallback. The same rule as everywhere else in this codebase — a value, or a stated reason there
 * is no value, never a plausible default.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const read = (p: string) => stripComments(readFileSync(resolve(ROOT, p), 'utf8'));

const PRICING = read('src/components/marketing/PricingSection.tsx');
const AUDIENCE = read('src/components/marketing/AudienceSection.tsx');
const HOME = read('src/pages/HomePage.tsx');

describe('the price has one source', () => {
  it('comes from the RPC, not from the component', () => {
    expect(PRICING).toContain("rpc('get_public_pricing')");
  });

  it('no money figure is written into the marketing components', () => {
    // A currency symbol next to digits is the shape: "€25", "25 EUR", "$49/mo". The plan numbers
    // must all arrive from the database.
    for (const [name, src] of [['pricing', PRICING], ['audience', AUDIENCE], ['home', HOME]] as const) {
      expect(src, `${name} hardcodes a price`).not.toMatch(/[€$£]\s?\d/);
      expect(src, `${name} hardcodes a price`).not.toMatch(/\d+\s?(?:EUR|USD|GBP)\b/);
    }
  });

  it('formats with the canonical money formatter rather than a second one', () => {
    expect(PRICING).toContain("from '@/utils/decimal'");
    expect(PRICING).toContain('formatMoney(');
    expect(PRICING).not.toMatch(/new Intl\.NumberFormat\([^)]*currency/);
  });

  it('shows NO price when the plans cannot be loaded', () => {
    // The failure that matters. A cached or hardcoded fallback here is how a page quotes a number
    // the checkout does not charge.
    expect(PRICING).toContain("setState('failed')");
    expect(PRICING).toContain('could not be loaded');
    // The price only renders inside the ready branch.
    const failedAt = PRICING.indexOf("state === 'failed'");
    const readyAt = PRICING.indexOf("state === 'ready'");
    expect(failedAt).toBeGreaterThan(-1);
    expect(readyAt).toBeGreaterThan(failedAt);
    const failedBlock = PRICING.slice(failedAt, readyAt);
    expect(failedBlock).not.toContain('formatMoney(');
  });

  it('renders "unlimited" for a null limit rather than a number', () => {
    // `-1` is how the stored features say "no cap"; the RPC turns it into null. Printing that
    // straight would put "-1 contacts" on the pricing page.
    expect(PRICING).toContain("n === null ? `Unlimited");
    expect(PRICING).not.toMatch(/max_contacts\s*\?\?\s*0/);
  });
});

describe('what the page claims is what the platform does', () => {
  it('says the trial needs no card, which sign-up backs up', () => {
    // `Auth.tsx` calls signUp(email, password, displayName) — there is no card step. If that ever
    // gains one, this claim becomes false and the guard should be revisited with it.
    const auth = read('src/pages/Auth.tsx');
    expect(auth).toContain('signUp(email, password');
    expect(auth).not.toMatch(/stripe|card_number|paymentMethod/i);
    expect(HOME).toContain('no card');
  });

  it('the module count is derived, not asserted', () => {
    // "39 modules included" has to move when a module ships or is switched off.
    expect(PRICING).toContain('included_modules');
    expect(PRICING).toContain('live_modules');
    expect(PRICING).not.toMatch(/\b\d{2}\s+modules\b/);
  });
});

describe('the homepage names who it is for', () => {
  it('renders the audience and pricing sections', () => {
    expect(HOME).toContain('<AudienceSection />');
    expect(HOME).toContain('<PricingSection />');
  });

  it('each audience says the job and what it replaces, not just a category', () => {
    // The finding this fixes was "ICP on the homepage": the old copy said "for design,
    // construction and materials businesses", which is three audiences in one breath and
    // therefore none.
    expect(AUDIENCE).toContain('replaces:');
    expect(AUDIENCE).toContain('job:');
    const whos = [...AUDIENCE.matchAll(/who:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(whos.length).toBeGreaterThanOrEqual(3);
  });

  it('the pricing anchor the hero and nav point at actually exists', () => {
    // A dead #pricing link on the one page a buyer reads.
    expect(HOME).toMatch(/href="#pricing"/);
    expect(PRICING).toContain('id="pricing"');
  });
});
