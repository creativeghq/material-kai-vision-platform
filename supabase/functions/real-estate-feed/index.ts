// deno-lint-ignore-file no-explicit-any
// Real Estate syndication PULL feed. A portal fetches a tokenized XML feed of a workspace's
// live public listings (GET .../real-estate-feed?token=...&format=kyero|generic). This is the in-repo
// half of syndication; FTP/POST push to specific portals lives on the MIVAA backend. Exposes ONLY
// toPublic() fields for active + public listings; the token gates cross-workspace enumeration.
import { createClient } from '@supabase/supabase-js';
import { withApiLogging } from '../_shared/api-logger.ts';
import { toPublic } from '../_shared/real-estate.ts';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type' };
const xml = (s: string) => new Response(s, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/xml; charset=utf-8' } });
const err = (msg: string, status = 400) => new Response(`<?xml version="1.0"?><error>${escapeXml(msg)}</error>`, { status, headers: { ...corsHeaders, 'Content-Type': 'application/xml; charset=utf-8' } });

/**
 * XML text/attribute escape (predefined entities).
 *
 * NOT named `esc`: invariant 11 forbids that name precisely because three unrelated contracts —
 * HTML escaper, PostgREST filter sanitizer, XML/CSV quoter — all used it, and a copy-paste between
 * two of them is a silent injection with no type error. XML entities are not HTML entities
 * (`&apos;` is invalid in HTML4), so this must never be swapped for escapeHtml.
 */
function escapeXml(v: any): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

Deno.serve(withApiLogging('real-estate-feed', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  const url = new URL(req.url);
  let token = url.searchParams.get('token') ?? '';
  let format = url.searchParams.get('format') ?? '';
  if (req.method === 'POST') { try { const b = await req.json(); token = token || b.token; format = format || b.format; } catch { /* ignore */ } }
  if (!token) return err('token is required', 400);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  const { data: settings } = await supabase.from('real_estate_settings').select('workspace_id, feed_enabled, feed_format').eq('feed_token', token).maybeSingle();
  if (!settings || !settings.feed_enabled) return err('feed not found or disabled', 404);
  format = format || settings.feed_format || 'kyero';

  // Respect the per-listing external-distribution opt-in: the syndication feed is third-party
  // portal export, so it must honor `in_discovery` exactly as the cross-workspace `discover` action
  // does. A listing published only to the agency's own portal (in_discovery=false) must NOT leak into
  // the Kyero/OpenImmo feed. (deactivate_listing also clears in_discovery, so pulled listings drop out.)
  const { data: rows } = await supabase.from('properties').select('*')
    .eq('workspace_id', settings.workspace_id).eq('is_public', true).eq('listing_status', 'active')
    .eq('in_discovery', true)
    .order('published_at', { ascending: false }).limit(500);
  const listings = rows ?? [];

  // Sign all photos per listing (one query).
  const ids = listings.map((l: any) => l.id);
  const photosByProp: Record<string, string[]> = {};
  if (ids.length) {
    const { data: photos } = await supabase.from('property_photos').select('property_id, storage_path, sort_order').in('property_id', ids).order('sort_order');
    await Promise.all((photos ?? []).map(async (ph: any) => {
      const { data: s } = await supabase.storage.from('property-media').createSignedUrl(ph.storage_path, 60 * 60 * 24 * 7);
      if (s?.signedUrl) (photosByProp[ph.property_id] ||= []).push(s.signedUrl);
    }));
  }

  const pubs = listings.map((l: any) => ({ raw: l, pub: toPublic(l), images: photosByProp[l.id] ?? [] }));
  if (format === 'generic') return xml(renderGeneric(pubs));
  if (format === 'openimmo') return xml(renderOpenImmo(pubs));
  return xml(renderKyero(pubs));
}));

function priceFreq(tx: string): string {
  if (tx === 'rent' || tx === 'short_let') return 'rent';
  return 'sale';
}

function renderKyero(items: Array<{ raw: any; pub: any; images: string[] }>): string {
  const props = items.map(({ pub, images }) => {
    const imgs = images.map((u, i) => `      <image id="${i + 1}"><url>${escapeXml(u)}</url></image>`).join('\n');
    return `  <property>
    <id>${escapeXml(pub.id)}</id>
    <ref>${escapeXml(pub.reference_code ?? pub.id)}</ref>
    <price>${escapeXml(pub.price ?? 0)}</price>
    <currency>${escapeXml(pub.currency ?? 'EUR')}</currency>
    <price_freq>${escapeXml(priceFreq(pub.transaction_type))}</price_freq>
    <type>${escapeXml(pub.subtype || pub.property_type)}</type>
    <town>${escapeXml(pub.town ?? '')}</town>
    <province>${escapeXml(pub.region ?? pub.prefecture ?? '')}</province>
    <country>${escapeXml(pub.country_code ?? '')}</country>
    <location><latitude>${escapeXml(pub.lat ?? '')}</latitude><longitude>${escapeXml(pub.lng ?? '')}</longitude></location>
    <beds>${escapeXml(pub.bedrooms ?? '')}</beds>
    <baths>${escapeXml(pub.bathrooms ?? '')}</baths>
    <surface_area><built>${escapeXml(pub.area_built ?? '')}</built><plot>${escapeXml(pub.plot_area ?? pub.area_plot ?? '')}</plot></surface_area>
    <energy_rating><consumption>${escapeXml(pub.energy_class ?? '')}</consumption></energy_rating>
    <desc><en>${escapeXml(pub.description_i18n?.en ?? '')}</en><el>${escapeXml(pub.description_i18n?.el ?? '')}</el></desc>
    <images>
${imgs}
    </images>
  </property>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<root>
  <kyero><feed_version>3</feed_version></kyero>
${props}
</root>`;
}

/** OpenImmo v1.2.7 (DACH standard). Minimal-but-valid subset covering the common consumer fields. */
function renderOpenImmo(items: Array<{ raw: any; pub: any; images: string[] }>): string {
  const objektart = (p: any) => {
    if (p.property_type === 'land') return '<grundstueck/>';
    if (p.property_type === 'commercial') return '<gewerbe gewerbe_typ="EINZELHANDEL"/>';
    return '<wohnung wohnung_typ="ETAGE"/>';
  };
  const props = items.map(({ pub, images }) => {
    const isRent = pub.transaction_type === 'rent' || pub.transaction_type === 'short_let';
    const priceTag = pub.price != null
      ? (isRent ? `<kaltmiete>${escapeXml(pub.price)}</kaltmiete>` : `<kaufpreis>${escapeXml(pub.price)}</kaufpreis>`)
      : '';
    const imgs = images.map((u, i) => `        <anhang location="EXTERN" gruppe="BILD"><anhangtitel>Bild ${i + 1}</anhangtitel><daten><pfad>${escapeXml(u)}</pfad></daten></anhang>`).join('\n');
    return `    <immobilie>
      <objektkategorie>
        <nutzungsart WOHNEN="${pub.property_type === 'commercial' ? 'false' : 'true'}" GEWERBE="${pub.property_type === 'commercial' ? 'true' : 'false'}"/>
        <vermarktungsart KAUF="${isRent ? 'false' : 'true'}" MIETE_PACHT="${isRent ? 'true' : 'false'}"/>
        <objektart>${objektart(pub)}</objektart>
      </objektkategorie>
      <geo>
        <plz>${escapeXml(pub.postcode ?? '')}</plz><ort>${escapeXml(pub.town ?? '')}</ort>
        <bundesland>${escapeXml(pub.region ?? '')}</bundesland><land iso_land="${escapeXml((pub.country_code ?? 'GR').toUpperCase())}"/>
        ${pub.lat != null && pub.lng != null ? `<geokoordinaten breitengrad="${escapeXml(pub.lat)}" laengengrad="${escapeXml(pub.lng)}"/>` : ''}
      </geo>
      <preise>${priceTag}<waehrung iso_waehrung="${escapeXml(pub.currency ?? 'EUR')}"/></preise>
      <flaechen>
        ${pub.area_built != null ? `<wohnflaeche>${escapeXml(pub.area_built)}</wohnflaeche>` : ''}
        ${(pub.plot_area ?? pub.area_plot) != null ? `<grundstuecksflaeche>${escapeXml(pub.plot_area ?? pub.area_plot)}</grundstuecksflaeche>` : ''}
        ${pub.bedrooms != null ? `<anzahl_schlafzimmer>${escapeXml(pub.bedrooms)}</anzahl_schlafzimmer>` : ''}
        ${pub.bathrooms != null ? `<anzahl_badezimmer>${escapeXml(pub.bathrooms)}</anzahl_badezimmer>` : ''}
      </flaechen>
      <zustand_angaben>
        ${pub.year_built != null ? `<baujahr>${escapeXml(pub.year_built)}</baujahr>` : ''}
        ${pub.energy_class ? `<energiepass><epart>ENDENERGIEBEDARF</epart><wertklasse>${escapeXml(pub.energy_class)}</wertklasse></energiepass>` : ''}
      </zustand_angaben>
      <freitexte>
        <objekttitel>${escapeXml(pub.title ?? '')}</objekttitel>
        <objektbeschreibung>${escapeXml(pub.description_i18n?.en || pub.description_i18n?.el || '')}</objektbeschreibung>
      </freitexte>
      <anhaenge>
${imgs}
      </anhaenge>
      <verwaltung_techn>
        <objektnr_extern>${escapeXml(pub.reference_code ?? pub.id)}</objektnr_extern>
        <aktion/>
      </verwaltung_techn>
    </immobilie>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<openimmo>
  <uebertragung art="ONLINE" umfang="VOLL" modus="NEU" version="1.2.7" sendersoftware="MaterialsHub"/>
  <anbieter>
${props}
  </anbieter>
</openimmo>`;
}

function renderGeneric(items: Array<{ raw: any; pub: any; images: string[] }>): string {
  const props = items.map(({ pub, images }) => {
    const imgs = images.map((u) => `      <image>${escapeXml(u)}</image>`).join('\n');
    const feats = (Array.isArray(pub.features) ? pub.features : []).map((f: string) => `      <feature>${escapeXml(f)}</feature>`).join('\n');
    return `  <listing>
    <id>${escapeXml(pub.id)}</id>
    <reference>${escapeXml(pub.reference_code ?? '')}</reference>
    <title>${escapeXml(pub.title ?? '')}</title>
    <property_type>${escapeXml(pub.property_type)}</property_type>
    <transaction_type>${escapeXml(pub.transaction_type)}</transaction_type>
    <price>${escapeXml(pub.price ?? '')}</price>
    <currency>${escapeXml(pub.currency ?? 'EUR')}</currency>
    <town>${escapeXml(pub.town ?? '')}</town>
    <region>${escapeXml(pub.region ?? '')}</region>
    <country>${escapeXml(pub.country_code ?? '')}</country>
    <bedrooms>${escapeXml(pub.bedrooms ?? '')}</bedrooms>
    <bathrooms>${escapeXml(pub.bathrooms ?? '')}</bathrooms>
    <area_built>${escapeXml(pub.area_built ?? '')}</area_built>
    <energy_class>${escapeXml(pub.energy_class ?? '')}</energy_class>
    <description>${escapeXml(pub.description_i18n?.en || pub.description_i18n?.el || '')}</description>
    <features>
${feats}
    </features>
    <images>
${imgs}
    </images>
  </listing>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<listings count="${items.length}">
${props}
</listings>`;
}
