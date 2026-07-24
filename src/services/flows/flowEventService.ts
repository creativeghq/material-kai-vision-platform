/**
 * Flow Event Service
 *
 * Reusable utility for emitting flow trigger events from the frontend.
 * All event emissions are fire-and-forget (non-blocking, non-fatal).
 *
 * Usage:
 *   import { flowEventService } from '@/services/flows/flowEventService';
 *   flowEventService.emit('quote_requested', { quote_id: '...', user_id: '...' });
 */

import { supabase } from '@/integrations/supabase/client';

class FlowEventService {
  /**
   * Emit a flow trigger event. Finds all active flows matching
   * the event type and executes them with the provided data.
   *
   * This is fire-and-forget — errors are logged but never thrown.
   */
  async emit(eventType: string, data: Record<string, unknown>): Promise<void> {
    try {
      await supabase.functions.invoke('flow-engine', {
        body: {
          action: 'trigger-event',
          event_type: eventType,
          data,
        },
      });
    } catch (err) {
      // Non-fatal — flow events should never break the calling feature
      console.warn(`[flowEventService] Failed to emit ${eventType}:`, err);
    }
  }

  /**
   * Emit a workspace-level event to every member holding one of `roles`
   * (e.g. owner/admin). The Flows `create_notification` action targets a single
   * `user_id` and skips when it's absent, so a workspace event without a
   * per-recipient `user_id` delivers nothing. This resolves the recipients and
   * fires one enriched event each. `buildData(recipientUserId)` must include
   * `user_id: recipientUserId`, `title`, `body`, `type`.
   */
  async emitToWorkspaceRoles(
    workspaceId: string,
    roles: string[],
    eventType: string,
    buildData: (recipientUserId: string) => Record<string, unknown>,
    opts?: { excludeUserId?: string },
  ): Promise<void> {
    if (!workspaceId) return;
    try {
      const { data: members } = await supabase
        .from('workspace_members')
        .select('user_id')
        .eq('workspace_id', workspaceId)
        .in('role', roles)
        .eq('status', 'active');
      const rows = (members ?? []) as Array<{ user_id: string }>;
      const ids = [...new Set(rows.map((m) => m.user_id))]
        .filter((id): id is string => !!id && id !== opts?.excludeUserId);
      await Promise.all(ids.map((uid) => this.emit(eventType, buildData(uid))));
    } catch (err) {
      console.warn(`[flowEventService] emitToWorkspaceRoles failed for ${eventType}:`, err);
    }
  }
}

export const flowEventService = new FlowEventService();
