// Client for the contracts-api edge function. One entity, three contexts (hr | finance | project).
// Authed management actions carry workspace_id (the edge gate needs it); the public sign page
// uses resolveToken / sign with just the token.
import { supabase } from '@/integrations/supabase/client';
import { edgeErrorMessage } from '@/utils/edgeError';

// One source (#391). Re-exported so every existing import from this service keeps working.
export { CONTRACT_CONTEXTS, isContractContext } from './contracts/contractVocabulary';
export type { ContractContext } from './contracts/contractVocabulary';

// Also imported: a re-export does not bind the name locally.
import type { ContractContext } from './contracts/contractVocabulary';
export type ContractStatus = 'draft' | 'sent' | 'signed' | 'declined' | 'void' | 'expired';

export interface Contract {
  id: string;
  workspace_id: string;
  context: ContractContext;
  contract_type: string | null;
  title: string;
  body_markdown: string | null;
  status: ContractStatus;
  currency: string | null;
  value: number | null;
  effective_date: string | null;
  expiry_date: string | null;
  hr_employee_id: string | null;
  customer_company_id: string | null;
  supplier_company_id: string | null;
  order_id: string | null;
  quote_id: string | null;
  project_id: string | null;
  property_id: string | null;
  counterparty_name: string | null;
  counterparty_email: string | null;
  sign_token: string | null;
  sign_token_expires_at: string | null;
  sent_at: string | null;
  signed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContractSignature {
  id: string;
  signer_name: string;
  signer_email: string | null;
  signer_role: string | null;
  signature_image: string | null;
  signed_at: string;
  ip: string | null;
}

export interface CreateContractInput {
  context: ContractContext;
  title: string;
  contract_type?: string;
  body_markdown?: string;
  currency?: string;
  value?: number;
  effective_date?: string;
  expiry_date?: string;
  counterparty_name?: string;
  counterparty_email?: string;
  // subject (one, matching context)
  hr_employee_id?: string;
  customer_company_id?: string;
  supplier_company_id?: string;
  order_id?: string;
  quote_id?: string;
  project_id?: string;
  property_id?: string;
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('contracts-api', { body });
  if (error) throw new Error(await edgeErrorMessage(error, 'Contract request failed'));
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export const contractsService = {
  async list(workspaceId: string, opts: { context?: ContractContext; status?: ContractStatus } & Partial<Pick<Contract, 'hr_employee_id' | 'customer_company_id' | 'supplier_company_id' | 'order_id' | 'quote_id' | 'project_id' | 'property_id'>> = {}): Promise<Contract[]> {
    const { contracts } = await call<{ contracts: Contract[] }>({ action: 'list', workspace_id: workspaceId, ...opts });
    return contracts;
  },

  async get(workspaceId: string, id: string): Promise<{ contract: Contract; signatures: ContractSignature[] }> {
    return call<{ contract: Contract; signatures: ContractSignature[] }>({ action: 'get', workspace_id: workspaceId, id });
  },

  async create(workspaceId: string, input: CreateContractInput): Promise<Contract> {
    const { contract } = await call<{ contract: Contract }>({ action: 'create', workspace_id: workspaceId, ...input });
    return contract;
  },

  async update(workspaceId: string, id: string, patch: Partial<CreateContractInput>): Promise<Contract> {
    const { contract } = await call<{ contract: Contract }>({ action: 'update', workspace_id: workspaceId, id, ...patch });
    return contract;
  },

  async send(workspaceId: string, id: string): Promise<{ contract: Contract; sign_token: string; sign_path: string }> {
    return call<{ contract: Contract; sign_token: string; sign_path: string }>({ action: 'send', workspace_id: workspaceId, id });
  },

  async void(workspaceId: string, id: string): Promise<Contract> {
    const { contract } = await call<{ contract: Contract }>({ action: 'void', workspace_id: workspaceId, id });
    return contract;
  },

  /** Render the contract (terms + signatures) to a PDF and return a fresh signed URL to download. */
  async generatePdf(contractId: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke('generate-contract-pdf', { body: { contract_id: contractId } });
    if (error) throw new Error(await edgeErrorMessage(error));
    if (!data?.success || !data?.url) throw new Error(data?.error || 'Could not generate the contract PDF.');
    return data.url as string;
  },

  // ── Public (signer page) ──
  async resolveToken(token: string): Promise<{ contract?: { title: string; body_markdown: string | null; counterparty_name: string | null; effective_date: string | null; expiry_date: string | null }; not_found?: boolean; signed?: boolean }> {
    return call({ action: 'resolve_token', token });
  },

  async sign(token: string, input: { signer_name: string; signer_email?: string; signature_image?: string }): Promise<{ success: boolean; contract_id: string }> {
    return call<{ success: boolean; contract_id: string }>({ action: 'sign', token, ...input });
  },
};
