/**
 * The B2B trade portal (#441).
 *
 * The piece bespoke apps miss is delegated administration: the builder's office manager adding and
 * capping her own site foremen without phoning us. Import-free so the predicates can be tested
 * without a client.
 */

export type PortalRole = 'admin' | 'buyer' | 'viewer';

export type StockVisibility = 'hidden' | 'bands' | 'exact';

export type StockBand = 'none' | 'limited' | 'in_stock';

export type GateCode = 'ok' | 'viewer' | 'over_personal_limit' | 'over_account_threshold';

export type ApprovalStatus = 'pending' | 'approved' | 'declined' | 'expired';

export interface PortalIdentity {
  ok: boolean;
  reason?: string;
  portal_user_id?: string;
  account_id?: string;
  company_id?: string;
  company_name?: string | null;
  email?: string;
  display_name?: string | null;
  role?: PortalRole;
  spend_limit_per_order?: number | null;
  stock_visibility?: StockVisibility;
  approval_threshold?: number | null;
}

export interface OpenItem {
  invoice_id: string;
  number: string | null;
  issued_at: string | null;
  due_at: string | null;
  total: number;
  amount_paid: number;
  outstanding: number;
  days_past_due: number | null;
  pay_token: string | null;
}

export interface Statement extends PortalIdentity {
  balance?: Record<string, unknown>;
  open_items?: OpenItem[];
  note?: string;
}

export interface StockPoolBand {
  pool_id: string;
  lot: string | null;
  tone: string | null;
  calibre: string | null;
  available_band: StockBand;
  available: number | null;
}

export interface PortalStock {
  ok: boolean;
  policy: StockVisibility;
  pools: StockPoolBand[];
  reason: string;
}

export interface SpendGate {
  ok: boolean;
  allowed?: boolean;
  code?: GateCode;
  limit?: number | null;
  reason?: string;
}

export interface PortalUserRow {
  id: string;
  email: string;
  display_name: string | null;
  role: PortalRole;
  spend_limit_per_order: number | null;
  is_active: boolean;
}

export const ROLE_LABEL: Record<PortalRole, string> = {
  admin: 'Their administrator',
  buyer: 'Buyer',
  viewer: 'May look, not buy',
};

export const VISIBILITY_LABEL: Record<StockVisibility, string> = {
  hidden: 'No stock shown',
  bands: 'Bands only',
  exact: 'Exact quantities',
};

export const BAND_LABEL: Record<StockBand, string> = {
  none: 'None available',
  limited: 'Limited',
  in_stock: 'In stock',
};

export const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  pending: 'Waiting on their administrator',
  approved: 'Approved',
  declined: 'Declined',
  expired: 'Expired',
};

/** The delegated admin is the customer's own person, not ours. That is the whole feature. */
export const canManageColleagues = (i: PortalIdentity | null): boolean =>
  !!i && i.ok && i.role === 'admin';

export const mayBuy = (i: PortalIdentity | null): boolean =>
  !!i && i.ok && (i.role === 'admin' || i.role === 'buyer');

/**
 * NULL means uncapped, which is a decision somebody made. ZERO means they may look and not buy —
 * a different answer, and both have to be expressible.
 */
export const isUncapped = (u: Pick<PortalUserRow, 'spend_limit_per_order'>): boolean =>
  u.spend_limit_per_order == null;

export const gateBlocks = (g: SpendGate | null): boolean => !!g && g.ok && g.allowed === false;

/** Over a cap is a REQUEST for their own administrator, not a refusal from us. */
export const gateBecomesRequest = (g: SpendGate | null): boolean =>
  gateBlocks(g) && (g?.code === 'over_personal_limit' || g?.code === 'over_account_threshold');

/**
 * Stock visibility is a POLICY, not a toggle: a real quantity invites planning against it and
 * nothing makes the portal useless. Bands are the middle, and they are per POOL — three tones of
 * the same tile are not interchangeable on a wall.
 */
export const showsExactQuantity = (p: StockVisibility): boolean => p === 'exact';

export const bandsAreEnough =
  'Availability is per pool. A single total across tones is a number nobody can lay.';

export const STATEMENT_IS_ONE_DERIVATION =
  'The balance is the ledger’s own figure and the lines are what make it up. A portal that totals '
  + 'its own open items is a second answer to "what do they owe", with the customer looking at it.';

export const PASSWORDLESS_IS_THE_POINT =
  'A link unique to the recipient, with no account for them to create and forget — which is what '
  + 'pastes into a WhatsApp thread.';

export const DRAFT_UNTIL_WE_CONFIRM =
  'A portal order is a draft until we confirm it. A portal that confirms its own orders is a '
  + 'portal that ships a typo.';
