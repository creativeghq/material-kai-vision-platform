import { supabase } from '@/integrations/supabase/client';
import { edgeError } from '@/utils/edgeError';

// Public clock-in kiosk client — talks to the anonymous `hr-kiosk` edge function. No session; the
// employee is identified by VAT (+ optional PIN) against the workspace resolved from the URL slug.

export interface KioskResolve { enabled: boolean; workspace_name: string; require_pin: boolean; }
export interface KioskLookup { name: string; clocked_in: boolean; work_start_time: string | null; }
export interface KioskClockResult { ok: boolean; name: string; clocked_in: boolean; filed: boolean; is_late: boolean | null; protocol: string | null; reason: string | null; }

async function call<T>(action: string, extra: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('hr-kiosk', { body: { action, ...extra } });
  if (error) throw await edgeError(error);
  if ((data as any)?.error) throw new Error((data as any).message || (data as any).error);
  return data as T;
}

export const kioskService = {
  resolve(slug: string): Promise<KioskResolve> { return call('resolve', { slug }); },
  lookup(slug: string, vat: string, pin?: string): Promise<KioskLookup> { return call('lookup', { slug, vat, pin }); },
  clock(slug: string, vat: string, punch_type: 'arrival' | 'departure', pin?: string): Promise<KioskClockResult> {
    return call('clock', { slug, vat, punch_type, pin });
  },
};
