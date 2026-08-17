/**
 * real-estate-ical — the two halves of short-let channel sync.
 *
 *  GET  ?token=…      the availability feed a channel (Airbnb, Booking.com, Vrbo) pulls from us.
 *  POST (cron auth)   pulls every active channel link's .ics and imports the bookings it holds.
 *
 * Channels all speak iCalendar and nothing else — no per-channel API, no partner approval — so this
 * one function is the whole integration.
 *
 * SECURITY:
 *  • The GET is anonymous and authorised solely by the per-listing `ical_token`. It publishes BLOCKED
 *    NIGHTS ONLY: no guest name, email or price. The URL is a bearer capability handed to third
 *    parties, and who is staying where is not theirs to have.
 *  • The POST fetches operator-supplied URLs, so every one goes through the shared SSRF guard again
 *    at read time — validating only at write time would leave a stored URL that later resolves
 *    somewhere internal (invariant 7).
 */
import { createClient } from '@supabase/supabase-js';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { isCronAuthorized } from '../_shared/auth.ts';
import { assertSafeUrl } from '../_shared/ssrf-guard.ts';
import { parseIcal, buildIcal } from '../_shared/real-estate-ical.ts';

/** A channel calendar is small; anything larger is not one, and we should not buffer it. */
const MAX_ICS_BYTES = 2_000_000;

Deno.serve(withApiLogging('real-estate-ical', async (req) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // ── Outbound: the feed a channel pulls ───────────────────────────────────────────────
  if (req.method === 'GET') {
    const token = new URL(req.url).searchParams.get('token')?.trim() ?? '';
    if (!token || token.length < 20) return json({ error: 'Unauthorized' }, 401);

    const { data: property } = await supabase.from('properties')
      .select('id, title, ical_token_expires_at').eq('ical_token', token).maybeSingle();
    if (!property) return json({ error: 'Unauthorized' }, 401);
    // #356 `RE-10`. NULL = never expires (every token issued before that finding).
    const icalExp = (property as { ical_token_expires_at?: string | null }).ical_token_expires_at;
    if (icalExp && new Date(icalExp).getTime() <= Date.now()) return json({ error: 'Unauthorized' }, 401);

    // Only what a channel needs to stop selling a night. Cancelled bookings release their nights,
    // so they are excluded exactly as the database constraint excludes them.
    const { data: bookings } = await supabase.from('property_bookings')
      .select('id, check_in, check_out, status')
      .eq('property_id', property.id).neq('status', 'cancelled')
      .gte('check_out', new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10))
      .order('check_in');

    return new Response(buildIcal(bookings ?? [], property.title ?? 'Availability', new Date()), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="availability.ics"',
        // Channels poll on their own schedule; a short cache keeps a hot listing from being hammered
        // without letting a fresh booking sit unpublished for long.
        'Cache-Control': 'public, max-age=300',
      },
    });
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!isCronAuthorized(req)) return json({ error: 'Unauthorized' }, 401);

  // ── Inbound: pull every active channel calendar ──────────────────────────────────────
  const { data: links } = await supabase.from('property_channel_links')
    .select('id, workspace_id, property_id, channel, ical_import_url')
    .eq('is_active', true).not('ical_import_url', 'is', null).limit(200);

  let imported = 0, skipped = 0, failed = 0;
  for (const link of links ?? []) {
    const finish = (status: string, message: string, count = 0) =>
      supabase.from('property_channel_links')
        .update({ last_synced_at: new Date().toISOString(), last_sync_status: status, last_sync_message: message.slice(0, 500), imported_count: count })
        .eq('id', link.id);

    try {
      // webcal:// is just https with a different scheme label — channels publish both.
      const raw = String(link.ical_import_url).replace(/^webcal:/i, 'https:');
      const safe = await assertSafeUrl(raw, { allowSchemes: ['https:'] });
      const res = await fetch(safe, { redirect: 'manual', headers: { accept: 'text/calendar' } });
      if (!res.ok) { failed++; await finish('failed', `HTTP ${res.status}`); continue; }
      const body = await res.text();
      if (body.length > MAX_ICS_BYTES) { failed++; await finish('failed', 'calendar too large'); continue; }

      const events = parseIcal(body);
      let count = 0;
      for (const ev of events) {
        // Idempotent on (property, channel, UID): a channel republishes its whole calendar every
        // poll, so without this every sync would duplicate every stay.
        const { error } = await supabase.from('property_bookings').upsert({
          workspace_id: link.workspace_id, property_id: link.property_id, channel: link.channel,
          external_ref: ev.uid, check_in: ev.start, check_out: ev.end,
          status: 'confirmed',
          // Channel feeds are anonymised at source — Airbnb publishes "Reserved", not a guest name.
          guest_name: ev.summary?.slice(0, 200) ?? null,
        }, { onConflict: 'property_id,channel,external_ref', ignoreDuplicates: false });
        // 23P01 = the exclusion constraint: these nights are already held by another channel. That
        // IS the double booking, and it must be surfaced rather than swallowed — the operator has to
        // resolve it on the channel that sold it twice.
        if (error) { if (error.code === '23P01') skipped++; else failed++; }
        else { count++; imported++; }
      }
      await finish(skipped > 0 ? 'partial' : 'ok', skipped > 0 ? `${skipped} date conflict(s) — check for a double booking` : `${count} event(s)`, count);
    } catch (e) {
      failed++;
      await finish('failed', e instanceof Error ? e.message : 'sync failed');
    }
  }

  return json({ ok: true, links: (links ?? []).length, imported, conflicts: skipped, failed });
}));
