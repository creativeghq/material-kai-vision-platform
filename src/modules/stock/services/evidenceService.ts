/**
 * Proof of delivery, goods-receipt inspection and the claim it produces (#424, #440).
 *
 * Deliberately NOT wired to invoicing: stamping an invoice on delivery or pick completion puts the
 * myDATA filing downstream of a driver's phone on a flaky network, which is anti-regression rule
 * 4's create-then-stamp pair with a mobile signal in the middle.
 */
import { supabase } from '@/integrations/supabase/client';

import type {
  DeliveryProof, ReceiptInspection, DeliveryOutcome, Disposition, ClaimResolution,
} from '@/modules/stock/evidenceRules';

export type {
  DeliveryOutcome, Disposition, ClaimResolution, DeliveryProof, ReceiptInspection,
} from '@/modules/stock/evidenceRules';
export {
  DELIVERY_OUTCOME_LABEL, DISPOSITION_LABEL, CLAIM_RESOLUTION_LABEL,
  deliveryFellShort, outcomeNeedsPhoto, inspectionStartsClaim, quantitiesAgree,
} from '@/modules/stock/evidenceRules';

export interface EvidencePhoto {
  id: string;
  subject: 'delivery_proof' | 'receipt_inspection';
  subject_id: string;
  storage_bucket: string;
  storage_object_path: string;
  caption: string | null;
  taken_at: string;
}

export interface SupplierClaim {
  id: string;
  workspace_id: string;
  supplier_company_id: string | null;
  order_id: string | null;
  inspection_id: string | null;
  status: 'draft' | 'submitted' | 'accepted' | 'rejected' | 'written_off';
  resolution: ClaimResolution | null;
  claimed_amount: number | null;
  settled_amount: number | null;
  reference: string | null;
}

export const evidenceService = {
  async proofsForOrder(orderId: string): Promise<DeliveryProof[]> {
    const { data, error } = await supabase
      .from('delivery_proofs')
      .select('*')
      .eq('order_id', orderId)
      .order('delivered_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as DeliveryProof[];
  },

  async recordProof(p: {
    workspaceId: string;
    orderId?: string | null;
    deliveryNoteId?: string | null;
    outcome: DeliveryOutcome;
    recipientName?: string | null;
    notes?: string | null;
  }) {
    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('delivery_proofs').insert({
      workspace_id: p.workspaceId,
      order_id: p.orderId ?? null,
      delivery_note_id: p.deliveryNoteId ?? null,
      outcome: p.outcome,
      recipient_name: p.recipientName ?? null,
      notes: p.notes ?? null,
      driver_user_id: auth?.user?.id ?? null,
    }).select('*').single();
    if (error) throw error;
    return data as DeliveryProof;
  },

  async photosFor(subject: EvidencePhoto['subject'], subjectId: string): Promise<EvidencePhoto[]> {
    const { data, error } = await supabase
      .from('evidence_photos')
      .select('*')
      .eq('subject', subject)
      .eq('subject_id', subjectId)
      .order('taken_at');
    if (error) throw error;
    return (data ?? []) as EvidencePhoto[];
  },

  async inspectionsForOrder(orderId: string): Promise<ReceiptInspection[]> {
    const { data, error } = await supabase
      .from('receipt_inspections')
      .select('*')
      .eq('order_id', orderId)
      .order('inspected_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as ReceiptInspection[];
  },

  async recordInspection(i: {
    workspaceId: string;
    orderId: string;
    orderItemId?: string | null;
    received: number | null;
    accepted: number | null;
    rejected: number | null;
    disposition?: Disposition | null;
    notes?: string | null;
  }) {
    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('receipt_inspections').insert({
      workspace_id: i.workspaceId,
      order_id: i.orderId,
      order_item_id: i.orderItemId ?? null,
      received_quantity: i.received,
      accepted_quantity: i.accepted,
      rejected_quantity: i.rejected,
      disposition: i.disposition ?? null,
      notes: i.notes ?? null,
      inspected_by: auth?.user?.id ?? null,
    }).select('*').single();
    if (error) throw error;
    return data as ReceiptInspection;
  },

  async claimsForOrder(orderId: string): Promise<SupplierClaim[]> {
    const { data, error } = await supabase
      .from('supplier_claims')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as SupplierClaim[];
  },

  /**
   * Raise the claim the inspection exists to produce.
   *
   * `write_off` is a real resolution and a distinct one: it records US absorbing it, which is what
   * stops a silent absorption looking like a settled claim.
   */
  async raiseClaim(c: {
    workspaceId: string;
    orderId: string;
    inspectionId: string;
    supplierCompanyId?: string | null;
    claimedAmount?: number | null;
    resolution?: ClaimResolution | null;
  }) {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from('supplier_claims').insert({
      workspace_id: c.workspaceId,
      order_id: c.orderId,
      inspection_id: c.inspectionId,
      supplier_company_id: c.supplierCompanyId ?? null,
      claimed_amount: c.claimedAmount ?? null,
      resolution: c.resolution ?? null,
      status: 'draft',
      created_by: auth?.user?.id ?? null,
    });
    if (error) throw error;
  },

  /** What this delivery weighs, so a lorry is not loaded to an unknown. */
  async deliveryWeight(orderId: string) {
    const { data, error } = await supabase.rpc('delivery_weight' as never, {
      p_order: orderId,
    } as never);
    if (error) throw error;
    return data as unknown as {
      status: 'complete' | 'partial' | 'no_lines' | 'not_found';
      weight_kg?: number; lines?: number; unweighed_lines?: number; reason: string;
    };
  },
};
