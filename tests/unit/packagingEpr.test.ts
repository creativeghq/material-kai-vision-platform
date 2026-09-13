/**
 * Packaging EPR and PPWR (#454).
 *
 * Two traps are load-bearing here. `first_placed = total − prior` is the obvious derivation and it
 * is WRONG the moment a second-hand pallet is bought; and an unassessed recyclability grade is a
 * third state, never a C.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  TIER_LABEL, GRADE_LABEL, ESPR_LABEL, gradeIsAssessed, componentIsIncomplete,
  recycledContentIsKnown, retentionYearsFor, firstPlacedPieces, totalPlacedPieces,
  declarationNeedsAttention, supplierEprBlocksSale, esprNeedsAnswer,
  PACKAGING_LEGAL_BASIS, AMP_ON_EVERY_DOCUMENT, FOREIGN_EPR_DOES_NOT_EXEMPT,
  CONTAINER_IS_NOT_PACKAGING, WRAPS_STAY_IN_THE_POOL, REUSE_TARGET_PERCENT, REUSE_TARGET_FROM,
  type PackagingComponent, type PackagingDeclaration, type SupplierEprPosition,
  type EsprPosition, type RecyclabilityGrade, type PackagingTier, type EsprStatus,
} from '@/modules/finance/packagingEprRules';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const service = read('src/modules/finance/services/packagingEprService.ts');
const declarationCard = read('src/modules/finance/components/PackagingDeclarationCard.tsx');
const componentsPanel = read('src/modules/marketplace/components/PackagingComponentsPanel.tsx');
const supplierCard = read('src/modules/crm/components/SupplierEprCard.tsx');
const settings = read('src/modules/finance/tabs/SettingsTab.tsx');
const productCard = read('src/components/business/marketplace/ProductFiscalCard.tsx');
const companyPage = read('src/modules/crm/pages/CompanyDetailPage.tsx');

const component = (over: Partial<PackagingComponent>): PackagingComponent => ({
  id: 'c', product_id: 'p', component_name: 'Carton', tier: 'secondary',
  material_code: 'paper_transport', grams_per_unit: 850, pieces_per_unit: 1, is_reusable: false,
  recyclability_grade: 'A', recyclability_assessed_on: '2026-01-01',
  recycled_content_percent: 40, retention_years: 5, ...over,
});

describe('the pallet rule defeats the obvious derivation', () => {
  it('ten NEW pallets plus ninety held is ten first-placed and a hundred total', () => {
    const a = { acquired_new_in_year: 10, acquired_used_in_year: 0, held_from_prior_year: 90 };
    expect(firstPlacedPieces(a)).toBe(10);
    expect(totalPlacedPieces(a)).toBe(100);
  });

  it('the same ten bought SECOND-HAND is ZERO first-placed, and still a hundred total', () => {
    // ΕΟΑΝ's own worked example: «δεν συμπληρώνεται (μηδέν)». So total − prior would say 10.
    const a = { acquired_new_in_year: 0, acquired_used_in_year: 10, held_from_prior_year: 90 };
    expect(firstPlacedPieces(a)).toBe(0);
    expect(totalPlacedPieces(a)).toBe(100);
    expect(totalPlacedPieces(a) - a.held_from_prior_year).not.toBe(firstPlacedPieces(a));
  });

  it('the ledger keeps three counts and the card shows all three', () => {
    expect(service).toMatch(/acquired_new_in_year/);
    expect(service).toMatch(/acquired_used_in_year/);
    expect(service).toMatch(/held_from_prior_year/);
    expect(declarationCard).toMatch(/acquired_used_in_year/);
  });
});

describe('an unassessed grade is not a C', () => {
  it('the third state is its own answer', () => {
    expect(gradeIsAssessed('unassessed')).toBe(false);
    for (const g of ['A', 'B', 'C'] as RecyclabilityGrade[]) expect(gradeIsAssessed(g)).toBe(true);
    for (const g of ['A', 'B', 'C', 'unassessed'] as RecyclabilityGrade[]) {
      expect(GRADE_LABEL[g]).toBeTruthy();
    }
    for (const t of ['primary', 'secondary', 'tertiary'] as PackagingTier[]) {
      expect(TIER_LABEL[t]).toBeTruthy();
    }
  });

  it('a component with no weight or no assessment is incomplete, not nil', () => {
    expect(componentIsIncomplete(component({}))).toBe(false);
    expect(componentIsIncomplete(component({ grams_per_unit: null }))).toBe(true);
    expect(componentIsIncomplete(component({ recyclability_grade: 'unassessed' }))).toBe(true);
  });

  it('zero recycled content is a claim and NULL is the absence of one', () => {
    expect(recycledContentIsKnown(component({ recycled_content_percent: 0 }))).toBe(true);
    expect(recycledContentIsKnown(component({ recycled_content_percent: null }))).toBe(false);
  });
});

describe('art. 22 keeps the papers longer than the orders', () => {
  it('five years single-use, ten reusable', () => {
    expect(retentionYearsFor(false)).toBe(5);
    expect(retentionYearsFor(true)).toBe(10);
  });
});

describe('one derivation feeds both filings', () => {
  it('the declaration comes from SQL and nothing re-totals it', () => {
    // The scheme is required to report any difference between the ΕΜΠΑ report and the ΣΣΕΔ
    // declaration to ΕΟΑΝ, so two tonnages computed two ways is the expensive version of rule 1.
    expect(service).toContain('packaging_declaration');
    expect(declarationCard).not.toMatch(/grams_per_unit\s*\*|\/\s*1000/);
  });

  it('a product that moved with no composition is missing tonnage, not nil', () => {
    const d = (over: Partial<PackagingDeclaration>): PackagingDeclaration => ({
      year: 2026, status: 'ok', reason: '', products_without_composition: 0,
      legal_basis: '', note: '', rows: [], ...over,
    });
    expect(declarationNeedsAttention(d({ status: 'incomplete_composition' }))).toBe(true);
    expect(declarationNeedsAttention(d({ status: 'ok' }))).toBe(false);
    expect(declarationNeedsAttention(d({ status: 'no_movement' }))).toBe(false);
    expect(declarationNeedsAttention(null)).toBe(false);
  });

  it('the operative law is named, and the repealed one is not treated as current', () => {
    expect(PACKAGING_LEGAL_BASIS).toMatch(/4819\/2021/);
    expect(PACKAGING_LEGAL_BASIS).toMatch(/repealed/);
    expect(AMP_ON_EVERY_DOCUMENT).toMatch(/€100/);
    expect(FOREIGN_EPR_DOES_NOT_EXEMPT).toMatch(/CONAI|Ecoembes/);
    expect(CONTAINER_IS_NOT_PACKAGING).toMatch(/not packaging/);
  });

  it('wraps stay in the 40% pool even though they are out of the 100% requirements', () => {
    expect(REUSE_TARGET_PERCENT).toBe(40);
    expect(REUSE_TARGET_FROM).toBe('2030-01-01');
    expect(WRAPS_STAY_IN_THE_POOL).toMatch(/denominator|pool/);
  });
});

describe('the producer register is checked before the sale, not after', () => {
  it('unverified blocks', () => {
    const p = (over: Partial<SupplierEprPosition>): SupplierEprPosition => ({
      status: 'verified', suppliers: 2, with_registration: 2, verified_against_register: 2,
      reason: '', legal_basis: '', rows: [], ...over,
    });
    expect(supplierEprBlocksSale(p({ status: 'unverified' }))).toBe(true);
    expect(supplierEprBlocksSale(p({}))).toBe(false);
    expect(supplierEprBlocksSale(p({ status: 'no_suppliers' }))).toBe(false);
  });

  it('a number the supplier gave us is distinguished from a register check', () => {
    expect(supplierCard).toMatch(/not checked against the register/);
    expect(service).toMatch(/verified_at: input\.verified/);
  });
});

describe('ESPR turns on one fact, and not knowing it is not an exemption', () => {
  it('unknown needs an answer; micro and small need nothing', () => {
    const e = (over: Partial<EsprPosition>): EsprPosition =>
      ({ enterprise_size: null, status: 'unknown', reason: '', note: '', ...over });
    expect(esprNeedsAnswer(e({}))).toBe(true);
    expect(esprNeedsAnswer(e({ status: 'not_applicable' }))).toBe(false);
    expect(esprNeedsAnswer(e({ status: 'from_2030' }))).toBe(false);
    const statuses: EsprStatus[] = ['unknown', 'not_applicable', 'from_2030', 'applies'];
    for (const s of statuses) expect(ESPR_LABEL[s]).toBeTruthy();
  });
});

describe('all three surfaces are reachable', () => {
  it('the declaration, the per-product composition and the supplier check', () => {
    expect(settings).toContain('PackagingDeclarationCard');
    expect(productCard).toContain('PackagingComponentsPanel');
    expect(companyPage).toContain('SupplierEprCard');
  });

  it('a failed read is unknown everywhere', () => {
    expect(declarationCard).toMatch(/not a statement that nothing is[\s\S]{0,20}declarable/);
    expect(componentsPanel).toMatch(/not a statement that there is none/);
    expect(supplierCard).toMatch(/not a statement that this supplier[\s\S]{0,20}is registered/);
  });
});
