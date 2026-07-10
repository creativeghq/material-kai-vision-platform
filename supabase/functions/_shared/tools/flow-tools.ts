// #256 — Flows toolkit. Lets a workspace owner create/list/toggle/remove SIMPLE automations
// through chat (mirrors manage_job_sites), writing real workspace-scoped rows to the flows
// table via the SECURITY DEFINER RPCs create_simple_flow / delete_simple_flow /
// toggle_simple_flow. The tenant-safe trigger/action vocabulary is enforced SERVER-SIDE in
// those RPCs (the UI/tool restriction is not the security line — pen-test #250).
//
// SECURITY:
//  • Gated on isModuleEnabled('flows-toolkit') [global publish] + is_workspace_entitled
//    [per-workspace paid grant]. Both fail closed.
//  • All writes run through a JWT-scoped client so the RPC's assert_workspace_member (auth.uid)
//    enforces membership and RLS applies — a caller can only touch their own workspace's flows.
//  • Tenant flows are ALWAYS is_global=false (the RPC never lets a tenant set is_global).

// deno-lint-ignore-file no-explicit-any

const { tool } = await import('npm:@langchain/core@1.1.15/tools');
const { z } = await import('npm:zod@3.24.0');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const MODULE_SLUG = 'flows-toolkit';

// Curated tenant-safe vocabulary — MUST stay in sync with the allowlists in
// create_simple_flow (the RPC is the enforcer; this is for the LLM + graceful errors).
const TENANT_TRIGGERS = [
  'scheduled', 'quote_approved', 'invoice_paid', 'payment_received',
  'inbox.message_received', 'product_added', 'appointment_booked',
] as const;
const TENANT_ACTIONS = [
  'send_email', 'send_whatsapp', 'create_notification', 'send_agent_message', 'send_campaign',
] as const;

function svcClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

/** JWT-scoped client so the RPCs' auth.uid()-based assert_workspace_member enforces and RLS
 *  applies. Falls back to service role only when no JWT is present. */
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

      // Vague / underspecified create → open the modal instead of guessing.
      if (action === 'open_form') {
        onChunk?.({
          type: 'flow_form_open',
          default_trigger_type: (trigger_type && (TENANT_TRIGGERS as readonly string[]).includes(trigger_type)) ? trigger_type : 'invoice_paid',
          prefill: { name, trigger_config, actions },
          timestamp: Date.now(),
        });
        return JSON.stringify({ success: true, mode: 'form_opened' });
      }

      if (action === 'list') {
        const { data, error } = await db
          .from('flows')
          .select('id, name, trigger_type, status, created_at')
          .eq('workspace_id', ws)
          .eq('is_global', false)
          .order('created_at', { ascending: false });
        if (error) return JSON.stringify({ success: false, error: error.message });
        onChunk?.({ type: 'flows_list', flows: data ?? [], timestamp: Date.now() });
        return JSON.stringify({ success: true, flows: data ?? [] });
      }

      if (action === 'create') {
        // Missing the essentials → open the form prefilled with whatever we have.
        if (!name || !trigger_type || !Array.isArray(actions) || actions.length === 0) {
          onChunk?.({
            type: 'flow_form_open',
            default_trigger_type: (trigger_type && (TENANT_TRIGGERS as readonly string[]).includes(trigger_type)) ? trigger_type : 'invoice_paid',
            prefill: { name, trigger_config, actions },
            timestamp: Date.now(),
          });
          return JSON.stringify({ success: true, mode: 'form_opened', note: 'missing required fields; opened modal' });
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
        'Allowed triggers: scheduled (cron), quote_approved, invoice_paid, payment_received,',
        '  inbox.message_received, product_added, appointment_booked.',
        'Allowed actions: send_email, send_whatsapp, create_notification, send_agent_message,',
        '  send_campaign (dispatch an Email-Marketing campaign by campaign_id).',
        'Action config may use {{trigger.data.FIELD}} templates (e.g. {{trigger.data.user_id}}).',
        '',
        'Actions:',
        '  list   → show this workspace\'s flows.',
        '  create → build a flow. Requires name + trigger_type + a non-empty actions array.',
        '  toggle → pause/resume a flow (flow_id + active).',
        '  remove → delete a flow (flow_id).',
        '  open_form → when the user is vague ("set up an automation" / "remind me when an invoice is paid"',
        '              without specifics), open the guided modal instead of guessing.',
        '',
        'Examples:',
        '  "email the customer when their invoice is paid" (no details) → action=open_form, trigger_type=invoice_paid',
        '  "notify me every morning at 9" → action=create, trigger_type=scheduled, trigger_config={cron:"0 9 * * *"}, actions=[{action_type:"create_notification",...}]',
        '  "list my automations" → action=list',
        '  "turn off flow X" → action=toggle, active=false',
      ].join('\n'),
      schema: z.object({
        action: z.enum(['list', 'create', 'toggle', 'remove', 'open_form']).default('list'),
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
