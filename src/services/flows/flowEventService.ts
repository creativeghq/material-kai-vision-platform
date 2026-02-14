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
}

export const flowEventService = new FlowEventService();
