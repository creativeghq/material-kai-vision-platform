/**
 * Reading a drawing's own printed schedules into proposed bill-of-quantities lines.
 *
 * It is TRANSCRIPTION, never measurement. A door schedule is a table the design team authored and
 * printed; copying it is reading. A quantity worked out from the geometry of a plan is a guess that
 * looks exactly like a fact — a plausible number somebody orders materials against, with nothing
 * downstream able to tell it from a measured one. The edge function's prompt bans it and its tool
 * schema requires a `source` on every row, so anything that arrives here can be checked against the
 * sheet in seconds.
 *
 * It returns a PROPOSAL and writes nothing. Adding lines to a schedule is a separate, explicit act
 * by a person who has looked at them.
 */
import { supabase } from '@/integrations/supabase/client';

/** One row transcribed from a schedule printed on the drawing. */
export interface TakeoffItem {
  description: string;
  item_ref: string | null;
  /**
   * The quantity PRINTED in the row, or null when the row printed none.
   *
   * Null all the way to the screen and into the schedule line. A row with no printed quantity is a
   * fact worth keeping — "the sheet lists this door type and gives no count" — and a 0 in a takeoff
   * is a quantity somebody orders.
   */
  quantity: number | null;
  unit: string | null;
  schedule: string | null;
  /** Which schedule and row this came from. Required — an untraceable figure is a measured one. */
  source: string;
  notes: string | null;
}

export interface TakeoffResult {
  success: boolean;
  /** `read` — schedules found. `no_schedules` — a normal drawing with no tabular schedule on it. */
  status: 'read' | 'no_schedules' | 'failed';
  drawing: {
    revision_id: string;
    rev_label: string | null;
    drawing_number: string | null;
    title: string | null;
    project_id: string | null;
  };
  items: TakeoffItem[];
  /** True when the sheet had more rows than were returned — a short list for a different reason. */
  truncated: boolean;
  /** How many rows printed no quantity, so the reader knows how much is still to fill in by hand. */
  without_quantity: number;
  confidence: number | null;
  notes: string | null;
  error?: string;
}

export const takeoffService = {
  /**
   * Read the schedules printed on one drawing revision.
   *
   * Only the revision id goes over the wire: the file location and the workspace both come from
   * that row server-side. Sending a URL would make the reader an SSRF gadget (invariant 7).
   */
  async read(revisionId: string): Promise<TakeoffResult> {
    const { data, error } = await supabase.functions.invoke('takeoff-from-drawing', {
      body: { revision_id: revisionId },
    });
    if (error) throw new Error(error.message || 'The drawing could not be read.');
    if (!data?.success) throw new Error(data?.error || 'The drawing could not be read.');
    return data as TakeoffResult;
  },
};
