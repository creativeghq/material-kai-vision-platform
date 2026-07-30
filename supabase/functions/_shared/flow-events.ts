/**
 * Shared Flow Event Emitter
 *
 * Reusable utility for emitting flow trigger events from any edge function
 * or internal service. Calls the flow-engine's trigger-event action which
 * finds all active flows matching the event type and executes them.
 *
 * Usage (from edge functions):
 *   import { emitFlowEvent } from '../_shared/flow-events.ts';
 *   await emitFlowEvent('invoice_issued', { invoice_id: '...', workspace_id: '...' });
 *
 * Usage (fire-and-forget, non-blocking):
 *   emitFlowEvent('vr_world_created', { world_id: '...' }); // no await
 */

import type { DbClient } from './supabase-client.ts';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Module-level singleton — reused across calls within the same isolate
let _supabase: DbClient | null = null;
function getSupabase() {
  if (!_supabase && supabaseUrl && supabaseServiceKey) {
    _supabase = createClient(supabaseUrl, supabaseServiceKey);
  }
  return _supabase;
}

/**
 * Emit an event to both the flow engine AND any background agents
 * listening for this event type (trigger_type='event', event_type=eventType).
 *
 * Usage (fire-and-forget):
 *   emitAgentEvent('product_created', { product_id: '...', workspace_id: '...' });
 */
export async function emitAgentEvent(
  eventType: string,
  data: Record<string, unknown>,
): Promise<void> {
  if (!supabaseUrl || !supabaseServiceKey) return;

  try {
    const supabase = getSupabase()!;

    const { data: agents } = await supabase
      .from('background_agents')
      .select('id')
      .eq('trigger_type', 'event')
      .eq('event_type', eventType)
      .eq('enabled', true);

    for (const agent of agents || []) {
      await fetch(`${supabaseUrl}/functions/v1/background-agent-runner`, {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          agent_id:           agent.id,
          triggered_by:       'event',
          trigger_event_type: eventType,
          input_data:         data,
        }),
      }).then(res => {
        if (!res.ok) res.text().then(body => console.error(`[flow-events] Agent ${agent.id} returned HTTP ${res.status}: ${body}`)).catch(() => null);
      }).catch(e => console.error(`[flow-events] Failed to trigger agent ${agent.id}:`, e));
    }
  } catch (err) {
    console.error(`[flow-events] emitAgentEvent error for ${eventType}:`, err);
  }
}

/**
 * Emit a workspace-level flow event to every member of the workspace holding one
 * of `roles` (e.g. owner/admin). The Flows `create_notification` action targets a
 * single `user_id` and skips when it's absent, so a workspace event with no
 * per-recipient `user_id` silently delivers nothing. This resolves the recipients
 * and fires one enriched event per recipient (mirrors the `module_access_requested`
 * pattern). `buildData(recipientUserId)` must return the payload including
 * `user_id: recipientUserId`, `title`, `body`, `type`.
 */
export async function emitFlowEventToWorkspaceRoles(
  workspaceId: string,
  roles: string[],
  eventType: string,
  buildData: (recipientUserId: string) => Record<string, unknown>,
  opts?: { excludeUserId?: string },
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase || !workspaceId) return;
  try {
    const { data: members } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId)
      .in('role', roles)
      .eq('status', 'active');
    const ids = [...new Set((members || []).map((m: { user_id: string }) => m.user_id as string))]
      .filter((id) => id && id !== opts?.excludeUserId);
    for (const uid of ids) {
      await emitFlowEvent(eventType, buildData(uid));
    }
  } catch (err) {
    console.error(`[flow-events] emitFlowEventToWorkspaceRoles error for ${eventType}:`, err);
  }
}

export async function emitFlowEvent(
  eventType: string,
  data: Record<string, unknown>,
): Promise<{ triggered: number; succeeded: number; failed: number } | null> {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn('[flow-events] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY, skipping event emission');
    return null;
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/flow-engine`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'trigger-event',
        event_type: eventType,
        data,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[flow-events] Failed to emit ${eventType}: ${response.status} ${errText}`);
      return null;
    }

    const result = await response.json();
    return result.data || null;
  } catch (err) {
    // Non-fatal — flow events should never break the calling function
    console.error(`[flow-events] Error emitting ${eventType}:`, err);
    return null;
  }
}
