/**
 * Package tendering — send a trade package to several subcontractors, compare, award.
 *
 * AWARDING IS ONE RPC, not a sequence of writes from here. `award_tender_package` creates the
 * purchase order, its lines, recomputes the order totals, stamps the package and withdraws the
 * losing bids inside one transaction — and the stamp is the CLAIM, guarded on `awarded_bid_id is
 * null`. Doing it client-side would be the create-then-stamp pair anti-regression rule 4 exists to
 * forbid: the order commits, the stamp fails, the screen says Failed, and the operator presses the
 * only button offered, letting the same package twice.
 *
 * A SUBCONTRACT IS A PURCHASE ORDER. Nothing new was invented for it: `orders` already carries the
 * project, the supplier, lines with cost codes and supplier bills that settle against it, and
 * `get_project_cvr` already reads open purchase orders as committed cost. So an award appears in
 * the cost report with no new derivation.
 */
import { supabase } from '@/integrations/supabase/client';

export {
  PACKAGE_STATUSES, BID_STATUSES, PACKAGE_LIVE_STATUSES, isBidComparable,
} from '../tenderVocabulary';
export type { PackageStatus, BidStatus } from '../tenderVocabulary';

import type { PackageStatus, BidStatus } from '../tenderVocabulary';

export interface TenderPackage {
  id: string;
  workspace_id: string;
  project_id: string;
  reference: string | null;
  name: string;
  scope: string | null;
  status: PackageStatus;
  cost_code_id: string | null;
  currency: string;
  due_at: string | null;
  issued_at: string | null;
  awarded_bid_id: string | null;
  awarded_order_id: string | null;
}

export interface PackageItem {
  id: string;
  package_id: string;
  item_ref: string | null;
  description: string;
  unit: string | null;
  quantity: number | null;
  cost_code_id: string | null;
  sort: number;
}

export interface TenderBid {
  id: string;
  package_id: string;
  company_id: string;
  status: BidStatus;
  submitted_at: string | null;
  notes: string | null;
  /** When the enquiry link was last issued. Null means they have never been sent anything. */
  sent_at: string | null;
}

/** One cell of the comparison: what a bidder put against one package line. */
export interface ComparisonRow {
  package_item_id: string;
  item_ref: string | null;
  description: string;
  unit: string | null;
  quantity: number | null;
  bid_id: string | null;
  company_id: string | null;
  company_name: string | null;
  bid_status: BidStatus | null;
  rate: number | null;
  amount: number | null;
  /** Lowest PRICED amount on this line. An unpriced line is never "lowest". */
  is_lowest: boolean;
}

/**
 * One bid line with the derivation on it. `flag` and `variance_pct` come from SQL — nothing here
 * decides what counts as an outlier, so the screen and any later report cannot disagree.
 */
export interface BidAnalysisRow {
  package_item_id: string;
  item_ref: string | null;
  description: string;
  unit: string | null;
  quantity: number | null;
  bid_id: string;
  company_name: string | null;
  amount: number | null;
  median_amount: number | null;
  variance_pct: number | null;
  bidders_priced: number;
  flag: 'unpriced' | 'low_outlier' | 'high_outlier' | 'ok';
}

/**
 * The per-bid answer. `comparable_total` is the only figure worth ranking on: two bids compare
 * only once they cover the same scope, and `submitted_total` is whatever the bidder chose to
 * price. `unpriced_value` stays separate rather than folded in silently — an estimate standing in
 * for a price is a different KIND of number, and whoever awards has to see how much of the
 * comparison is one.
 */
export interface BidSummaryRow {
  bid_id: string;
  company_id: string | null;
  company_name: string | null;
  status: BidStatus;
  submitted_at: string | null;
  lines_total: number;
  lines_priced: number;
  lines_unpriced: number;
  lines_low_outlier: number;
  lines_high_outlier: number;
  submitted_total: number;
  unpriced_value: number | null;
  comparable_total: number;
  /** True only when nothing is missing — i.e. the submitted figure IS the comparable one. */
  is_complete: boolean;
}

const PKG_COLUMNS =
  'id, workspace_id, project_id, reference, name, scope, status, cost_code_id, currency, ' +
  'due_at, issued_at, awarded_bid_id, awarded_order_id';

function readable(error: { code?: string; message: string }): Error {
  if (error.code === '23505' && /already been awarded/i.test(error.message)) {
    return new Error('This package has already been awarded.');
  }
  if (error.code === '23505') return new Error('That subcontractor is already on this package.');
  if (error.code === '42501') return new Error('You do not have permission to change tenders on this project.');
  if (error.code === '23514' || error.code === '23503') return new Error(error.message);
  return new Error(error.message);
}

export const tendersService = {
  async listPackages(projectId: string): Promise<TenderPackage[]> {
    const { data, error } = await supabase
      .from('tender_packages')
      .select(PKG_COLUMNS)
      .eq('project_id', projectId)
      .order('reference');
    if (error) throw readable(error);
    return (data ?? []) as unknown as TenderPackage[];
  },

  async createPackage(input: {
    workspace_id: string; project_id: string; name: string;
    scope?: string | null; cost_code_id?: string | null; currency?: string; due_at?: string | null;
  }): Promise<TenderPackage> {
    const name = input.name.trim();
    if (!name) throw new Error('Give the package a name.');
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('tender_packages')
      .insert({
        workspace_id: input.workspace_id,
        project_id: input.project_id,
        name,
        scope: input.scope?.trim() || null,
        cost_code_id: input.cost_code_id ?? null,
        currency: input.currency ?? 'EUR',
        due_at: input.due_at ?? null,
        created_by: user?.id ?? null,
        // `reference` is absent: the DB numbers it inside the same INSERT.
      })
      .select(PKG_COLUMNS)
      .single();
    if (error) throw readable(error);
    return data as unknown as TenderPackage;
  },

  async items(packageId: string): Promise<PackageItem[]> {
    const { data, error } = await supabase
      .from('tender_package_items')
      .select('id, package_id, item_ref, description, unit, quantity, cost_code_id, sort')
      .eq('package_id', packageId)
      .order('sort');
    if (error) throw readable(error);
    return (data ?? []) as unknown as PackageItem[];
  },

  /**
   * Build the enquiry from an existing priced schedule, copying the DESCRIPTION, UNIT, QUANTITY
   * and COST CODE but never the rate. The whole point of tendering is to find out what somebody
   * else charges; sending our own rate out with the enquiry answers the question before it is
   * asked.
   */
  async addItemsFromSchedule(
    workspaceId: string,
    packageId: string,
    lines: Array<{ item_ref: string | null; description: string; unit: string | null; quantity: number | null; cost_code_id: string | null }>,
  ): Promise<void> {
    if (lines.length === 0) return;
    const { error } = await supabase.from('tender_package_items').insert(
      lines.map((l, i) => ({
        workspace_id: workspaceId,
        package_id: packageId,
        item_ref: l.item_ref,
        description: l.description,
        unit: l.unit,
        quantity: l.quantity,
        cost_code_id: l.cost_code_id,
        sort: (i + 1) * 10,
      })),
    );
    if (error) throw readable(error);
  },

  async addItem(input: {
    workspace_id: string; package_id: string; description: string;
    item_ref?: string | null; unit?: string | null; quantity?: number | null;
    cost_code_id?: string | null; sort?: number;
  }): Promise<void> {
    const description = input.description.trim();
    if (!description) throw new Error('Describe the item of work.');
    const { error } = await supabase.from('tender_package_items').insert({
      workspace_id: input.workspace_id,
      package_id: input.package_id,
      description,
      item_ref: input.item_ref?.trim() || null,
      unit: input.unit || null,
      quantity: input.quantity ?? null,
      cost_code_id: input.cost_code_id ?? null,
      sort: input.sort ?? 0,
    });
    if (error) throw readable(error);
  },

  async bids(packageId: string): Promise<TenderBid[]> {
    const { data, error } = await supabase
      .from('tender_bids')
      .select('id, package_id, company_id, status, submitted_at, notes, sent_at')
      .eq('package_id', packageId);
    if (error) throw readable(error);
    return (data ?? []) as unknown as TenderBid[];
  },

  /**
   * Invite a subcontractor, seeding a bid line per package item with the quantity FROZEN as it
   * stands now. Re-measuring the package afterwards must not restate what somebody was asked to
   * price, let alone what they offered.
   */
  async invite(workspaceId: string, packageId: string, companyId: string): Promise<TenderBid> {
    const { data, error } = await supabase
      .from('tender_bids')
      .insert({ workspace_id: workspaceId, package_id: packageId, company_id: companyId })
      .select('id, package_id, company_id, status, submitted_at, notes, sent_at')
      .single();
    if (error) throw readable(error);
    const bid = data as unknown as TenderBid;

    const items = await this.items(packageId);
    if (items.length) {
      const { error: itemErr } = await supabase.from('tender_bid_items').insert(
        items.map((i) => ({
          workspace_id: workspaceId,
          bid_id: bid.id,
          package_item_id: i.id,
          quantity: i.quantity,
          // No rate: that is what we are asking them for.
        })),
      );
      if (itemErr) throw readable(itemErr);
    }
    return bid;
  },

  async setRate(bidItemId: string, rate: number | null): Promise<void> {
    // `amount` is generated from quantity and rate — never sent.
    const { error } = await supabase.from('tender_bid_items').update({ rate }).eq('id', bidItemId);
    if (error) throw readable(error);
  },

  async setBidStatus(bidId: string, status: BidStatus): Promise<void> {
    const { error } = await supabase
      .from('tender_bids')
      .update({
        status,
        // The DB refuses a received bid with no date; set them together.
        ...(status === 'received' ? { submitted_at: new Date().toISOString() } : {}),
      })
      .eq('id', bidId);
    if (error) throw readable(error);
  },

  async comparison(packageId: string): Promise<ComparisonRow[]> {
    const { data, error } = await supabase.rpc('get_package_bid_comparison', { p_package_id: packageId });
    if (error) throw readable(error);
    return (data ?? []) as ComparisonRow[];
  },

  /**
   * The per-line analysis: what each bidder charged against what the others did.
   *
   * The comparison table already refuses to call an unpriced line the cheapest. This says what the
   * omission is WORTH, which is the difference between "Alpha, €2,600" and "Alpha, €2,600 plus a
   * line nobody priced, ~€1,850 at the others' rates" — two offers that look the same on a screen
   * and are not the same offer.
   */
  async analysis(packageId: string): Promise<BidAnalysisRow[]> {
    const { data, error } = await supabase.rpc('get_tender_bid_analysis', { p_package_id: packageId });
    if (error) throw readable(error);
    return (data ?? []) as BidAnalysisRow[];
  },

  /** Per bid, ranked by the COMPARABLE total rather than the submitted one. */
  async bidSummary(packageId: string): Promise<BidSummaryRow[]> {
    const { data, error } = await supabase.rpc('get_tender_bid_summary', { p_package_id: packageId });
    if (error) throw readable(error);
    return (data ?? []) as BidSummaryRow[];
  },

  /**
   * Award the package. Returns the purchase order id the subcontract now lives on.
   *
   * One RPC on purpose — see the header. The order, its lines, the recomputed totals, the package
   * stamp and the losing bids all move together or not at all.
   */
  async award(packageId: string, bidId: string): Promise<string> {
    const { data, error } = await supabase.rpc('award_tender_package', {
      p_package_id: packageId,
      p_bid_id: bidId,
    });
    if (error) throw readable(error);
    return data as string;
  },

  /**
   * Issue the enquiry to one subcontractor: mints their private link, emails it, returns it.
   *
   * The link is PER BID. It resolves to that subcontractor's own lines and nothing else, so a
   * forwarded link cannot show anybody what a competitor quoted — which is the one thing a tender
   * must never do. Re-sending keeps the same token, so somebody part-way through pricing does not
   * lose their link because the buyer pressed send twice.
   *
   * The link comes back whether or not the email went out: a company with no email on file is
   * ordinary, and the buyer can paste it into their own message.
   */
  async sendEnquiry(bidId: string): Promise<{ link: string; emailed: boolean; has_email: boolean }> {
    const { data, error } = await supabase.functions.invoke('tender-bid-portal', {
      body: { action: 'send', bid_id: bidId },
    });
    if (error) throw new Error(error.message || 'Could not send the enquiry.');
    if (!data?.ok) throw new Error(data?.error || 'Could not send the enquiry.');
    return data;
  },

  /** Candidate subcontractors: the workspace's CRM companies. */
  async listCompanies(workspaceId: string): Promise<Array<{ id: string; name: string }>> {
    const { data, error } = await supabase
      .from('crm_companies')
      .select('id, name')
      .eq('workspace_id', workspaceId)
      .order('name');
    if (error) throw readable(error);
    return (data ?? []) as Array<{ id: string; name: string }>;
  },

  /** Every bid line on a package, so the rate grid can be filled in per bidder. */
  async bidItems(bidId: string): Promise<Array<{
    id: string; package_item_id: string; quantity: number | null; rate: number | null; amount: number | null;
  }>> {
    const { data, error } = await supabase
      .from('tender_bid_items')
      .select('id, package_item_id, quantity, rate, amount')
      .eq('bid_id', bidId);
    if (error) throw readable(error);
    return (data ?? []) as Array<{
      id: string; package_item_id: string; quantity: number | null; rate: number | null; amount: number | null;
    }>;
  },

  /**
   * Un-invite a subcontractor. Their bid lines go with them (ON DELETE CASCADE).
   *
   * The way out of a bid invited before the package had any items: it has no lines to price, and
   * re-inviting after the items exist seeds them properly.
   */
  async removeBid(id: string): Promise<void> {
    const { error } = await supabase.from('tender_bids').delete().eq('id', id);
    if (error) throw readable(error);
  },

  async removeItem(id: string): Promise<void> {
    const { error } = await supabase.from('tender_package_items').delete().eq('id', id);
    if (error) throw readable(error);
  },

  async removePackage(id: string): Promise<void> {
    const { error } = await supabase.from('tender_packages').delete().eq('id', id);
    if (error) throw readable(error);
  },
};
