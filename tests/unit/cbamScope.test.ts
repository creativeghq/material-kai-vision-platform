/**
 * CBAM is decided by MASS, and the exemption belongs to the year (#429) — and the regulatory role
 * is derived from origin, never picked (#430).
 *
 * Two silent shapes. An unweighed consignment summed as 0 kg keeps an importer under 50 t on paper
 * while the goods are in the warehouse; and a product defaulted to "distributor" — the lightest of
 * the four obligation sets — makes importer duties disappear without anything raising.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  cbamNeedsAttention, cbamIsWatched, formatTonnes, extractToRows, ROLE_OBLIGATIONS,
  type CbamYearPosition,
} from '@/modules/finance/services/cbamService';
import {
  dopcNeedsAttention, formatDeclaredValue, NO_PERFORMANCE_DECLARED,
  type DopcVerdict, type DopcStatus,
} from '@/modules/finance/services/dopcService';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const service = read('src/modules/finance/services/cbamService.ts');
const card = read('src/modules/finance/components/OrderCbamCard.tsx');
const notice = read('src/components/business/marketplace/RegulatoryRoleNotice.tsx');
const fiscalCard = read('src/components/business/marketplace/ProductFiscalCard.tsx');
const ordersPanel = read('src/modules/finance/components/OrdersPanel.tsx');
const dopcPanel = read('src/components/business/marketplace/DopcPanel.tsx');
const positionCard = read('src/modules/finance/components/CbamPositionCard.tsx');
const settingsTab = read('src/modules/finance/tabs/SettingsTab.tsx');

const p = (over: Partial<CbamYearPosition>): CbamYearPosition =>
  ({ status: 'below_threshold', reason: '', ...over });

describe('an undecidable year is not a light one', () => {
  it('only `undecidable` and `liable` ask for a human', () => {
    expect(cbamNeedsAttention(p({ status: 'undecidable', net_mass_kg: null }))).toBe(true);
    expect(cbamNeedsAttention(p({ status: 'liable', net_mass_kg: 61000 }))).toBe(true);
    // These are ANSWERS: the rule ran and the year is clear.
    expect(cbamNeedsAttention(p({ status: 'below_threshold', net_mass_kg: 21000 }))).toBe(false);
    expect(cbamNeedsAttention(p({ status: 'no_entries', net_mass_kg: 0 }))).toBe(false);
    expect(cbamNeedsAttention(null)).toBe(false);
  });

  it('an absent mass renders as a dash, never as 0 t', () => {
    // "0 t of 50 t" is the most reassuring possible way to say "we could not total this year".
    expect(formatTonnes(null)).toBe('—');
    expect(formatTonnes(undefined)).toBe('—');
    expect(formatTonnes(Number.NaN)).toBe('—');
    expect(formatTonnes(0)).toMatch(/^0\s*t$/);
    expect(formatTonnes(61000)).toMatch(/^61\s*t$/);
  });
});

describe('the threshold is never applied in the client', () => {
  it('no 50 t figure and no comparison live here', () => {
    // The threshold, the aggregation window and the retroactivity are statutory and derived in
    // SQL. A second ladder in TypeScript would be a second answer.
    expect(service).not.toMatch(/\b50000\b|\b50_000\b/);
    expect(card).not.toMatch(/\b50000\b|\b50_000\b/);
    expect(service).not.toMatch(/net_mass_kg\s*[<>]=?\s*\d/);
    expect(card).not.toMatch(/net_mass_kg\s*[<>]=?\s*\d/);
  });

  it('the verdicts come from the SQL derivations', () => {
    expect(service).toContain('cbam_year_position');
    expect(service).toContain('cbam_order_preview');
    expect(service).toContain('record_cbam_entries_from_order');
    expect(service).toContain('product_regulatory_role');
  });
});

describe('the card reports a verdict, never an emptiness', () => {
  it('it renders the derivation`s own reason rather than restating it', () => {
    expect(card).toContain('preview.reason');
    expect(card).toContain('position.reason');
  });

  it('a failed read is unknown, not "nothing in scope"', () => {
    expect(card).toMatch(/not a statement[\s\S]{0,20}that nothing on it is in scope/);
  });

  it('the retroactive date is named when the year has been crossed', () => {
    // The obligation reaches back to the FIRST in-scope entry, not to the crossing date. A card
    // that shows only "liable" hides the January consignment that just became dutiable.
    expect(card).toContain('retroactive_from');
  });

  it('out-of-scope lines are reported as CHECKED, not dropped', () => {
    expect(card).toMatch(/checked against Annex I and are out of scope/);
  });

  it('it is mounted where the border question is already asked', () => {
    expect(ordersPanel).toContain('OrderCbamCard');
    expect(ordersPanel).toContain('OrderCustomsCard');
  });
});

describe('the regulatory role is derived, and the roles differ by what they cost', () => {
  it('an importer carries strictly more than a distributor', () => {
    expect(ROLE_OBLIGATIONS.importer.length).toBeGreaterThan(ROLE_OBLIGATIONS.distributor.length);
  });

  it('only the importer puts our own name on the product', () => {
    const named = (rs: string[]) => rs.some((r) => /own name|name, registered/i.test(r));
    expect(named(ROLE_OBLIGATIONS.importer)).toBe(true);
    expect(named(ROLE_OBLIGATIONS.distributor)).toBe(false);
  });

  it('only the manufacturer draws up the declaration of performance', () => {
    const draws = (rs: string[]) => rs.some((r) => /draw up the Declaration of Performance/i.test(r));
    expect(draws(ROLE_OBLIGATIONS.manufacturer)).toBe(true);
    expect(draws(ROLE_OBLIGATIONS.importer)).toBe(false);
    expect(draws(ROLE_OBLIGATIONS.distributor)).toBe(false);
  });

  it('an underivable role says so instead of falling back to distributor', () => {
    // Distributor is the lightest of the four, so guessing it is the one wrong answer that hides
    // work rather than creating it.
    expect(notice).not.toMatch(/\|\|\s*'distributor'|\?\?\s*'distributor'/);
    expect(notice).toContain('verdict?.reason');
  });

  it('a failed read is unknown, not distributor', () => {
    expect(notice).toMatch(/not a statement that we are only[\s\S]{0,20}the distributor/);
  });
});

describe('own-brand is recordable where origin already is', () => {
  it('the one fiscal/customs editor owns it', () => {
    expect(fiscalCard).toContain('is_own_brand');
    expect(fiscalCard).toContain('country_of_origin');
    expect(fiscalCard).toContain('RegulatoryRoleNotice');
  });

  it('the notice re-reads what was SAVED, not the form', () => {
    // The role is derived in SQL from the stored row, so a notice fed from the unsaved form would
    // be asserting a fact the database does not hold.
    expect(fiscalCard).toContain('refreshKey={savedAt}');
    expect(notice).toContain('refreshKey');
  });
});


describe('the watch line is its own instruction', () => {
  it('only `watch` is watched, and it is not the same as liable', () => {
    expect(cbamIsWatched(p({ status: 'watch', net_mass_kg: 46000 }))).toBe(true);
    expect(cbamIsWatched(p({ status: 'liable' }))).toBe(false);
    expect(cbamIsWatched(p({ status: 'below_threshold' }))).toBe(false);
    // The year is still clear at the watch line. What is running out is the 120 days an
    // authorisation takes, which is a different thing to tell somebody.
    expect(cbamNeedsAttention(p({ status: 'watch' }))).toBe(false);
  });
});

describe('the extract reconciles, it does not transmit', () => {
  it('an absent carbon price is an empty cell, never 0', () => {
    // Art 9(1) counts only a price EFFECTIVELY PAID, and art. 9(4) default values are published
    // from 2027. A zero would read as "checked, and there was none".
    const rows = extractToRows([{
      sector: 'aluminium', goods_code: '76042100', country_of_origin: 'TR',
      entries: 2, net_mass_kg: 1200, carbon_price_paid_eur: null,
    }]);
    expect(rows).toHaveLength(2);
    expect(rows[1][5]).toBe('');
    expect(rows[1][5]).not.toBe('0');
  });

  it('the card says there is nothing to transmit to', () => {
    expect(positionCard).toMatch(/no CBAM API/i);
  });

  it('it is reachable from Finance settings', () => {
    expect(settingsTab).toContain('CbamPositionCard');
    expect(settingsTab).toContain("value: 'compliance'");
  });
});

describe('an undeclared performance is the literal word NULL', () => {
  it('Annex V §9(b) is honoured for every absent shape', () => {
    expect(NO_PERFORMANCE_DECLARED).toBe('NULL');
    expect(formatDeclaredValue('')).toBe('NULL');
    expect(formatDeclaredValue('   ')).toBe('NULL');
    expect(formatDeclaredValue(null)).toBe('NULL');
    expect(formatDeclaredValue(undefined)).toBe('NULL');
  });

  it('a real performance is passed through unchanged', () => {
    expect(formatDeclaredValue('Class A1')).toBe('Class A1');
    expect(formatDeclaredValue(' R9 ')).toBe('R9');
  });

  it('the panel prints it rather than softening it to a dash', () => {
    expect(dopcPanel).toContain('formatDeclaredValue(r.declared_value)');
    expect(dopcPanel).not.toMatch(/declared_value[^\n]{0,40}\?\?\s*'—'/);
  });
});

describe('the DoPC position is a verdict, and only `ok` is clear', () => {
  const d = (status: DopcStatus): DopcVerdict => ({ status, reason: '' });

  it('every not-ok state asks for a human', () => {
    for (const s of ['missing', 'unlinked', 'translation_missing', 'translation_only'] as const) {
      expect(dopcNeedsAttention(d(s)), `${s} should need attention`).toBe(true);
    }
    expect(dopcNeedsAttention(d('ok'))).toBe(false);
    expect(dopcNeedsAttention(null)).toBe(false);
  });

  it('it is keyed on the manufacturer`s code, not our SKU', () => {
    expect(fiscalCard).toContain('dopc_product_type_code');
    expect(fiscalCard).toContain('DopcPanel');
    expect(fiscalCard).toMatch(/not our SKU/);
  });

  it('a failed read is unknown, not "one is held"', () => {
    expect(dopcPanel).toMatch(/not a statement that one is held/);
  });
});
