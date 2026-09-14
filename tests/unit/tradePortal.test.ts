/**
 * The B2B trade portal (#441).
 *
 * Two things decide whether this is a portal or a brochure: the customer's own administrator can
 * cap her own foremen without phoning us, and the statement is the ledger's figure rather than a
 * second total computed with the customer watching it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  ROLE_LABEL, VISIBILITY_LABEL, BAND_LABEL, APPROVAL_LABEL,
  canManageColleagues, mayBuy, isUncapped, gateBlocks, gateBecomesRequest, showsExactQuantity,
  bandsAreEnough, STATEMENT_IS_ONE_DERIVATION, PASSWORDLESS_IS_THE_POINT, DRAFT_UNTIL_WE_CONFIRM,
  type PortalIdentity, type SpendGate, type PortalRole, type StockVisibility,
  type StockBand, type ApprovalStatus,
} from '@/modules/crm/tradePortalRules';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const service = read('src/modules/crm/services/tradePortalService.ts');
const card = read('src/modules/crm/components/TradePortalCard.tsx');
const page = read('src/pages/TradePortalPage.tsx');
const app = read('src/App.tsx');
const fn = read('supabase/functions/trade-portal/index.ts');

const who = (over: Partial<PortalIdentity>): PortalIdentity => ({
  ok: true, portal_user_id: 'u', account_id: 'a', company_id: 'c', company_name: 'Builder Ltd',
  email: 'foreman@builder.gr', role: 'buyer', spend_limit_per_order: 1500,
  stock_visibility: 'bands', approval_threshold: 5000, ...over,
});

describe('the delegated admin is the customer’s own person', () => {
  it('only their admin manages their colleagues', () => {
    expect(canManageColleagues(who({ role: 'admin' }))).toBe(true);
    expect(canManageColleagues(who({ role: 'buyer' }))).toBe(false);
    expect(canManageColleagues(who({ ok: false }))).toBe(false);
    expect(canManageColleagues(null)).toBe(false);
    const roles: PortalRole[] = ['admin', 'buyer', 'viewer'];
    for (const r of roles) expect(ROLE_LABEL[r]).toBeTruthy();
  });

  it('a viewer may look and not buy', () => {
    expect(mayBuy(who({ role: 'viewer' }))).toBe(false);
    expect(mayBuy(who({ role: 'buyer' }))).toBe(true);
    expect(mayBuy(who({ role: 'admin' }))).toBe(true);
  });

  it('the decision is refused to anyone but their admin, in the function itself', () => {
    expect(fn).toMatch(/who\.role !== 'admin'/);
  });

  it('uncapped and zero are different answers', () => {
    // NULL means somebody decided not to cap them. Zero means they may look and not buy.
    expect(isUncapped({ spend_limit_per_order: null })).toBe(true);
    expect(isUncapped({ spend_limit_per_order: 0 })).toBe(false);
  });
});

describe('over a cap is a request, not a refusal from us', () => {
  it('both limits become their administrator’s decision', () => {
    const g = (over: Partial<SpendGate>): SpendGate => ({ ok: true, allowed: true, code: 'ok', ...over });
    expect(gateBlocks(g({ allowed: false, code: 'over_personal_limit' }))).toBe(true);
    expect(gateBecomesRequest(g({ allowed: false, code: 'over_personal_limit' }))).toBe(true);
    expect(gateBecomesRequest(g({ allowed: false, code: 'over_account_threshold' }))).toBe(true);
    expect(gateBecomesRequest(g({ allowed: false, code: 'viewer' }))).toBe(false);
    expect(gateBlocks(g({}))).toBe(false);
    const statuses: ApprovalStatus[] = ['pending', 'approved', 'declined', 'expired'];
    for (const s of statuses) expect(APPROVAL_LABEL[s]).toBeTruthy();
  });

  it('the basket survives the refusal, and the cap as it was is recorded', () => {
    // Losing somebody's basket because they are over a limit their own office set punishes them
    // for it. And raising the cap afterwards must not rewrite why the request existed.
    expect(fn).toMatch(/limit_at_request/);
    expect(fn).toMatch(/status: 'draft'/);
  });
});

describe('the statement is the ledger’s figure', () => {
  it('nothing re-totals what they owe', () => {
    expect(service).toContain('statement');
    expect(service).not.toMatch(/get_customer_open_balance|reduce\(\(s, i\) => s \+/);
    expect(STATEMENT_IS_ONE_DERIVATION).toMatch(/second answer/);
  });

  it('an order placed through the portal is a draft until we confirm it', () => {
    expect(DRAFT_UNTIL_WE_CONFIRM).toMatch(/ships a typo/);
    expect(card).toContain('DRAFT_UNTIL_WE_CONFIRM');
  });
});

describe('stock visibility is a policy, and bands are per pool', () => {
  it('only `exact` shows a real quantity', () => {
    expect(showsExactQuantity('exact')).toBe(true);
    expect(showsExactQuantity('bands')).toBe(false);
    expect(showsExactQuantity('hidden')).toBe(false);
    const policies: StockVisibility[] = ['hidden', 'bands', 'exact'];
    for (const p of policies) expect(VISIBILITY_LABEL[p]).toBeTruthy();
    const bands: StockBand[] = ['none', 'limited', 'in_stock'];
    for (const b of bands) expect(BAND_LABEL[b]).toBeTruthy();
  });

  it('a single total across tones is named as the lie it is', () => {
    expect(bandsAreEnough).toMatch(/per pool/);
    expect(card).toContain('bandsAreEnough');
  });
});

describe('the token is the identity', () => {
  it('the customer’s side never sends a company id', () => {
    // A body-supplied company id is the BOLA shape this whole surface is built to avoid.
    expect(service).not.toMatch(/company_id: companyId[\s\S]{0,80}action: '(statement|stock|place_order)'/);
    expect(fn).toContain('trade_portal_resolve');
  });

  it('minting a link needs a real member, not a token', () => {
    expect(fn).toMatch(/action === 'mint_link'[\s\S]{0,400}authenticate\(req/);
    expect(fn).toMatch(/userCanAccessWorkspace/);
    expect(PASSWORDLESS_IS_THE_POINT).toMatch(/WhatsApp/);
  });

  it('an invalid link gets ONE refusal shape', () => {
    // Telling a stranger which of expired / revoked / unknown it was is how a guesser learns
    // they are close.
    expect(fn).toMatch(/This link is not valid/);
  });

  it('the page and the operator card are both wired', () => {
    expect(app).toContain('TradePortalPage');
    expect(app).toContain('/trade/:token');
    expect(page).toContain('tradePortalService');
  });
});
