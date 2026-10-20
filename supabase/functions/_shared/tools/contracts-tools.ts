/** Contracts Tools — agent-chat surface for the Contracts & e-Signature module. */

// `tool` is typed non-generically ON PURPOSE. Inferring it pulls @langchain/core's generic
// graph into every module that defines a tool, and that instantiation — not file size — is what
// makes agent-chat exceed 12 GB and drop out of the edge typecheck gate entirely (inbox-api is a
// comparable 2.8k lines and checks fine). Erasing it here costs the `tool()` config shape, which
// `npm run tools:manifest` + tests/unit/toolkitCoverage.test.ts already enforce from the AST, and
// buys a compiler over the tool bodies, which nothing had before.
const { tool } = await import('npm:@langchain/core@1.2.9/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  // Return stays `any`: consumers pass these to bindTools()/registerTools(), and narrowing it
  // to `unknown` would break them. The INPUT is what we want typed, and S gives us that.
  ) => any;
};
const { z } = await import('npm:zod@3.25.76');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MODULE_SLUG = 'contracts';

import { serviceClient as svcClient } from '../supabase-client.ts';
import { describeUpstreamError } from '../tool-result-shape.ts';
import { CONTRACT_CONTEXTS } from '../contractVocabulary.generated.ts';
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
    return { ok: resp.ok, status: resp.status, data: parsed, error: resp.ok ? undefined : describeUpstreamError(resp.status, parsed) };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : 'network error' };
  }
}

const contractSummary = (c: any) => c ? ({
  id: c.id, title: c.title, status: c.status, context: c.context, contract_type: c.contract_type,
  counterparty_name: c.counterparty_name, counterparty_email: c.counterparty_email,
  value: c.value, currency: c.currency, effective_date: c.effective_date, expiry_date: c.expiry_date,
  sent_at: c.sent_at, signed_at: c.signed_at, created_at: c.created_at,
}) : null;

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
        const all = r.data?.contracts ?? [];
        const contracts = all.slice(0, 15).map(contractSummary);
        onChunk?.({ type: 'contracts_list', workspace_id: workspaceId, contracts, total: all.length, timestamp: Date.now() });
        return JSON.stringify({
          success: true, count: all.length, shown: contracts.length, total: all.length, contracts,
          message: all.length > contracts.length ? `Showing the ${contracts.length} most recent of ${all.length} contracts.` : `${all.length} contract${all.length === 1 ? '' : 's'}.`,
        });
      }

      if (action === 'get') {
        if (!contract_id) return JSON.stringify({ success: false, error: 'get needs a contract_id.' });
        const r = await callContracts({ action: 'get', workspace_id: workspaceId, id: contract_id }, jwt);
        if (!r.ok) return JSON.stringify({ success: false, error: r.error || `contracts-api ${r.status}` });
        const signatures = (r.data?.signatures ?? []).map((s: any) => ({ signer_name: s.signer_name, signer_role: s.signer_role, signed_at: s.signed_at }));
        return JSON.stringify({ success: true, contract: contractSummary(r.data?.contract), signatures });
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
        return JSON.stringify({
          success: true, contract: contractSummary(c),
          message: `Draft contract "${c?.title}" created. It has not been sent for signature yet.`,
          next_step: 'To email the signing link, call manage_contracts action=send with this contract id; the user approves first.',
        });
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

        // HUMAN-IN-THE-LOOP GATE (invariant #9): sending for signature is outbound + legal.
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
        return JSON.stringify({
          success: true, sent: true, contract_id, emailed: sent.data?.emailed ?? null,
          message: sent.data?.emailed ? 'Sent: the counterparty has been emailed a signing link.' : 'Sent for signature. The signing link is on the card for the user to share.',
        });
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
        context: z.enum(CONTRACT_CONTEXTS).optional().describe('list: filter by context. create: the contract context (required).'),
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
