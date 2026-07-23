/**
 * real-estate-buyer-digests (#281) — saved-search email digests for buyers.
 *
 * For every active buyer requirement with digest_enabled + a portal_token + a contact email,
 * finds listings that (a) match the saved criteria and (b) were published/created since the last
 * digest, and emails the buyer a short summary linking to their portal (/buyer/:token). Stamps
 * last_digest_at so the same listings never re-send. Runs daily via pg_cron (x-cron-secret).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { isCronAuthorized } from '../_shared/auth.ts';
import { escapeHtml } from '../_shared/html.ts';

function matchesCriteria(c: any, p: any): boolean {
  if (!c) return false;
  if (c.type && c.type !== p.property_type) return false;
  if (c.transaction_type && c.transaction_type !== p.transaction_type) return false;
  if (c.price_min != null && p.price != null && Number(p.price) < Number(c.price_min)) return false;
  if (c.price_max != null && p.price != null && Number(p.price) > Number(c.price_max)) return false;
  if (c.beds != null && p.bedrooms != null && Number(p.bedrooms) < Number(c.beds)) return false;
  if (c.baths != null && p.bathrooms != null && Number(p.bathrooms) < Number(c.baths)) return false;
  if (c.location) { const loc = `${p.town ?? ''} ${p.region ?? ''}`.toLowerCase(); if (!loc.includes(String(c.location).toLowerCase())) return false; }
  return true;
}
const money = (n: number | null, ccy = 'EUR') => (n == null ? 'Price on request' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: ccy || 'EUR', maximumFractionDigits: 0 }).format(n));

serve(withApiLogging('real-estate-buyer-digests', async (req) => {
  await bootstrapForFunction();
  if (!isCronAuthorized(req)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const appUrl = Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr';
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: reqs, error } = await supabase
    .from('property_buyer_requirements')
    .select('id, workspace_id, label, criteria, portal_token, last_digest_at, contact:crm_contacts!property_buyer_requirements_crm_contact_id_fkey ( name, email )')
    .eq('is_active', true).eq('digest_enabled', true).not('portal_token', 'is', null)
    .limit(500);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });

  const nowIso = new Date().toISOString();
  let emailed = 0, skipped = 0, failed = 0;

  for (const r of reqs ?? []) {
    const email = (r as any).contact?.email as string | undefined;
    if (!email) { skipped++; continue; }
    const since = r.last_digest_at ?? '1970-01-01T00:00:00Z';
    // New public/active listings in this agency since the last digest.
    const { data: listings } = await supabase.from('properties')
      .select('id, title, price, currency, town, bedrooms, property_type, transaction_type, region, bathrooms, public_listing_token, published_at, created_at')
      .eq('workspace_id', r.workspace_id).eq('is_public', true).eq('listing_status', 'active')
      .or(`published_at.gte.${since},created_at.gte.${since}`).limit(100);
    const fresh = (listings ?? []).filter((p: any) => matchesCriteria(r.criteria, p));
    // Always stamp so we advance the window even when there's nothing new.
    await supabase.from('property_buyer_requirements').update({ last_digest_at: nowIso }).eq('id', r.id);
    if (fresh.length === 0) { skipped++; continue; }

    const portal = `${appUrl}/buyer/${r.portal_token}`;
    const items = fresh.slice(0, 8).map((p: any) => `
      <tr><td style="padding:8px 0;border-bottom:1px solid #eee">
        <div style="font-weight:600">${money(p.price, p.currency)}${p.bedrooms != null ? ` · ${p.bedrooms} bed` : ''}</div>
        <div style="font-size:14px">${escapeHtml(p.title || 'Listing')}${p.town ? ` — ${escapeHtml(p.town)}` : ''}</div>
      </td></tr>`).join('');
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto">
      <h2 style="margin:0 0 4px">${fresh.length} new propert${fresh.length === 1 ? 'y' : 'ies'} for you</h2>
      <p style="color:#666;font-size:14px;margin:0 0 12px">Matching ${escapeHtml(r.label || 'your saved search')}.</p>
      <table style="width:100%;border-collapse:collapse">${items}</table>
      <p style="margin:18px 0"><a href="${portal}" style="background:#b0106a;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px;font-size:14px">View all your matches</a></p>
      <p style="color:#999;font-size:12px">You're receiving this because your agent set up a property search for you.</p>
    </div>`;

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/email-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
        body: JSON.stringify({ action: 'send', to: email, subject: `${fresh.length} new propert${fresh.length === 1 ? 'y' : 'ies'} matching your search`, html, emailType: 'transactional', tags: { feature: 'buyer_digest', requirement_id: r.id }, workspace_id: r.workspace_id }),
      });
      if (res.ok) emailed++; else failed++;
    } catch { failed++; }
  }

  return new Response(JSON.stringify({ ok: true, requirements: (reqs ?? []).length, emailed, skipped, failed }), { headers: { 'Content-Type': 'application/json' } });
}));
