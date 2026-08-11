/**
 * Messaging Tools — agent-chat surface for WhatsApp (Zernio) messaging.
 *
 * ONE tool, actions:
 *   - list_channels — the workspace's connected WhatsApp channels (senders)
 *   - send          — send a WhatsApp message via a channel (CONFIRM-gated: outbound comms)
 *
 * `send` is a sensitive mutation (a real message to a real person), so it ALWAYS routes through
 * the Approve/Decline card (invariant #9): on confirm!=true it previews + emits action_confirmation;
 * only on approval does it call messaging-api. Module `messaging` + entitlement gated. Runs as the
 * user (JWT) so messaging-api's own auth/BYOK/quota applies.
 */

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

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MODULE_SLUG = 'messaging';

import { serviceClient as svcClient } from '../supabase-client.ts';
function userClient(jwt: string | undefined) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: jwt ? { Authorization: `Bearer ${jwt}` } : {} },
  });
}

async function moduleReady(workspaceId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const sb = svcClient();
    const { data: mod } = await sb.from('modules').select('enabled').eq('slug', MODULE_SLUG).maybeSingle();
    if (!mod?.enabled) return { ok: false, error: 'The Messaging module is not enabled on this platform.' };
    if (!workspaceId) return { ok: false, error: 'No active workspace for the current user.' };
    const { data: entitled } = await sb.rpc('is_workspace_entitled', { p_workspace_id: workspaceId, p_module_slug: MODULE_SLUG });
    if (entitled !== true) return { ok: false, error: 'This workspace has not activated Messaging. Enable it under Profile → Modules.' };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Messaging availability check failed: ${(e as Error).message}` };
  }
}

export const createManageMessagingTool = (
  userId: string,
  workspaceId: string,
  jwt: string | undefined,
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ action, to, from, content, template_id, confirm }) => {
      const gate = await moduleReady(workspaceId);
      if (!gate.ok) return JSON.stringify({ success: false, error: gate.error });
      const sb = userClient(jwt);

      if (action === 'list_channels') {
        const { data, error } = await sb
          .from('messaging_channels')
          .select('id, display_name, sender_id, channel_type, provider')
          .eq('workspace_id', workspaceId);
        if (error) return JSON.stringify({ success: false, error: error.message });
        onChunk?.({ type: 'messaging_channels_list', workspace_id: workspaceId, channels: data ?? [], timestamp: Date.now() });
        return JSON.stringify({ success: true, channels: data ?? [] });
      }

      if (action === 'send') {
        if (!to) return JSON.stringify({ success: false, error: 'send needs a recipient phone (to).' });
        if (!content && !template_id) return JSON.stringify({ success: false, error: 'send needs content (24h window) or a template_id.' });

        // HUMAN-IN-THE-LOOP GATE (invariant #9): outbound message → confirm first.
        if (confirm !== true) {
          const preview = content ? `"${String(content).slice(0, 140)}"` : `template ${template_id}`;
          onChunk?.({
            type: 'action_confirmation',
            tool: 'manage_messaging',
            input: { action: 'send', to, from, content, template_id },
            title: 'Send this WhatsApp message?',
            summary: `Send ${preview} to ${to}${from ? ` from ${from}` : ''}. It is delivered immediately and cannot be recalled.`,
            danger: true,
            toolkit_id: 'messaging',
            timestamp: Date.now(),
          });
          return JSON.stringify({ success: true, awaiting_confirmation: true, message: 'Awaiting the user\'s approval to send. Do not retry.' });
        }

        // Confirmed → send via messaging-api (its own auth/BYOK/quota apply, run as the user).
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/messaging-api`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt || SUPABASE_SERVICE_ROLE_KEY}` },
          body: JSON.stringify({ action: 'send', to, from, content, templateId: template_id, workspace_id: workspaceId }),
        });
        const text = await resp.text();
        let data: any = null; try { data = JSON.parse(text); } catch { data = text; }
        if (!resp.ok) return JSON.stringify({ success: false, error: (data?.error || String(data))?.slice?.(0, 200) || `messaging-api ${resp.status}` });
        onChunk?.({ type: 'messaging_sent', to, message_id: data?.messageId, timestamp: Date.now() });
        return JSON.stringify({ success: true, sent: true, to, message_id: data?.messageId });
      }

      return JSON.stringify({ success: false, error: `unknown action: ${action}` });
    },
    {
      name: 'manage_messaging',
      description:
        'WhatsApp messaging: list_channels (connected senders) and send a message. SENDING is a real '
        + 'outbound message — it ALWAYS asks the user to Approve/Decline first (never set confirm:true '
        + 'yourself; the UI sets it on approval). Cold sends outside the 24h window need a template_id.',
      schema: z.object({
        action: z.enum(['list_channels', 'send']).default('list_channels'),
        to: z.string().optional().describe('Recipient phone number in E.164 (e.g. +306912345678).'),
        from: z.string().optional().describe('Sender channel sender_id (from list_channels). Omit to use the default channel.'),
        content: z.string().optional().describe('Freeform message text (only valid inside the 24h customer-service window).'),
        template_id: z.string().optional().describe('Approved WhatsApp template id for cold/marketing sends.'),
        confirm: z.boolean().optional().describe('Do NOT set — the Approve/Decline card sets confirm:true on approval.'),
      }),
    },
  );
};
