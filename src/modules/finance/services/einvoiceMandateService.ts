/**
 * Reads the e-invoicing compliance position and records the filing behind it (#444).
 *
 * Both verdicts are derived in SQL. Counting compliance in the client put the number and the rule
 * in different places, and this is the one number where a plausible clean answer is the failure.
 */
import { supabase } from '@/integrations/supabase/client';

import type { MandatePosition, InboundPosition } from '@/modules/finance/einvoiceMandateRules';

export type {
  MandateStatus, InboundStatus, IssuanceChannel, MandatePosition, InboundPosition,
} from '@/modules/finance/einvoiceMandateRules';
export {
  MANDATE_LABEL, INBOUND_LABEL, CHANNEL_LABEL, declarationIsFiled, mandateNeedsAttention,
  fallbackIsIncident, inboundNeedsAttention, pullIsNotAcceptance, ERP_IS_NON_ISSUANCE,
  DECLARATION_IS_AN_OPERATOR_ACTION, VIDA_FROM, ONE_DERIVATION_TWO_SERIALISATIONS, MANDATE_SCOPE,
  NOVUS_FIELD_DIVERGENCE, AADE_FIELD_SPELLING,
} from '@/modules/finance/einvoiceMandateRules';

export interface OpenOutage {
  id: string;
  started_at: string;
  detail: string | null;
}

export const einvoiceMandateService = {
  async position(workspaceId: string): Promise<MandatePosition> {
    const { data, error } = await supabase.rpc('einvoice_mandate_position' as never, {
      p_workspace: workspaceId,
    } as never);
    if (error) throw error;
    return data as unknown as MandatePosition;
  },

  async inbound(workspaceId: string): Promise<InboundPosition> {
    const { data, error } = await supabase.rpc('inbound_einvoice_position' as never, {
      p_workspace: workspaceId,
    } as never);
    if (error) throw error;
    return data as unknown as InboundPosition;
  },

  async openOutage(workspaceId: string): Promise<OpenOutage | null> {
    const { data, error } = await supabase
      .from('fiscal_outage_events')
      .select('id, started_at, detail')
      .eq('workspace_id', workspaceId)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    return ((data ?? [])[0] ?? null) as OpenOutage | null;
  },

  /** The filing itself happens at AADE. This records that a person did it, and when from. */
  async recordDeclaration(workspaceId: string, filedOn: string, startDate: string): Promise<void> {
    const { error } = await supabase
      .from('finance_settings')
      .update({
        einvoice_start_declaration_filed_on: filedOn,
        einvoice_start_date: startDate,
      })
      .eq('workspace_id', workspaceId);
    if (error) throw error;
  },
};
