/**
 * real-estate-listing-social — turns a published listing into a ready-to-publish social post.
 *
 * Called by the seeded `realestate.listing_published` flow (`run_edge_function`), so an agency can
 * retarget, pause or condition it from the Flows builder rather than waiting on a deploy.
 *
 * It creates a **draft** `social_posts` row per connected account and stops there, deliberately:
 *
 *  • `zernio-api` authorises publishing against a real workspace MEMBER (`auth.user.id`). This
 *    function runs service-role from a flow, with no user. Publishing from here would mean either
 *    forging that identity or weakening the check — and that check is what stops one tenant
 *    publishing through another tenant's connected account.
 *  • Posting to an agency's public channels is outward-facing and effectively irreversible. A draft
 *    that is one click from going out removes all the manual work without taking that decision away.
 *
 * The caption is built from the listing's own fields rather than generated. It costs no credits, and
 * an unreviewed AI caption on a property ad is exactly where fair-housing language goes wrong.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { isCronAuthorized } from '../_shared/auth.ts';

/**
 * A draft is only ever a PREVIEW url, and it must not be the thing that gets published.
 *
 * `property-media` is private, so any URL for it expires. This used to persist a 7-day signed URL
 * into `social_posts.image_urls` and hand that to the provider at publish time — so a draft that
 * sat over a weekend and a bank holiday went out with a link Meta fetches and gets a 403 from,
 * and the post publishes with no image or fails outright. That is pipeline convention 7 exactly:
 * never persist a `file_url` for a private bucket; store bucket + path and mint the URL on read.
 *
 * The row now carries `metadata.media_refs`, and `zernio-api` re-signs from those at the moment
 * it publishes. `image_urls` keeps a short-lived URL purely so the draft renders in the composer.
 */
const MEDIA_PREVIEW_TTL_SECONDS = 7 * 24 * 3600;

const money = (n: number | null, ccy: string) =>
  n == null ? null : new Intl.NumberFormat('en-GB', { style: 'currency', currency: ccy || 'EUR', maximumFractionDigits: 0 }).format(Number(n));

serve(withApiLogging('real-estate-listing-social', async (req) => {
  await bootstrapForFunction();
  // Flow-invoked, service-role only — same gate as the module's crons.
  if (!isCronAuthorized(req)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const appUrl = Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr';

  let body: any;
  try { body = await req.json(); } catch { throw new HttpError(400, 'invalid JSON'); }
  const propertyId = String(body?.property_id ?? '');
  if (!propertyId) throw new HttpError(400, 'property_id is required');

  const { data: property } = await supabase.from('properties')
    .select('id, workspace_id, title, town, region, price, currency, bedrooms, bathrooms, property_type, transaction_type, is_public, listing_status, public_listing_token, created_by, listing_agent_id')
    .eq('id', propertyId).maybeSingle();
  if (!property) throw new HttpError(404, 'not found');
  // Only ever advertise a listing that is actually live and publicly viewable — a draft going out
  // on social would link to a page that 404s.
  if (!property.is_public || property.listing_status !== 'active') {
    return new Response(JSON.stringify({ ok: true, skipped: 'listing is not publicly live' }), { headers: { 'Content-Type': 'application/json' } });
  }

  // Idempotence: a flow can legitimately fire twice (a republish, a retry). One announcement per
  // listing per account is the intent, so an existing draft/published post short-circuits.
  const { count: existing } = await supabase.from('social_posts')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', property.workspace_id)
    .contains('metadata', { property_id: propertyId });
  if (existing) {
    return new Response(JSON.stringify({ ok: true, skipped: 'already announced', posts: 0 }), { headers: { 'Content-Type': 'application/json' } });
  }

  const { data: accounts } = await supabase.from('social_accounts')
    .select('id, user_id, platform').eq('workspace_id', property.workspace_id).eq('is_active', true);
  if (!accounts?.length) {
    return new Response(JSON.stringify({ ok: true, skipped: 'no connected social accounts', posts: 0 }), { headers: { 'Content-Type': 'application/json' } });
  }

  // Cover image, signed — property-media is private, and Zernio has to be able to fetch it.
  const { data: cover } = await supabase.from('property_photos')
    .select('id, storage_bucket, storage_path').eq('property_id', propertyId)
    .order('is_cover', { ascending: false }).order('sort_order').limit(1).maybeSingle();
  let imageUrl: string | null = null;
  // The durable half — an ID, deliberately NOT a bucket and path.
  //
  // `social_posts` carries a `FOR ALL` policy for workspace members, so its `metadata` is
  // user-writable. A {bucket, path} here would be a path taken from a row the user controls and
  // then resolved with the SERVICE ROLE at publish time: a member could point it at any private
  // object in any bucket — another tenant's invoice PDF — and be handed a signed URL for it.
  // That is invariant 8 wearing a jsonb hat. The publisher resolves this id against
  // `property_photos` scoped to the post's own workspace, so the worst a rewritten metadata can
  // name is a photo that member could already see.
  const mediaRefs: Array<{ kind: 'property_photo'; id: string; type: 'image' }> = [];
  if (cover?.storage_path) {
    const { data: signed } = await supabase.storage
      .from(cover.storage_bucket || 'property-media')
      .createSignedUrl(cover.storage_path, MEDIA_PREVIEW_TTL_SECONDS);
    imageUrl = signed?.signedUrl ?? null;
    mediaRefs.push({ kind: 'property_photo', id: cover.id, type: 'image' });
  }

  const price = money(property.price, property.currency ?? 'EUR');
  const where = [property.town, property.region].filter(Boolean).join(', ');
  const facts = [
    property.bedrooms != null ? `${property.bedrooms} bed` : null,
    property.bathrooms != null ? `${property.bathrooms} bath` : null,
  ].filter(Boolean).join(' · ');
  const listingUrl = property.public_listing_token ? `${appUrl}/p/${property.public_listing_token}` : null;

  const caption = [
    property.transaction_type === 'rent' ? 'New to let' : 'New to the market',
    property.title || null,
    where || null,
    [facts, price].filter(Boolean).join(' — ') || null,
    listingUrl,
  ].filter(Boolean).join('\n');

  const hashtags = [
    'property',
    property.transaction_type === 'rent' ? 'tolet' : 'forsale',
    property.property_type,
    property.town ? String(property.town).toLowerCase().replace(/[^a-z0-9]/g, '') : null,
  ].filter(Boolean) as string[];

  const rows = accounts.map((a: any) => ({
    workspace_id: property.workspace_id,
    // A social_posts row needs an owning user. The account's own owner is the right one — it is
    // their connected channel, and it keeps the row visible to them under the existing RLS.
    user_id: a.user_id,
    social_account_id: a.id,
    platform: a.platform,
    post_type: imageUrl ? 'image' : 'text',
    caption,
    hashtags,
    image_urls: imageUrl ? [imageUrl] : null,
    status: 'draft',
    metadata: {
      property_id: propertyId,
      source: 'realestate.listing_published',
      // Re-signed by zernio-api at publish time; see MEDIA_PREVIEW_TTL_SECONDS above.
      media_refs: mediaRefs,
    },
  }));

  const { data: inserted, error } = await supabase.from('social_posts').insert(rows).select('id');
  if (error) throw new HttpError(400, error.message);

  return new Response(
    JSON.stringify({ ok: true, posts: inserted?.length ?? 0, drafted_for: accounts.map((a: any) => a.platform), has_image: !!imageUrl }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}));
