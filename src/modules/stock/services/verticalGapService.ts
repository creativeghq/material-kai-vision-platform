/**
 * Forward contracts, processing jobs, holds, supplier standing and price-only updates (#442).
 *
 * Every verdict is derived in SQL. Released quantity in particular is derived from the purchase
 * lines that draw on a commitment, never stored on the contract — a second copy is one that drifts.
 */
import { supabase } from '@/integrations/supabase/client';

import type {
  BlanketPosition, HoldPosition, Scorecard, PriceUpdateResult, ProcessingStatus,
} from '@/modules/stock/verticalGapRules';

export type {
  BlanketStatus, HoldVerdict, HoldStatus, ProcessingStatus, SupplierStanding, ScorecardStatus,
  BlanketLine, BlanketPosition, HoldRow, HoldPosition, ScorecardRow, Scorecard, PriceUpdateResult,
} from '@/modules/stock/verticalGapRules';
export {
  BLANKET_LABEL, HOLD_VERDICT_LABEL, PROCESSING_LABEL, STANDING_LABEL,
  releaseIsOverCommitment, blanketNeedsAttention, holdNeedsAttention, holdIsLapsed,
  jobYieldsOffcut, supplierIsUnscored, scorecardIsReadable, weightsAreComplete, priceRowIsClean,
  PRICE_UPDATE_FIELDS, EXPIRY_IS_MANDATORY, NOTHING_AUTO_RELEASES, OUTWORKER_IS_A_PLACE,
  PRICE_ONLY_DISCIPLINE, ETIM_NOTE,
} from '@/modules/stock/verticalGapRules';

export interface BlanketOrderRow {
  id: string;
  reference: string | null;
  supplier_company_id: string | null;
  status: string;
  starts_on: string;
  ends_on: string | null;
  allowance_percent: number;
}

export interface ProcessingJob {
  id: string;
  order_id: string | null;
  input_pool_id: string | null;
  input_quantity: number | null;
  output_quantity: number | null;
  offcut_pool_id: string | null;
  offcut_quantity: number | null;
  outworker_company_id: string | null;
  processing_cost: number | null;
  status: ProcessingStatus;
  sent_on: string | null;
  returned_on: string | null;
}

export const verticalGapService = {
  async blanketOrders(workspaceId: string): Promise<BlanketOrderRow[]> {
    const { data, error } = await supabase
      .from('blanket_orders')
      .select('id, reference, supplier_company_id, status, starts_on, ends_on, allowance_percent')
      .eq('workspace_id', workspaceId)
      .order('starts_on', { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as BlanketOrderRow[];
  },

  async blanketPosition(blanketOrderId: string): Promise<BlanketPosition> {
    const { data, error } = await supabase.rpc('blanket_order_position' as never, {
      p_blanket: blanketOrderId,
    } as never);
    if (error) throw error;
    return data as unknown as BlanketPosition;
  },

  async createBlanketOrder(input: {
    workspaceId: string; supplierCompanyId?: string | null; reference?: string | null;
    endsOn?: string | null; allowancePercent?: number;
  }): Promise<string> {
    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('blanket_orders').insert({
      workspace_id: input.workspaceId,
      supplier_company_id: input.supplierCompanyId ?? null,
      reference: input.reference ?? null,
      ends_on: input.endsOn ?? null,
      allowance_percent: input.allowancePercent ?? 0,
      status: 'active',
      created_by: auth?.user?.id ?? null,
    }).select('id').single();
    if (error) throw error;
    return data.id as string;
  },

  async addBlanketLine(input: {
    blanketOrderId: string; productId?: string | null; description: string;
    quantity: number; unit?: string | null; unitPrice?: number | null;
  }): Promise<void> {
    const { error } = await supabase.from('blanket_order_lines').insert({
      blanket_order_id: input.blanketOrderId,
      product_id: input.productId ?? null,
      description: input.description,
      quantity: input.quantity,
      unit: input.unit ?? null,
      unit_price: input.unitPrice ?? null,
    });
    if (error) throw error;
  },

  async holds(workspaceId: string): Promise<HoldPosition> {
    const { data, error } = await supabase.rpc('stock_hold_position' as never, {
      p_workspace: workspaceId,
    } as never);
    if (error) throw error;
    return data as unknown as HoldPosition;
  },

  async placeHold(input: {
    workspaceId: string; poolId?: string | null; itemId?: string | null;
    quantity: number; unit?: string | null; heldForName?: string | null;
    heldForCompanyId?: string | null; expiresOn: string;
  }): Promise<void> {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from('stock_holds').insert({
      workspace_id: input.workspaceId,
      pool_id: input.poolId ?? null,
      item_id: input.itemId ?? null,
      quantity: input.quantity,
      unit: input.unit ?? null,
      held_for_name: input.heldForName ?? null,
      held_for_company_id: input.heldForCompanyId ?? null,
      expires_on: input.expiresOn,
      created_by: auth?.user?.id ?? null,
    });
    if (error) throw error;
  },

  /** Releasing is a DECISION somebody makes. Nothing expires a hold on its own. */
  async releaseHold(holdId: string): Promise<void> {
    const { error } = await supabase.from('stock_holds').update({
      status: 'released',
      released_on: new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString(),
    }).eq('id', holdId).eq('status', 'active');
    if (error) throw error;
  },

  async processingJobs(workspaceId: string): Promise<ProcessingJob[]> {
    const { data, error } = await supabase
      .from('processing_jobs')
      .select('id, order_id, input_pool_id, input_quantity, output_quantity, offcut_pool_id, offcut_quantity, outworker_company_id, processing_cost, status, sent_on, returned_on')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as ProcessingJob[];
  },

  async saveProcessingJob(input: {
    workspaceId: string; inputPoolId?: string | null; inputQuantity?: number | null;
    outputQuantity?: number | null; offcutPoolId?: string | null; offcutQuantity?: number | null;
    outworkerCompanyId?: string | null; processingCost?: number | null;
    status?: ProcessingStatus;
  }): Promise<void> {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from('processing_jobs').insert({
      workspace_id: input.workspaceId,
      input_pool_id: input.inputPoolId ?? null,
      input_quantity: input.inputQuantity ?? null,
      output_quantity: input.outputQuantity ?? null,
      offcut_pool_id: input.offcutPoolId ?? null,
      offcut_quantity: input.offcutQuantity ?? null,
      outworker_company_id: input.outworkerCompanyId ?? null,
      processing_cost: input.processingCost ?? null,
      status: input.status ?? 'planned',
      created_by: auth?.user?.id ?? null,
    });
    if (error) throw error;
  },

  async scorecard(workspaceId: string, from?: string, to?: string): Promise<Scorecard> {
    const { data, error } = await supabase.rpc('supplier_scorecard' as never, {
      p_workspace: workspaceId, p_from: from ?? null, p_to: to ?? null,
    } as never);
    if (error) throw error;
    return data as unknown as Scorecard;
  },

  async setCriterionWeight(workspaceId: string, criterion: string, weight: number): Promise<void> {
    const { error } = await supabase.from('supplier_scorecard_criteria').upsert({
      workspace_id: workspaceId, criterion, weight,
    }, { onConflict: 'workspace_id,criterion' });
    if (error) throw error;
  },

  /** Prices only. A row carrying anything else is refused whole, not quietly trimmed. */
  async applyPriceUpdate(
    workspaceId: string, supplierCompanyId: string, rows: Record<string, unknown>[],
  ): Promise<PriceUpdateResult> {
    const { data, error } = await supabase.rpc('apply_supplier_price_update' as never, {
      p_workspace: workspaceId, p_supplier: supplierCompanyId, p_rows: rows,
    } as never);
    if (error) throw error;
    return data as unknown as PriceUpdateResult;
  },
};
