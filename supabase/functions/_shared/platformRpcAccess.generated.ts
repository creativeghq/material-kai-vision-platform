// GENERATED MIRROR of src/config/platformRpcAccess.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

export interface WithheldRpc {
  name: string;
  reason: string;
}

/**
 * Derived reads the generic tool may NOT serve.
 *
 * @remarks Not authorization — the caller's EXECUTE grant is that. This is the SENSITIVITY gate:
 * cost and margin are withheld from a client by column grant (#358), so a generic reader serving
 * them to any member would walk around it. Each needs a tool that gates on role.
 */
export const PLATFORM_RPC_WITHHELD: readonly WithheldRpc[] = [
  { name: 'get_product_costs', reason: 'Supplier cost per product. The cost columns are not client-selectable; this is the gated reader for them.' },
  { name: 'get_invoice_item_costs', reason: 'Profit behind an invoice, line by line.' },
  { name: 'get_order_item_costs', reason: 'Profit behind an order, line by line.' },
  { name: 'get_order_profit_positions', reason: 'Margin per order.' },
  { name: 'get_party_profit_position', reason: 'Margin earned on one customer or supplier.' },
  { name: 'get_profit_drawdown', reason: 'Workspace profit over a period.' },
  { name: 'get_monthly_pnl', reason: 'Monthly profit and loss for the whole workspace.' },
  { name: 'get_project_pnl', reason: 'Profit and loss on a project.' },
  { name: 'get_project_cvr', reason: 'Cost-value reconciliation — margin on a construction project.' },
  { name: 'get_project_cost_by_code', reason: 'Project cost broken down by cost code.' },
  { name: 'get_project_finance_summary', reason: 'Project finances including cost against budget.' },
  { name: 'get_asset_book_values', reason: 'Written-down book value of company assets.' },
  { name: 'get_asset_tax_depreciation', reason: 'Tax depreciation schedule for company assets.' },
  { name: 'get_buyer_finance_limits', reason: 'A counterparty credit limit and exposure.' },
  { name: 'get_package_bid_comparison', reason: 'Competing supplier bid prices side by side.' },
  { name: 'get_tender_bid_analysis', reason: 'Competing tender bid prices side by side.' },
];

const WITHHELD = new Map(PLATFORM_RPC_WITHHELD.map((e) => [e.name, e.reason]));

export type PlatformRpcAccess = { access: 'withheld'; reason: string } | { access: 'open' };

/** May the generic reader call this one? Unlisted is open — the list is the exception. */
export function platformRpcAccess(name: string): PlatformRpcAccess {
  const reason = WITHHELD.get(name);
  return reason ? { access: 'withheld', reason } : { access: 'open' };
}

export function withheldRpcNames(): string[] {
  return [...WITHHELD.keys()].sort();
}
