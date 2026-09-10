/** Shared Flow Event Emitter */

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
 * pattern).
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

/** Short-lived cache of trigger types that have at least one ACTIVE flow. */
const TRIGGER_CACHE_TTL_MS = 30_000;
let _triggerCache: { at: number; types: Set<string> } | null = null;

async function activeTriggerTypes(): Promise<Set<string> | null> {
  const now = Date.now();
  if (_triggerCache && now - _triggerCache.at < TRIGGER_CACHE_TTL_MS) return _triggerCache.types;
  try {
    const supabase = getSupabase();
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('flows')
      .select('trigger_type')
      .eq('status', 'active');
    if (error) return null;
    const types = new Set((data || []).map((r: { trigger_type: string }) => r.trigger_type));
    _triggerCache = { at: now, types };
    return types;
  } catch {
    return null;
  }
}

/** The ONE emitter for `inbox.message_received`. */
export async function emitInboxMessageEvent(opts: {
  /** Who to notify. Ids only — the address is resolved here. */
  userIds: string[];
  threadId: string;
  workspaceId?: string | null;
  title: string;
  /** Email subject when it differs from the in-app title. Defaults to the title. */
  subject?: string;
  body: string;
  /** Defaults to the thread itself. */
  actionUrl?: string;
}): Promise<void> {
  const supabase = getSupabase();
  const actionUrl = opts.actionUrl ?? `/inbox?thread=${opts.threadId}`;
  for (const userId of opts.userIds) {
    if (!userId) continue;
    // Optional by design: with no address the bell still fires, which is strictly better than
    // dropping the event. What is NOT acceptable is silently addressing a send to nothing.
    let email: string | undefined;
    if (supabase) {
      try {
        const { data } = await supabase.auth.admin.getUserById(userId);
        email = data?.user?.email ?? undefined;
      } catch { /* bell-only */ }
    }
    await emitFlowEvent('inbox.message_received', {
      user_id: userId,
      email,
      type: 'inbox_message',
      title: opts.title,
      subject: opts.subject ?? opts.title,
      body: opts.body,
      action_url: actionUrl,
      thread_id: opts.threadId,
      workspace_id: opts.workspaceId ?? undefined,
    }).catch(() => {});
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

  // Skip the round-trip when nothing is listening. NOTE this fails OPEN: a null cache
  // (lookup failed, or secrets not ready) means we emit anyway. Suppressing a real event
  // because a convenience lookup broke would be far worse than an extra invocation — the
  // whole point of this path is that notifications must not go missing.
  const listening = await activeTriggerTypes();
  if (listening && !listening.has(eventType)) {
    return { triggered: 0, succeeded: 0, failed: 0 };
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
