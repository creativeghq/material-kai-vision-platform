/**
 * Contracts Tools — agent-chat surface for the Contracts & e-Signature module.
 *
 * ONE tool, actions:
 *   - list — recent contracts (optionally by status/context)
 *   - send — send a DRAFT contract for e-signature (CONFIRM-gated: it emails a signing link)
 *
 * `send` is a real outbound legal action → confirm-gated (Approve/Decline card). Everything runs
 * through the validated contracts-api as the user (JWT), so its auth/scope applies. Module
 * `contracts` + entitlement gated.
 */

const { tool } = await import('npm:@langchain/core@1.1.15/tools');
const { z } = await import('npm:zod@3.24.0');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MODULE_SLUG = 'contracts';

function svcClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

async function moduleReady(workspaceId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const sb = svcClient();
    const { data: mod } = await sb.from('modules').select('enabled').eq('slug', MODULE_SLUG).maybeSingle();
    if (!mod?.enabled) return { ok: false, error: 'The Contracts module is not enabled on this platform.' };
    if (!workspaceId) return { ok: false, error: 'No active workspace for the current user.' };
    const { data: entitled } = await sb.rpc('is_workspace_entitled', { p_workspace_id: workspaceId, p_module_slug: MODULE_SLUG });
    if (entitled !== true) return { ok: false, error: 'This workspace has not activated Contracts. Enable it under Profile → Modules.' };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Contracts availability check failed: ${(e as Error).message}` };
  }
}

/** Call contracts-api as the user (JWT) — its own auth/scope applies. */
async function callContracts(body: Record<string, unknown>, jwt: string | undefined): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/contracts-api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt || SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    let parsed: any = null; try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { ok: resp.ok, status: resp.status, data: parsed, error: resp.ok ? undefined : String(parsed)?.slice(0, 200) };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : 'network error' };
  }
}

export const createManageContractsTool = (
  userId: string,
  workspaceId: string,
  jwt: string | undefined,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ action, status, context, contract_id, confirm, title, counterparty_name, counterparty_email, value, currency }) => {
      const gate = await moduleReady(workspaceId);
      if (!gate.ok) return JSON.stringify({ success: false, error: gate.error });

      if (action === 'list') {
        const r = await callContracts({ action: 'list', workspace_id: workspaceId, status, context }, jwt);
        if (!r.ok) return JSON.stringify({ success: false, error: r.error || `contracts-api ${r.status}` });
        const contracts = r.data?.contracts ?? [];
        onChunk?.({ type: 'contracts_list', workspace_id: workspaceId, contracts, timestamp: Date.now() });
        return JSON.stringify({ success: true, count: contracts.length, contracts: contracts.slice(0, 15) });
      }

      if (action === 'get') {
        if (!contract_id) return JSON.stringify({ success: false, error: 'get needs a contract_id.' });
        const r = await callContracts({ action: 'get', workspace_id: workspaceId, id: contract_id }, jwt);
        if (!r.ok) return JSON.stringify({ success: false, error: r.error || `contracts-api ${r.status}` });
        return JSON.stringify({ success: true, contract: r.data?.contract ?? null, signatures: r.data?.signatures ?? [] });
      }

      if (action === 'create') {
        if (!title) return JSON.stringify({ success: false, error: 'create needs a title.' });
        if (!context) return JSON.stringify({ success: false, error: 'create needs a context (hr | finance | project | realestate).' });
        const r = await callContracts({
          action: 'create', workspace_id: workspaceId, context, title,
          counterparty_name, counterparty_email, value, currency,
        }, jwt);
        if (!r.ok) return JSON.stringify({ success: false, error: r.error || `contracts-api ${r.status}` });
        const c = r.data?.contract;
        onChunk?.({ type: 'contract_created', contract_id: c?.id, title: c?.title, timestamp: Date.now() });
        return JSON.stringify({ success: true, contract: c, message: `Draft contract "${c?.title}" created. Use action=send to email the signing link.` });
      }

      if (action === 'void') {
        if (!contract_id) return JSON.stringify({ success: false, error: 'void needs a contract_id.' });
        const r = await callContracts({ action: 'void', workspace_id: workspaceId, id: contract_id }, jwt);
        if (!r.ok) return JSON.stringify({ success: false, error: r.error || `contracts-api ${r.status}` });
        return JSON.stringify({ success: true, voided: true, contract_id });
      }

      if (action === 'send') {
        if (!contract_id) return JSON.stringify({ success: false, error: 'send needs a contract_id (a draft contract).' });
        // Load for a meaningful preview + status check.
        const got = await callContracts({ action: 'get', workspace_id: workspaceId, id: contract_id }, jwt);
        if (!got.ok) return JSON.stringify({ success: false, error: got.error || `contracts-api ${got.status}` });
        const c = got.data?.contract;
        if (!c) return JSON.stringify({ success: false, error: 'contract not found in this workspace' });

        // HUMAN-IN-THE-LOOP GATE (#275 / invariant #9): sending for signature is outbound + legal.
        if (confirm !== true) {
          onChunk?.({
            type: 'action_confirmation',
            tool: 'manage_contracts',
            input: { action: 'send', contract_id },
            title: 'Send this contract for signature?',
            summary: `Send "${c.title || 'contract'}" for e-signature — the counterparty gets an emailed signing link. Status: ${c.status}.`,
            danger: true,
            toolkit_id: 'contracts',
            timestamp: Date.now(),
          });
          return JSON.stringify({ success: true, awaiting_confirmation: true, message: 'Awaiting the user\'s approval to send this contract. Do not retry.' });
        }

        const sent = await callContracts({ action: 'send', workspace_id: workspaceId, id: contract_id }, jwt);
        if (!sent.ok) return JSON.stringify({ success: false, error: sent.error || `contracts-api ${sent.status}` });
        onChunk?.({ type: 'contract_sent', contract_id, sign_path: sent.data?.sign_path, timestamp: Date.now() });
        return JSON.stringify({ success: true, sent: true, contract_id, sign_path: sent.data?.sign_path });
      }

      return JSON.stringify({ success: false, error: `unknown action: ${action}` });
    },
    {
      name: 'manage_contracts',
      description:
        'Contracts & e-signature: list/get contracts, create a draft, void a contract, and send a DRAFT '
        + 'for signature. CREATE makes a draft (then use SEND). SENDING emails the counterparty a signing '
        + 'link — it ALWAYS asks the user to Approve/Decline first (never set confirm:true yourself; the UI '
        + 'sets it on approval).',
      schema: z.object({
        action: z.enum(['list', 'get', 'create', 'void', 'send']).default('list'),
        status: z.string().optional().describe('list: filter by status (draft/sent/signed/…).'),
        context: z.enum(['hr', 'finance', 'project', 'realestate']).optional().describe('list: filter by context. create: the contract context (required).'),
        contract_id: z.string().optional().describe('get/void/send: the contract UUID.'),
        title: z.string().optional().describe('create: the contract title (required).'),
        counterparty_name: z.string().optional().describe('create: the other party\'s name.'),
        counterparty_email: z.string().optional().describe('create: the other party\'s email (used to email the signing link on send).'),
        value: z.number().optional().describe('create: optional contract value.'),
        currency: z.string().optional().describe('create: optional currency (e.g. EUR).'),
        confirm: z.boolean().optional().describe('Do NOT set — the Approve/Decline card sets confirm:true on approval.'),
      }),
    },
  );
};
