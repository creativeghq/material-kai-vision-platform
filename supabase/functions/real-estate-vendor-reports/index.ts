/**
 * real-estate-vendor-reports — the weekly "how your property is doing" send to the instructing vendor.
 *
 * A service communication under the agency agreement, not marketing: it goes to the vendor of a
 * property we are actively marketing, about that property, and it is switched off per listing with
 * `properties.vendor_reports_enabled` rather than by a marketing-consent flag that would be the
 * wrong legal basis for it.
 *
 * Weekly via pg_cron (x-cron-secret). Every listing is stamped only on a SUCCESSFUL send, so a bad
 * week retries next run instead of being silently skipped.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { isCronAuthorized } from '../_shared/auth.ts';
import { sendVendorReport } from '../_shared/real-estate.ts';

/** Don't re-send inside a week even if the schedule fires twice. */
const MIN_DAYS_BETWEEN = 6;

serve(withApiLogging('real-estate-vendor-reports', async (req) => {
  await bootstrapForFunction();
  if (!isCronAuthorized(req)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const cutoff = new Date(Date.now() - MIN_DAYS_BETWEEN * 864e5).toISOString();

  // Only actively-marketed listings with a vendor to report to. `or` covers the never-sent case —
  // a null last_vendor_report_at is due immediately, not excluded by the date comparison.
  const { data: properties, error } = await supabase.from('properties')
    .select('*')
    .eq('listing_status', 'active').eq('vendor_reports_enabled', true)
    .not('vendor_contact_id', 'is', null)
    .or(`last_vendor_report_at.is.null,last_vendor_report_at.lt.${cutoff}`)
    .limit(300);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });

  let sent = 0, skipped = 0, failed = 0;
  for (const p of properties ?? []) {
    try {
      const r = await sendVendorReport(supabase, p);
      if (r.ok) sent++;
      // "No vendor email" is an ordinary state across a book of listings, not a failure to alert on.
      else if (r.reason?.includes('no vendor contact')) skipped++;
      else failed++;
    } catch (e) {
      console.error('[real-estate-vendor-reports] send failed for', p.id, e);
      failed++;
    }
  }

  return new Response(JSON.stringify({ ok: true, candidates: (properties ?? []).length, sent, skipped, failed }), { headers: { 'Content-Type': 'application/json' } });
}));
