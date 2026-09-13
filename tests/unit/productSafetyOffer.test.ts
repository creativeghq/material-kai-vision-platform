/**
 * GPSR art. 19 is a PUBLISH GATE, and art. 36(2) is a template with a banned-phrase rule (#450).
 *
 * Both are the same failure shape: a nullable column that renders blank. The page looks finished,
 * the manufacturer's address is simply absent, and nothing raises — which is why completeness is
 * refused at the write rather than warned about, and why the softeners the Regulation names by
 * hand are checked in the database as well as in the editor.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  bannedPhrasesIn, missingRecallElements, offerBlocksPublish,
  RECALL_HEADLINE, RECALL_REQUIRED_FIELDS,
  accessibilityNeedsAttention, burdenClaimIsVoid,
  type BannedPhrase, type OfferDisclosure, type RecallDraft, type AccessibilityPosition,
} from '@/modules/finance/offerSafetyRules';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const service = read('src/modules/finance/services/productComplianceService.ts');
const recallsCard = read('src/modules/finance/components/RecallsCard.tsx');
const offerCard = read('src/components/business/marketplace/OfferDisclosureCard.tsx');
const storefront = read('src/pages/PublicStorefrontPage.tsx');
const storefrontEdge = read('supabase/functions/finance-storefront/index.ts');
const recallPage = read('src/pages/PublicRecallPage.tsx');
const accessCard = read('src/modules/finance/components/AccessibilityCard.tsx');
const app = read('src/App.tsx');

const PHRASES: BannedPhrase[] = [
  { phrase: 'voluntary', language_code: 'en', note: null },
  { phrase: 'precautionary', language_code: 'en', note: null },
  { phrase: 'εθελοντικ', language_code: 'el', note: null },
  { phrase: 'σε σπάνιες περιπτώσεις', language_code: 'el', note: null },
];

describe('the softeners art. 36(2) names by hand are caught', () => {
  it('English phrases are caught whatever the notice language', () => {
    // The Regulation names them in English and the notice is written in Greek. A check that only
    // reads the notice's own language passes half the cases it exists for.
    expect(bannedPhrasesIn('This is a VOLUNTARY recall', PHRASES, 'el').map((p) => p.phrase))
      .toEqual(['voluntary']);
  });

  it('the Greek equivalents are caught too', () => {
    expect(bannedPhrasesIn('Πρόκειται για εθελοντική ανάκληση', PHRASES, 'el').map((p) => p.phrase))
      .toContain('εθελοντικ');
  });

  it('a plain, direct notice passes', () => {
    expect(bannedPhrasesIn('Stop using the product immediately. The edge can cut skin.', PHRASES, 'el'))
      .toHaveLength(0);
  });

  it('the phrase list is NOT restated in TypeScript', () => {
    // The table is the source and the editor fetches it, so a phrase added there reaches the
    // screen with no deploy — and the editor and the write cannot disagree about publishability.
    expect(service).toContain('recall_notice_banned_phrases');
    for (const word of ['voluntary', 'precautionary', 'discretionary']) {
      expect(service, `the service restates "${word}"`).not.toMatch(new RegExp(`'${word}'`));
      expect(recallsCard, `the card restates "${word}"`).not.toMatch(new RegExp(`'${word}'`));
    }
  });
});

describe('the seven elements are all required', () => {
  it('every art. 36(2) element is listed', () => {
    expect(RECALL_REQUIRED_FIELDS).toHaveLength(6);
    const keys = RECALL_REQUIRED_FIELDS.map((f) => f.key);
    for (const k of [
      'product_description', 'hazard_description', 'consumer_action',
      'remedies', 'contact_channel', 'share_encouragement',
    ] as const) {
      expect(keys).toContain(k);
    }
  });

  it('whitespace is not an element', () => {
    const r: RecallDraft = {
      product_description: 'Trim', hazard_description: '   ',
      consumer_action: 'Stop using it', remedies: 'Refund',
      contact_channel: '800', share_encouragement: 'Tell others',
    };
    expect(missingRecallElements(r)).toEqual(['Hazard description (c)']);
    expect(missingRecallElements({})).toHaveLength(6);
  });

  it('the headline is literal and is not the operator`s to phrase', () => {
    expect(RECALL_HEADLINE).toBe('Product safety recall');
    // It is sent on every save rather than read back off a field somebody can edit.
    expect(recallsCard).toContain('headline: RECALL_HEADLINE');
    expect(recallsCard).not.toMatch(/onChange=\{[^}]*headline/);
  });

  it('publishing is blocked while anything is missing or banned', () => {
    expect(recallsCard).toMatch(/disabled=\{saving \|\| missing\.length > 0 \|\| banned\.length > 0\}/);
  });
});

describe('an incomplete offer is refused, not published short', () => {
  const d = (over: Partial<OfferDisclosure>): OfferDisclosure =>
    ({ status: 'complete', reason: '', ...over });

  it('only `incomplete` blocks', () => {
    expect(offerBlocksPublish(d({ status: 'incomplete', missing: ['manufacturer_name'] }))).toBe(true);
    expect(offerBlocksPublish(d({ status: 'complete' }))).toBe(false);
    expect(offerBlocksPublish(null)).toBe(false);
  });

  it('the editor names what is missing rather than saying "incomplete"', () => {
    expect(offerCard).toContain('verdict.missing');
    expect(offerCard).toContain('verdict.reason');
  });

  it('a failed read is unknown, not complete', () => {
    expect(offerCard).toMatch(/not a statement that it is[\s\S]{0,20}complete/);
  });
});

describe('the offer carries art. 19 to the person actually buying', () => {
  it('the storefront asks the server for the derivation', () => {
    expect(storefrontEdge).toContain('product_offer_disclosure');
  });

  it('the public page renders the warnings and the manufacturer contact', () => {
    expect(storefront).toContain('SafetyDisclosure');
    expect(storefront).toContain('safety.warnings');
    expect(storefront).toContain('safety.manufacturer');
    expect(storefront).toContain('responsible_person');
  });

  it('the accessibility statement reaches the service, not a drawer', () => {
    expect(storefrontEdge).toContain('accessibility_statements');
    expect(storefront).toContain('accessibility_statement');
  });
});

describe('the purchase funnel is operable without a mouse or a screen', () => {
  it('every button on the storefront has an accessible name', () => {
    // An icon-only control is announced as "button" and nothing else, so a cart of five lines is
    // fifteen identical buttons. EAA Annex I IV(g)(ii) names checkout specifically.
    const buttons = [...storefront.matchAll(/<button\b[\s\S]*?<\/button>/g)].map((m) => m[0]);
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) {
      const visibleText = b.replace(/<[^>]*>/g, '').replace(/\{[^}]*\}/g, '').trim();
      expect(
        /aria-label=/.test(b) || visibleText.length > 0,
        `an icon-only button has no accessible name: ${b.slice(0, 120)}`,
      ).toBe(true);
    }
  });

  it('every checkout input is bound to a label', () => {
    const ids = [...storefront.matchAll(/<Input\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
    const fors = [...storefront.matchAll(/<Label\b[^>]*\bhtmlFor="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(fors, `input #${id} has no label`).toContain(id);
  });

  it('a checkout error is announced, not only coloured', () => {
    expect(storefront).toMatch(/role="alert"/);
  });
});

describe('the public notice is a document, not a page of shrugs', () => {
  it('all seven art. 36(2) blocks are rendered', () => {
    for (const field of [
      'product_description', 'hazard_description', 'consumer_action',
      'remedies', 'contact_channel', 'share_encouragement',
    ]) {
      expect(recallPage, `the notice omits ${field}`).toContain(field);
    }
    expect(recallPage).toContain('headline');
  });

  it('a missing notice says so rather than implying there is no recall', () => {
    expect(recallPage).toMatch(/not a statement[\s\S]{0,20}that there is no recall/);
  });

  it('it is routed publicly', () => {
    expect(app).toContain('/recall/:token');
    expect(app).toContain('PublicRecallPage');
  });
});

describe('the disproportionate-burden defence is audited, not asserted', () => {
  const p = (over: Partial<AccessibilityPosition>): AccessibilityPosition =>
    ({ status: 'assessed', reason: '', ...over });

  it('never assessed and expired are different, and both need someone', () => {
    expect(accessibilityNeedsAttention(p({ status: 'never_assessed' }))).toBe(true);
    expect(accessibilityNeedsAttention(p({ status: 'expired' }))).toBe(true);
    expect(accessibilityNeedsAttention(p({ status: 'assessed' }))).toBe(false);
    expect(accessibilityNeedsAttention(p({ status: 'burden_claimed' }))).toBe(false);
    expect(accessibilityNeedsAttention(null)).toBe(false);
  });

  it('funding voids the claim outright', () => {
    // Art 14(6): funding from other than our own resources, for the purpose of improving
    // accessibility, kills the defence. An ΕΣΠΑ or RRF grant is exactly that.
    expect(burdenClaimIsVoid({ funding_received: true, disproportionate_burden_claimed: true })).toBe(true);
    expect(burdenClaimIsVoid({ funding_received: true, disproportionate_burden_claimed: false })).toBe(false);
    expect(burdenClaimIsVoid({ funding_received: false, disproportionate_burden_claimed: true })).toBe(false);
  });

  it('the card refuses to record the void combination', () => {
    expect(accessCard).toContain('voidClaim');
    expect(accessCard).toMatch(/disabled=\{saving \|\| voidClaim/);
  });

  it('no presumption of conformity is claimed anywhere', () => {
    // No harmonised standard is cited in the OJ under this Directive. EN 301 549 is the benchmark
    // and saying otherwise on a screen is a claim we cannot support.
    expect(accessCard).not.toMatch(/presumption of conformity(?!\s+available)/);
    expect(accessCard).toMatch(/not a legal shield|no presumption of conformity/i);
  });
});
