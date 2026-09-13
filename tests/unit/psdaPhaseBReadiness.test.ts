/**
 * ΨΔΑ Phase Β: the route, and the code every movement line needs (#407).
 *
 * Recording a leg works whatever the route is, which is exactly why an undecided route is
 * invisible: the lifecycle ledger looks complete and nothing has been filed. And Β2's CN code is
 * the first eight digits of the TARIC we already classify against — a second, separately entered
 * code would be a second answer to one question.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  ROUTE_STATUS_LABEL, ROUTE_LABEL, CN_STATUS_LABEL, routeNeedsDecision, eventsAreStranded,
  cnNeedsWork, cnFromTaric, PHASE_B1_FROM, PHASE_B2_FROM, PENALTY_IS_PER_AUDIT, DATE_MOVES_LATE,
  SUPPRESSION_BASIS, COPYABLE_IS_HISTORIC,
  type PsdaRoutePosition, type CnCoverage, type PsdaRouteStatus, type CnCoverageStatus,
} from '@/modules/finance/psdaPhaseBRules';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const service = read('src/modules/finance/services/psdaPhaseBService.ts');
const card = read('src/modules/finance/components/PsdaReadinessCard.tsx');
const settings = read('src/modules/finance/tabs/SettingsTab.tsx');

const route = (over: Partial<PsdaRoutePosition>): PsdaRoutePosition => ({
  status: 'routed', route: 'provider', confirmed_on: '2026-09-13', mandatory_from: PHASE_B1_FROM,
  untransmitted_events: 0, offline_events_pending: 0, reason: '', note: '', ...over,
});

const coverage = (over: Partial<CnCoverage>): CnCoverage => ({
  from: '2026-01-01', to: '2026-12-31', mandatory_from: PHASE_B2_FROM, lines: 10,
  with_cn_code: 10, suppressed: 0, classifiable_from_product: 0, unclassified: 0,
  status: 'ready', reason: '', legal_basis: '', ...over,
});

describe('an undecided route is an exposure, not a default', () => {
  it('anything short of routed needs a decision', () => {
    expect(routeNeedsDecision(route({ status: 'undecided' }))).toBe(true);
    expect(routeNeedsDecision(route({ status: 'provider_unconfirmed' }))).toBe(true);
    expect(routeNeedsDecision(route({ status: 'credentials_missing' }))).toBe(true);
    expect(routeNeedsDecision(route({}))).toBe(false);
    const statuses: PsdaRouteStatus[] =
      ['routed', 'provider_unconfirmed', 'credentials_missing', 'undecided'];
    for (const s of statuses) expect(ROUTE_STATUS_LABEL[s]).toBeTruthy();
    for (const r of ['provider', 'direct_mydata'] as const) expect(ROUTE_LABEL[r]).toBeTruthy();
  });

  it('the two routes are different credentials, not one pointed elsewhere', () => {
    expect(ROUTE_LABEL.direct_mydata).toMatch(/ERP developer/);
    expect(card).toMatch(/which stored key, not the key/);
  });

  it('stranded events are named', () => {
    expect(eventsAreStranded(route({ untransmitted_events: 3 }))).toBe(true);
    expect(eventsAreStranded(route({}))).toBe(false);
  });

  it('the route is a recorded decision, never inferred from a connector', () => {
    expect(service).toContain('psda_transmission_route');
    expect(service).not.toMatch(/connector_slug|resolveWorkspaceConnector/);
  });
});

describe('the CN code is derived from the TARIC, not typed again', () => {
  it('eight digits, punctuation ignored', () => {
    expect(cnFromTaric('6907 21 00 00')).toBe('69072100');
    expect(cnFromTaric('6907210000')).toBe('69072100');
    expect(cnFromTaric('69072')).toBeNull();
    expect(cnFromTaric(null)).toBeNull();
    expect(cnFromTaric('')).toBeNull();
  });

  it('unclassified and copyable are different findings', () => {
    expect(cnNeedsWork(coverage({ status: 'classification_needed' }))).toBe(true);
    expect(cnNeedsWork(coverage({ status: 'copyable_from_product' }))).toBe(true);
    expect(cnNeedsWork(coverage({}))).toBe(false);
    expect(cnNeedsWork(coverage({ status: 'no_movements' }))).toBe(false);
    const statuses: CnCoverageStatus[] =
      ['ready', 'copyable_from_product', 'classification_needed', 'no_movements'];
    for (const s of statuses) expect(CN_STATUS_LABEL[s]).toBeTruthy();
  });

  it('a suppression has exactly one basis and the card says which', () => {
    expect(SUPPRESSION_BASIS).toMatch(/7 §9/);
    expect(card).toContain('SUPPRESSION_BASIS');
    expect(COPYABLE_IS_HISTORIC).toMatch(/older than/);
  });
});

describe('the dates and the penalty are stated where they change a decision', () => {
  it('Β1 and Β2 are different dates', () => {
    expect(PHASE_B1_FROM).toBe('2026-10-12');
    expect(PHASE_B2_FROM).toBe('2027-01-01');
  });

  it('the penalty is per audit, so a small volume is not a small exposure', () => {
    expect(PENALTY_IS_PER_AUDIT).toMatch(/per audit, not per document/);
  });

  it('the deadline is treated as movable', () => {
    expect(DATE_MOVES_LATE).toMatch(/one day before it fell/);
    expect(card).toContain('DATE_MOVES_LATE');
  });

  it('it is reachable from Finance settings', () => {
    expect(settings).toContain('PsdaReadinessCard');
  });

  it('a failed read is unknown, not filed', () => {
    expect(card).toMatch(/not a statement that the events are[\s\S]{0,20}reaching AADE/);
  });
});
