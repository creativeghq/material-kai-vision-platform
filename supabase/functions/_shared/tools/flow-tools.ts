// Flows toolkit. Lets a workspace owner create/list/toggle/remove SIMPLE automations
// through chat (mirrors manage_job_sites), writing real workspace-scoped rows to the flows
// table via the SECURITY DEFINER RPCs create_simple_flow / delete_simple_flow /
// toggle_simple_flow. The tenant-safe trigger/action vocabulary is enforced SERVER-SIDE in
// those RPCs — the UI/tool restriction is not the security line.
// SECURITY:
//  • Gated on isModuleEnabled('flows-toolkit') [global publish] + is_workspace_entitled
//    [per-workspace paid grant]. Both fail closed.
//  • All writes run through a JWT-scoped client so the RPC's assert_workspace_member (auth.uid)
//    enforces membership and RLS applies — a caller can only touch their own workspace's flows.
//  • Tenant flows are ALWAYS is_global=false (the RPC never lets a tenant set is_global).

// deno-lint-ignore-file no-explicit-any

// `tool` is typed non-generically ON PURPOSE. Inferring it pulls @langchain/core's generic
// graph into every module that defines a tool, and that instantiation — not file size — is what
// makes agent-chat exceed 12 GB and drop out of the edge typecheck gate entirely (inbox-api is a
// comparable 2.8k lines and checks fine). Erasing it here costs the `tool()` config shape, which
// `npm run tools:manifest` + tests/unit/toolkitCoverage.test.ts already enforce from the AST, and
// buys a compiler over the tool bodies, which nothing had before.
const { tool } = await import('npm:@langchain/core@1.1.15/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  // Return stays `any`: consumers pass these to bindTools()/registerTools(), and narrowing it
  // to `unknown` would break them. The INPUT is what we want typed, and S gives us that.
  ) => any;
};
const { z } = await import('npm:zod@3.24.0');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const MODULE_SLUG = 'flows-toolkit';

// Curated tenant-safe vocabulary — MUST stay in sync with the allowlists in
// create_simple_flow (the RPC is the enforcer; this is for the LLM + graceful errors).
// Only triggers with a real workspace-scoped emitter belong here. A trigger with no emitter,
// or one emitted without a workspace_id (an appointment booked by a non-member, say), can never
// match a tenant flow. Add a trigger only once a trusted server-side emitter stamps workspace_id.
const TENANT_TRIGGERS = [
  'scheduled', 'quote_approved', 'invoice_paid', 'payment_received', 'payment_sent',
  'inbox.message_received',
] as const;
const TENANT_ACTIONS = [
  'send_email', 'send_whatsapp', 'create_notification', 'send_agent_message', 'send_campaign',
] as const;

import { serviceClient as svcClient } from '../supabase-client.ts';
/**
 * Prefer a JWT-scoped client so the create/toggle/delete RPCs' `auth.uid()`-based
 * `assert_workspace_member` and RLS actually enforce. When no JWT is present (partner `kai_` keys and
 * the admin-secret on-behalf paths), this falls back to the service role — and under service role
 * `auth.uid()` is null, so `assert_workspace_member` becomes a NO-OP. On those paths the only real
 * tenancy control is that `p_workspace_id` is SERVER-DERIVED from the resolved membership / api-key
 * workspace (never client-supplied) — so never pass a caller-influenced workspace id into these RPCs.
 */
function callerClient(jwt?: string) {
  if (jwt) {
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
  }
  return svcClient();
}

export const createManageFlowsTool = (
  userId: string,
  workspaceId: string | undefined,
  jwt: string | undefined,
  onChunk?: (chunk: any) => void,
) => {
  async function moduleReady(): Promise<{ ok: boolean; error?: string }> {
    try {
      const svc = svcClient();
      const { data: mod } = await svc.from('modules').select('enabled').eq('slug', MODULE_SLUG).maybeSingle();
      if (!mod?.enabled) return { ok: false, error: 'The Flows toolkit is not enabled on this platform.' };
      if (!workspaceId) return { ok: false, error: 'No active workspace for the current user.' };
      const { data: entitled } = await svc.rpc('is_workspace_entitled', {
        p_workspace_id: workspaceId, p_module_slug: MODULE_SLUG,
      });
      if (entitled !== true) {
        return { ok: false, error: 'This workspace has not activated the Flows toolkit. Activate it under Profile → Modules.' };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `Flows availability check failed: ${(e as Error).message}` };
    }
  }

  return tool(
    async ({ action, name, trigger_type, trigger_config, actions, flow_id, active, activate }: any) => {
      const gate = await moduleReady();
      if (!gate.ok) return JSON.stringify({ success: false, error: gate.error });

      const db = callerClient(jwt);
      const ws = workspaceId!;

      if (action === 'list') {
        // The seeded `system-default` flows — the 100+ locked, global, ALREADY-ACTIVE rows that
        // actually deliver this platform's notifications — are `is_global = true` with a NULL
        // workspace_id. Filtering them out client-side meant "list my flows" answered with only
        // the handful a tenant had hand-built (usually none), while /admin → Flows listed every
        // one, because flowService.listFlows applies no is_global filter at all. Same table,
        // same user, two different answers, and the quick-start's `done` copy claims to have
        // pulled up "the automations running in this workspace".
        //
        // So drop the redundant filter and let RLS be the single arbiter, exactly as the admin
        // page does: `flows_tenant_select` already restricts a member to
        // `is_global = false AND is_workspace_member(workspace_id)`, and only the platform-admin
        // policy widens that to the global rows. A tenant's result is therefore unchanged; an
        // admin now gets the same list here as on the page.
        //
        // ONLY when a JWT scoped the client, though. callerClient() falls back to the SERVICE
        // ROLE for the partner `kai_` key and admin-secret paths, and service role bypasses RLS
        // — so the same query on those paths would hand a partner key every platform flow.
        let q = db
          .from('flows')
          .select('id, name, trigger_type, status, created_at, is_global, is_locked');
        q = jwt
          ? q.or(`workspace_id.eq.${ws},is_global.is.true`)
          : q.eq('workspace_id', ws).eq('is_global', false);
        const { data, error } = await q
          .order('is_global', { ascending: true })
          .order('created_at', { ascending: false })
          .limit(200);
        if (error) return JSON.stringify({ success: false, error: error.message });
        const flows = data ?? [];
        onChunk?.({ type: 'flows_list', flows, timestamp: Date.now() });
        return JSON.stringify({ success: true, count: flows.length, flows });
      }

      if (action === 'create') {
        // Missing the essentials → ask for them in chat (the visual builder is the other path).
        if (!name || !trigger_type || !Array.isArray(actions) || actions.length === 0) {
          return JSON.stringify({
            success: false,
            error: 'To create an automation I need: a name, a trigger_type, and at least one action. Ask the user for whatever is missing, then call create again. (They can also build it visually on the Automations page.)',
          });
        }
        const { data, error } = await db.rpc('create_simple_flow', {
          p_workspace_id: ws,
          p_name: name,
          p_trigger_type: trigger_type,
          p_trigger_config: trigger_config ?? {},
          p_actions: actions,
          p_activate: activate !== false,
        });
        if (error) return JSON.stringify({ success: false, error: error.message });
        const flow = Array.isArray(data) ? data[0] : data;
        onChunk?.({ type: 'flow_created', flow, timestamp: Date.now() });
        return JSON.stringify({ success: true, flow });
      }

      if (action === 'toggle') {
        if (!flow_id) return JSON.stringify({ success: false, error: 'flow_id is required to toggle a flow' });
        const { data, error } = await db.rpc('toggle_simple_flow', {
          p_workspace_id: ws, p_flow_id: flow_id, p_active: active !== false,
        });
        if (error) return JSON.stringify({ success: false, error: error.message });
        const flow = Array.isArray(data) ? data[0] : data;
        onChunk?.({ type: 'flow_updated', flow, timestamp: Date.now() });
        return JSON.stringify({ success: true, flow });
      }

      if (action === 'remove') {
        if (!flow_id) return JSON.stringify({ success: false, error: 'flow_id is required to remove a flow' });
        const { data, error } = await db.rpc('delete_simple_flow', { p_workspace_id: ws, p_flow_id: flow_id });
        if (error) return JSON.stringify({ success: false, error: error.message });
        if (data !== true) return JSON.stringify({ success: false, error: 'Flow not found, locked, or not owned by your workspace.' });
        onChunk?.({ type: 'flow_removed', flow_id, timestamp: Date.now() });
        return JSON.stringify({ success: true });
      }

      return JSON.stringify({ success: false, error: `unknown action: ${action}` });
    },
    {
      name: 'manage_flows',
      description: [
        'Create and manage SIMPLE workspace automations ("Flows") for the current user\'s workspace.',
        'A flow = one TRIGGER (an event) + one or more ACTIONS that run when it fires. Scoped to this workspace only.',
        '',
        'Allowed triggers: scheduled (cron), quote_approved, invoice_paid, payment_received, payment_sent,',
        '  inbox.message_received.',
        'Allowed actions: send_email, send_whatsapp, create_notification, send_agent_message,',
        '  send_campaign (dispatch an Email-Marketing campaign by campaign_id).',
        'Action config may use {{trigger.data.FIELD}} templates (e.g. {{trigger.data.user_id}}).',
        'Cost: each time a flow RUNS it costs 20 credits ($0.20) from the workspace credit pool,',
        'plus any per-action cost (e.g. WhatsApp). Creating/listing/toggling a flow is free.',
        '',
        'Actions:',
        '  list   → show this workspace\'s flows.',
        '  create → build a flow. Requires name + trigger_type + a non-empty actions array. If the',
        '           user is vague, ASK for the missing details in chat, then call create. (They can',
        '           also build it visually on the Automations page.)',
        '  toggle → pause/resume a flow (flow_id + active).',
        '  remove → delete a flow (flow_id).',
        '',
        'Examples:',
        '  "notify me every morning at 9" → action=create, trigger_type=scheduled, trigger_config={cron:"0 9 * * *"}, actions=[{action_type:"create_notification",...}]',
        '  "list my automations" → action=list',
        '  "turn off flow X" → action=toggle, active=false',
      ].join('\n'),
      schema: z.object({
        action: z.enum(['list', 'create', 'toggle', 'remove']).default('list'),
        name: z.string().optional().describe('Human name for the flow (create).'),
        trigger_type: z.enum(TENANT_TRIGGERS as unknown as [string, ...string[]]).optional()
          .describe('The event that starts the flow.'),
        trigger_config: z.record(z.any()).optional()
          .describe('Trigger config. For scheduled: {cron, timezone?}. Others: {} (payload rides in trigger.data).'),
        actions: z.array(z.object({
          action_type: z.enum(TENANT_ACTIONS as unknown as [string, ...string[]]),
          label: z.string().optional(),
          config: z.record(z.any()).optional().describe('Action config; values may use {{trigger.data.*}} templates.'),
        })).optional().describe('Ordered actions to run when the trigger fires (create).'),
        flow_id: z.string().uuid().optional().describe('Target flow (toggle/remove).'),
        active: z.boolean().optional().describe('toggle: true=resume/active, false=pause.'),
        activate: z.boolean().optional().describe('create: activate immediately (default true) vs save as draft.'),
      }),
    },
  );
};
