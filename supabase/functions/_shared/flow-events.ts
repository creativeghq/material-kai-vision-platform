/**
 * Shared Flow Event Emitter
 *
 * Reusable utility for emitting flow trigger events from any edge function
 * or internal service. Calls the flow-engine's trigger-event action which
 * finds all active flows matching the event type and executes them.
 *
 * Usage (from edge functions):
 *   import { emitFlowEvent } from '../_shared/flow-events.ts';
 *   await emitFlowEvent('image_uploaded', { image_id: '...', category: 'material' });
 *
 * Usage (fire-and-forget, non-blocking):
 *   emitFlowEvent('vr_world_created', { world_id: '...' }); // no await
 */

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

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
