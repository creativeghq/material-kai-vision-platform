/**
 * real-estate-inbound-lead — portal enquiry emails become CRM leads.
 *
 * Syndication pushes listings OUT; the enquiries those portals generate arrive as email and were
 * retyped by hand or lost. The agency points any inbound-email service (Resend, Mailgun routes,
 * SendGrid Inbound Parse, Cloudflare Email Workers) at their tokenised URL and forwards portal mail
 * to it.
 *
 * SECURITY (invariant 6 — inbound webhooks):
 *  • The per-workspace token IS the credential and is checked BEFORE anything is parsed or written.
 *    The From address is trivially spoofable and is never trusted for authentication — only to guess
 *    which portal sent it.
 *  • Fails CLOSED: no token configured, token unknown, or ingestion switched off ⇒ reject. There is
 *    no path where an unauthenticated body reaches a write.
 *  • workspace_id and property_id are derived server-side (token → workspace, reference → listing).
 *    Nothing identifying is taken from the payload.
 */
import { createClient } from '@supabase/supabase-js';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { parsePortalLead } from '../_shared/real-estate-inbound.ts';

Deno.serve(withApiLogging('real-estate-inbound-lead', async (req) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // Token first: from the path (…/real-estate-inbound-lead/<token>), the query, or a bearer header,
  // because forwarding services differ in what they let you configure.
  const url = new URL(req.url);
  const pathToken = url.pathname.split('/').filter(Boolean).pop();
  const token = (url.searchParams.get('token')
    || (pathToken && pathToken !== 'real-estate-inbound-lead' ? pathToken : '')
    || (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')).trim();
  if (!token || token.length < 20) return json({ error: 'Unauthorized' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: settings } = await supabase.from('real_estate_settings')
    .select('workspace_id, inbound_leads_enabled')
    .eq('inbound_lead_token', token).maybeSingle();
  // One response for "unknown token" and "switched off" — distinguishing them would confirm a valid
  // token to someone probing.
  if (!settings || settings.inbound_leads_enabled !== true) return json({ error: 'Unauthorized' }, 401);
  const workspaceId = settings.workspace_id as string;

  let body: any;
  try { body = await req.json(); } catch { throw new HttpError(400, 'invalid JSON'); }

  // Every forwarder names these differently; accept the common spellings rather than mandating one.
  const parsed = parsePortalLead({
    from: body?.from ?? body?.sender ?? body?.envelope?.from ?? '',
    subject: body?.subject ?? body?.Subject ?? '',
    text: body?.text ?? body?.['body-plain'] ?? body?.plain ?? body?.TextBody ?? '',
    html: body?.html ?? body?.['body-html'] ?? body?.HtmlBody ?? '',
  });

  if (!parsed.email && !parsed.phone) {
    // Nothing to contact the buyer with. 200, not 4xx: the forwarder must not retry a message that
    // will never parse — this is usually a portal digest or a delivery receipt, not a lead.
    return json({ ok: true, skipped: 'no contactable buyer details found', portal: parsed.portal });
  }

  // Match the listing by the agency's own reference. Never trust a property id from the payload.
  //
  // `matchedByReference` is the answer to "is this lead on the RIGHT listing", and it is not the
  // same question as "did the email contain a reference". Reading the second for the first is how
  // an enquiry about ESP-9931 lands on an unrelated flat wearing `matched_listing: true` and no
  // warning banner — the fallback below fires either way, and only the flag says whether it did.
  let propertyId: string | null = null;
  let matchedByReference = false;
  if (parsed.reference) {
    const { data: p } = await supabase.from('properties')
      .select('id').eq('workspace_id', workspaceId).eq('reference_code', parsed.reference).maybeSingle();
    propertyId = p?.id ?? null;
    matchedByReference = !!propertyId;
  }
  if (!propertyId) {
    // property_inquiries requires a property. An unmatched lead is real and must not be dropped, so
    // it lands on the most recently published live listing and says so in the message — an agent can
    // re-point it. Losing the enquiry would be the worse failure.
    const { data: fallback } = await supabase.from('properties')
      .select('id').eq('workspace_id', workspaceId).eq('listing_status', 'active')
      .order('published_at', { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    propertyId = fallback?.id ?? null;
  }
  if (!propertyId) return json({ ok: true, skipped: 'no listing to attach the lead to', portal: parsed.portal });

  const unmatched = !matchedByReference;
  // The two ways of being unmatched need different actions, so they are not collapsed into one
  // sentence: no reference at all is usually a portal that does not send one, while a reference
  // that matched nothing is a listing whose `reference_code` is missing or spelled differently
  // here than on the portal — which will silently mis-file every future lead for it too.
  const banner = parsed.reference
    ? `[Reference "${parsed.reference}" does not match any listing in this workspace — this lead is on a placeholder listing. Re-point it, and check that listing's reference code.]`
    : '[The portal sent no listing reference — this lead is on a placeholder listing. Please re-point it.]';
  const { data: assignee } = await supabase.rpc('route_property_lead', {
    p_workspace_id: workspaceId, p_property_id: propertyId,
  });

  const { data: inserted, error } = await supabase.from('property_inquiries').insert({
    workspace_id: workspaceId, property_id: propertyId,
    name: parsed.name ?? `${parsed.portal} enquiry`,
    email: parsed.email, phone: parsed.phone,
    message: unmatched
      ? `${banner}\n\n${parsed.message ?? ''}`.slice(0, 4000)
      : parsed.message,
    status: 'new', source: `portal:${parsed.portal}`,
    // The portal collected the enquiry under its own terms; the buyer asked to be contacted about
    // this property. Marketing consent is a separate opt-in we have NOT been given.
    gdpr_consent: true, marketing_consent: false,
    inbound_portal: parsed.portal,
    inbound_raw: { from: body?.from ?? null, subject: body?.subject ?? null, parsed },
    assigned_user_id: assignee ?? null,
    assigned_at: assignee ? new Date().toISOString() : null,
  }).select('id').single();
  if (error) throw new HttpError(400, error.message);

  return json({
    ok: true, inquiry_id: inserted.id, portal: parsed.portal,
    matched_listing: matchedByReference,
    // Named separately so a forwarder's log distinguishes "this portal sends no reference" from
    // "our reference codes are wrong", which are different jobs for different people.
    reference: parsed.reference ?? null,
    reference_matched: parsed.reference ? matchedByReference : null,
    assigned: !!assignee,
  });
}));
