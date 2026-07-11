/**
 * email-contacts-sync-cron — #255. Daily push of CRM contacts → each workspace's Resend audience,
 * for workspaces that opted into auto-sync (workspace_email_config.contacts_auto_sync = true).
 *
 * Reuses email-api's `sync-resend-contacts` logic (no duplication): we call it per workspace with
 * the REAL service-role key (email-api treats that as admin access → skips the membership check).
 * Auth: x-cron-secret (the live pg_cron pattern) via isCronAuthorized.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { isCronAuthorized } from '../_shared/auth.ts';

serve(withApiLogging('email-contacts-sync-cron', async (req) => {
  await bootstrapForFunction();
  if (!isCronAuthorized(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: rows, error } = await supabase
    .from('workspace_email_config')
    .select('workspace_id')
    .eq('contacts_auto_sync', true);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  let processed = 0, failed = 0;
  for (const row of rows ?? []) {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/email-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
        body: JSON.stringify({ action: 'sync-resend-contacts', workspace_id: row.workspace_id }),
      });
      if (res.ok) processed++; else failed++;
    } catch (_) {
      failed++;
    }
  }

  return new Response(
    JSON.stringify({ success: true, workspaces: (rows ?? []).length, processed, failed }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}));
