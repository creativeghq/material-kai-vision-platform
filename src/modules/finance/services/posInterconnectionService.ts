/**
 * Reads the interconnection verdicts and records the approvals (#448).
 *
 * Every verdict is derived in SQL; nothing here restates a rule. The one write goes through
 * `pos_record_payment_result`, which refuses a payment on a document that has not been issued and
 * filed, and replays a repeated approval instead of booking it twice.
 */
import { supabase } from '@/integrations/supabase/client';

import type {
  InterconnectionPosition, DeclarationPosition, SignatureQueue, PaymentGate,
  WholesaleCardPosition, InterconnectionRoute,
} from '@/modules/finance/posInterconnectionRules';

export type {
  InterconnectionStatus, TerminalVerdict, InterconnectionRoute, DeclarationStatus,
  SignatureVerdict, SignatureQueueStatus, PaymentGateCode, WholesaleCardStatus,
  TerminalRow, InterconnectionPosition, DeclarationModel, DeclarationRow, DeclarationPosition,
  SignatureRow, SignatureQueue, PaymentGate, WholesaleCardPosition,
} from '@/modules/finance/posInterconnectionRules';
export {
  INTERCONNECTION_LABEL, TERMINAL_VERDICT_LABEL, ROUTE_LABEL, DECLARATION_LABEL,
  SIGNATURE_VERDICT_LABEL, MATCHING_WINDOW_HOURS, AUTONOMY_RULE, BRANCH_IS_IDENTITY,
  EFTPOS_PREPAYMENT_CODE, EFTPOS_RECEIPT_TYPE,
  interconnectionNeedsAttention, interconnectionIsBreach, declarationNeedsAttention,
  signatureQueueNeedsAttention, needsUnderIssuanceFlag, paymentIsBlocked, wholesaleReceiptMissing,
} from '@/modules/finance/posInterconnectionRules';

export interface TerminalPatch {
  nsp_name?: string | null;
  pos_model?: string | null;
  acquirer_id?: string | null;
  fim_registry_number?: string | null;
  interconnection_route?: InterconnectionRoute | null;
  is_interconnected?: boolean;
  interconnected_on?: string | null;
  handles_retail?: boolean;
  handles_wholesale?: boolean;
  supports_iris?: boolean;
  is_food_service?: boolean;
}

export interface PosResultInput {
  card_type?: string;
  txn_type?: string;
  cardpan_masked?: string;
  amount?: number;
  amount_final?: number;
  amount_tip?: number;
  amount_loyalty?: number;
  amount_cashback?: number;
  acquirer_id?: string;
  terminal_id?: string;
  batch_num?: string;
  stan?: string;
  rrn?: string;
  auth_code?: string;
  trans_datetime?: string;
  txn_ecr_status?: string;
  session_number?: string;
  rsp_code?: string;
}

export const posInterconnectionService = {
  async position(workspaceId: string): Promise<InterconnectionPosition> {
    const { data, error } = await supabase.rpc('pos_interconnection_position' as never, {
      p_workspace: workspaceId,
    } as never);
    if (error) throw error;
    return data as unknown as InterconnectionPosition;
  },

  async declarations(workspaceId: string): Promise<DeclarationPosition> {
    const { data, error } = await supabase.rpc('erp_declaration_position' as never, {
      p_workspace: workspaceId,
    } as never);
    if (error) throw error;
    return data as unknown as DeclarationPosition;
  },

  async signatureQueue(workspaceId: string): Promise<SignatureQueue> {
    const { data, error } = await supabase.rpc('pos_signature_position' as never, {
      p_workspace: workspaceId,
    } as never);
    if (error) throw error;
    return data as unknown as SignatureQueue;
  },

  async paymentGate(invoiceId: string): Promise<PaymentGate> {
    const { data, error } = await supabase.rpc('pos_payment_may_complete' as never, {
      p_invoice_id: invoiceId,
    } as never);
    if (error) throw error;
    return data as unknown as PaymentGate;
  },

  async wholesaleCard(invoiceId: string): Promise<WholesaleCardPosition> {
    const { data, error } = await supabase.rpc('pos_wholesale_card_position' as never, {
      p_invoice_id: invoiceId,
    } as never);
    if (error) throw error;
    return data as unknown as WholesaleCardPosition;
  },

  async updateTerminal(id: string, patch: TerminalPatch): Promise<void> {
    const { error } = await supabase.from('pos_terminals').update(patch).eq('id', id);
    if (error) throw error;
  },

  async saveDeclaration(input: {
    workspaceId: string;
    softwareName: string;
    softwareVersion: string;
    firstReleasedOn?: string | null;
    testingCompletedOn?: string | null;
    filedWithAadeOn?: string | null;
    aadeReference?: string | null;
    coversIris?: boolean;
  }): Promise<void> {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from('erp_compatibility_declarations').upsert({
      workspace_id: input.workspaceId,
      software_name: input.softwareName,
      software_version: input.softwareVersion,
      first_released_on: input.firstReleasedOn || null,
      testing_completed_on: input.testingCompletedOn || null,
      filed_with_aade_on: input.filedWithAadeOn || null,
      aade_reference: input.aadeReference || null,
      covers_iris: input.coversIris ?? false,
      created_by: auth?.user?.id ?? null,
    }, { onConflict: 'workspace_id,software_name,software_version' });
    if (error) throw error;
  },

  async addDeclaredModel(declarationId: string, nspName: string, posModel: string, testedOn?: string | null): Promise<void> {
    const { error } = await supabase.from('erp_declaration_terminals').upsert({
      declaration_id: declarationId,
      nsp_name: nspName,
      pos_model: posModel,
      tested_on: testedOn || null,
    }, { onConflict: 'declaration_id,nsp_name,pos_model' });
    if (error) throw error;
  },

  /** One writer for "record the approval and close the signature". The server refuses if the
   *  document is not issued and filed, and replays a repeated approval. */
  async recordResult(input: {
    workspaceId: string;
    invoiceId: string;
    signatureId: string | null;
    terminalRowId: string | null;
    result: PosResultInput;
  }): Promise<{ result_id: string; payment_identity: string | null; replayed: boolean; reason: string }> {
    const { data, error } = await supabase.rpc('pos_record_payment_result' as never, {
      p_workspace: input.workspaceId,
      p_invoice_id: input.invoiceId,
      p_signature_id: input.signatureId,
      p_terminal_row_id: input.terminalRowId,
      p_result: input.result,
    } as never);
    if (error) throw error;
    return data as unknown as { result_id: string; payment_identity: string | null; replayed: boolean; reason: string };
  },
};
