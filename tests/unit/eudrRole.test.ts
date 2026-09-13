/**
 * The EUDR role is PER LINE, and the three roles cost different things (#449).
 *
 * A business can be an operator on a Turkish MDF panel, a trader on an Italian kitchen unit and a
 * downstream operator on the unit it builds out of the panel — at the same moment. A model that
 * knows the supplier's country but not the ROLE cannot see that a DDS and a set of plot coordinates
 * are owed on one line and nothing at all on the next.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  eudrLineNeedsAttention, eudrCollectsCustomerIdentity,
  EUDR_OBLIGATIONS, EUDR_APPLIES_FROM,
  type EudrOrderLine,
} from '@/modules/finance/offerSafetyRules';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const service = read('src/modules/finance/services/eudrService.ts');
const card = read('src/modules/finance/components/OrderEudrCard.tsx');
const ordersPanel = read('src/modules/finance/components/OrdersPanel.tsx');
const fiscalCard = read('src/components/business/marketplace/ProductFiscalCard.tsx');

const line = (over: Partial<EudrOrderLine>): EudrOrderLine => ({
  order_item_id: 'x', description: 'MDF panel', cn: '44111291', origin: 'TR',
  role: 'operator', status: 'derived', reason: '', has_statement: false,
  species_common: null, species_scientific: null, ...over,
});

describe('the date is 30 December 2026 and the deferral does not reach us', () => {
  it('the applying date is the one in the amended art. 38', () => {
    // Reg. (EU) 2025/2650 gives micro/small operators until 30 June 2027 EXCEPT for products
    // already in the EUTR Annex — and every heading we sell was in it.
    expect(EUDR_APPLIES_FROM).toBe('2026-12-30');
    expect(service).not.toMatch(/2027-06-30/);
  });
});

describe('an operator line with no statement is the expensive one', () => {
  it('it needs a human, and a trader line does not', () => {
    expect(eudrLineNeedsAttention(line({ role: 'operator', has_statement: false }))).toBe(true);
    expect(eudrLineNeedsAttention(line({ role: 'operator', has_statement: true }))).toBe(false);
    expect(eudrLineNeedsAttention(line({ role: 'trader', has_statement: false }))).toBe(false);
    expect(eudrLineNeedsAttention(line({ role: 'downstream_operator', has_statement: false }))).toBe(false);
  });

  it('a missing origin needs a human whatever role it would have been', () => {
    // The two candidate roles differ by a statement and a set of plot coordinates, so an
    // undecidable origin is not a quiet "probably a trader".
    expect(eudrLineNeedsAttention(line({ status: 'unknown_origin', role: null }))).toBe(true);
  });
});

describe('the roles differ by what they actually cost', () => {
  it('only the operator submits a statement and holds plot geolocation', () => {
    const submits = (rs: string[]) => rs.some((r) => /submit a due diligence statement/i.test(r));
    const plots = (rs: string[]) => rs.some((r) => /geolocation/i.test(r));
    expect(submits(EUDR_OBLIGATIONS.operator)).toBe(true);
    expect(plots(EUDR_OBLIGATIONS.operator)).toBe(true);
    expect(submits(EUDR_OBLIGATIONS.downstream_operator)).toBe(false);
    expect(plots(EUDR_OBLIGATIONS.downstream_operator)).toBe(false);
    expect(submits(EUDR_OBLIGATIONS.trader)).toBe(false);
    expect(plots(EUDR_OBLIGATIONS.trader)).toBe(false);
  });

  it('a downstream operator still collects and keeps', () => {
    // Reg. (EU) 2025/2650 removed the due-diligence duty, not the duty to hold the paper.
    expect(EUDR_OBLIGATIONS.downstream_operator.some((r) => /collect and keep/i.test(r))).toBe(true);
  });

  it('every role keeps things for five years', () => {
    for (const role of ['operator', 'downstream_operator', 'trader'] as const) {
      expect(
        EUDR_OBLIGATIONS[role].some((r) => /five years/i.test(r)),
        `${role} does not state the retention period`,
      ).toBe(true);
    }
  });
});

describe('the customer-identity duty is asymmetric on purpose', () => {
  it('a business customer is collected and a consumer is not', () => {
    // Art 5(3)(b) reaches B2B customers only. Collecting a consumer's details "to be safe" is
    // over-collection, which is its own breach — so the asymmetry is stated rather than assumed.
    expect(eudrCollectsCustomerIdentity({ isBusiness: true })).toBe(true);
    expect(eudrCollectsCustomerIdentity({ isBusiness: false })).toBe(false);
  });

  it('the card says which of the two it is', () => {
    expect(card).toContain('eudrCollectsCustomerIdentity');
    expect(card).toMatch(/over-collection/);
  });
});

describe('nothing is hand-set, and nothing is named wrongly', () => {
  it('the role comes from the SQL derivation', () => {
    expect(service).toContain('eudr_order_position');
    // The per-line role arrives WITH each line, so there is no second single-line reader here:
    // two ways to ask "what are we on this line" is two answers waiting to differ.
    expect(service).not.toContain('eudr_role_for_line');
  });

  it('the CN list is not restated in the client', () => {
    // Annex I is CN-based and effective-dated in the database, so a heading added by a delegated
    // act is a row rather than a deploy.
    for (const cn of ['4411', '4412', '4418', '940340']) {
      expect(service, `the service restates CN ${cn}`).not.toMatch(new RegExp(`'${cn}`));
    }
  });

  it('a TRACES retrieval code is not called a requirement', () => {
    // The Regulation names the DDS reference number and the declaration identifier. TRACES pairs
    // a reference with a retrieval code in practice; that is a field, not an obligation.
    expect(service).toContain('traces_retrieval_code');
    // Never `reference_number`'s equal: the Regulation names two artefacts and TRACES adds a
    // third, so the third gets a field spelled after the tool that issues it.
    expect(service).not.toMatch(/verification_number|verificationNumber/);
    expect(card).toMatch(/not a requirement/i);
  });

  it('both species names are recordable, because art. 9(1)(a) wants both', () => {
    expect(fiscalCard).toContain('wood_species_common');
    expect(fiscalCard).toContain('wood_species_scientific');
  });

  it('it is mounted beside the other border questions', () => {
    expect(ordersPanel).toContain('OrderEudrCard');
  });
});

describe('the card reports a verdict, never an emptiness', () => {
  it('a failed read is unknown, not "nothing in scope"', () => {
    expect(card).toMatch(/not a statement[\s\S]{0,20}that nothing on it is in scope/);
  });

  it('out-of-scope lines are reported as CHECKED', () => {
    expect(card).toMatch(/checked against Annex I and are out of scope/);
  });

  it('an undecidable line is labelled as such, not left blank', () => {
    expect(card).toContain('Undecidable');
  });
});
