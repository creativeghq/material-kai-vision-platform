/**
 * Reader for `price_alert_log` — the audit trail the Python notification dispatcher writes on
 * every fired alert. RLS scopes it (`price_alert_log_select_own`: your own rows, or everything
 * if you are an admin), so this queries the table directly rather than going through an endpoint.
 */
import { supabase } from '@/integrations/supabase/client';

export interface PriceAlertLogRow {
  id: string;
  user_id: string | null;
  product_id: string | null;
  tracked_query_id: string | null;
  alert_type: string;
  retailer_name: string | null;
  retailer_domain: string | null;
  payload: Record<string, unknown>;
  channels_fired: string[];
  channels_skipped: string[];
  credits_charged: number;
  created_at: string;
}

/**
 * Most recent alerts first. Capped because this is a "what happened lately" panel, not an
 * archive — the cap is deliberately above a page so the client-side filters still have
 * something to narrow.
 */
export async function listPriceAlerts(limit = 500): Promise<PriceAlertLogRow[]> {
  const { data, error } = await supabase
    .from('price_alert_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as PriceAlertLogRow[];
}
