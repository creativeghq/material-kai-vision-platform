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
      .select('id, package_id, company_id, status, submitted_at, notes')
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
      .select('id, package_id, company_id, status, submitted_at, notes')
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

  async removePackage(id: string): Promise<void> {
    const { error } = await supabase.from('tender_packages').delete().eq('id', id);
    if (error) throw readable(error);
  },
};
