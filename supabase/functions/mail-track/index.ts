/** mail-track — PUBLIC open-tracking pixel. Always answers the same GIF, so a token reveals nothing. */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { withApiLogging } from '../_shared/api-logger.ts';
import { isTrackId } from '../_shared/mail-tracking.ts';

const GIF = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), (c) => c.charCodeAt(0));

function pixel(): Response {
  return new Response(GIF, {
    status: 200,
    headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0', Pragma: 'no-cache' },
  });
}

serve(withApiLogging('mail-track', async (req) => {
  const t = new URL(req.url).searchParams.get('t');
  if (req.method === 'GET' && isTrackId(t)) {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { error } = await db.rpc('mail_track_open', { p_id: t });
    if (error) console.error('[mail-track] could not record an open', error.message);
  }
  return pixel();
}));
