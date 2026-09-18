/** Novus e-invoicing onboarding. Every verdict is derived by `get_einvoice_onboarding` in SQL. */
import { supabase } from '@/integrations/supabase/client';
import { parseEdgeError } from '@/utils/edgeError';

export type OnboardingStepState =
  | 'done'
  | 'self_reported'
  | 'awaiting_confirmation'
  | 'waiting'
  | 'todo'
  | 'pending'
  | 'blocked'
  | 'failed'
  | 'not_applicable';

export type StepConfirmedBy = 'novus' | 'self_reported' | 'data' | null;

export type AckAction = 'contract_delivered' | 'contract_signed' | 'statement_accepted';

export interface EInvoiceOnboardingStep {
  key: string;
  title: string;
  detail: string;
  actor: 'you' | 'novus' | 'aade';
  manual: boolean;
  ack_action: AckAction | null;
  acknowledged_at: string | null;
  state: OnboardingStepState;
  confirmed_by: StepConfirmedBy;
  note: string | null;
  substeps?: Record<string, string | null> | null;
}

export interface EInvoiceOnboarding {
  workspace_id: string;
  exists: boolean;
  overall: 'not_started' | 'in_progress' | 'active' | 'attention';
  request_id: string | null;
  request_type: 'NEW_CONTRACT' | 'LINK_EXISTING' | null;
  status: string | null;
  message: string | null;
  contract_number: string | null;
  contract_signed_version: number | null;
  provisioning_status: string | null;
  aade_statement_status: string | null;
  can_transmit: boolean;
  is_sandbox: boolean;
  prerequisites_missing: string[];
  last_synced_at: string | null;
  sync_error: string | null;
  steps: EInvoiceOnboardingStep[];
  warning?: string;
}

export interface ApplicationDraft {
  administrator_full_name: string;
  administrator_vat: string;
  transaction_types: ('B2B' | 'B2C')[];
  isp_provider_name: string;
  isp_contract_number: string;
  isp_contract_date: string | null;
  contact_backup_phone: string;
}

async function call(body: Record<string, unknown>): Promise<EInvoiceOnboarding> {
  const { data, error } = await supabase.functions.invoke('novus-onboarding', { body });
  if (error) throw new Error((await parseEdgeError(error)).message);
  if (!data?.success) throw new Error(data?.error ?? 'The onboarding service refused that.');
  return { ...(data.data as EInvoiceOnboarding), warning: data.warning };
}

export const einvoiceOnboardingService = {
  status(workspaceId: string) {
    return call({ action: 'status', workspace_id: workspaceId });
  },

  saveApplication(workspaceId: string, draft: Partial<ApplicationDraft>) {
    return call({ action: 'save_application', workspace_id: workspaceId, ...draft });
  },

  create(workspaceId: string) {
    return call({ action: 'create', workspace_id: workspaceId });
  },

  /** A human says they did a manual step. Where Novus can answer, the rung stays "awaiting". */
  acknowledge(workspaceId: string, step: AckAction, undo = false) {
    return call({ action: 'acknowledge', workspace_id: workspaceId, step, undo });
  },

  cancel(workspaceId: string, reason?: string) {
    return call({ action: 'cancel', workspace_id: workspaceId, reason });
  },

  async downloadContract(workspaceId: string, kind: 'unsigned' | 'signed' = 'unsigned'): Promise<Blob> {
    const { data, error } = await supabase.functions.invoke('novus-onboarding', {
      body: { action: 'contract', workspace_id: workspaceId, kind },
    });
    if (error) throw new Error((await parseEdgeError(error)).message);
    if (data instanceof Blob) return data;
    throw new Error(typeof data?.error === 'string' ? data.error : 'Novus did not return a PDF.');
  },

  async uploadSigned(workspaceId: string, file: File): Promise<EInvoiceOnboarding> {
    const form = new FormData();
    form.append('action', 'upload_signed');
    form.append('workspace_id', workspaceId);
    form.append('contractFile', file);
    const { data, error } = await supabase.functions.invoke('novus-onboarding', { body: form });
    if (error) throw new Error((await parseEdgeError(error)).message);
    if (!data?.success) throw new Error(data?.error ?? 'Novus refused the upload.');
    return { ...(data.data as EInvoiceOnboarding), warning: data.warning };
  },
};
