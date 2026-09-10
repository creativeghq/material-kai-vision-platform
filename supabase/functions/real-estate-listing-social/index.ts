/** real-estate-listing-social — turns a published listing into a ready-to-publish social post. */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { isCronAuthorized } from '../_shared/auth.ts';

/** A draft is only ever a PREVIEW url, and it must not be the thing that gets published. */
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
    // The COLUMN, not `metadata` (#378 N6). The link was always recorded, as a jsonb key with no
    // foreign key, no index and no way for any derivation to join it — which is why "marketing
    // ROI is structurally unanswerable" was true of data that was already being written.
    .eq('property_id', propertyId);
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
    // The subject, as a real column with a real FK. `metadata.source` stays because it answers a
    // different question — WHY this post exists, not what it is about.
    property_id: propertyId,
    metadata: {
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
