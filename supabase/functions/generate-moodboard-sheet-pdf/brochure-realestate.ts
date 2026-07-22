// deno-lint-ignore-file no-explicit-any
// #249 P2 — Property brochure PDF. Folded into generate-moodboard-sheet-pdf (merge-functions rule)
// so it reuses the same pdf-lib + layout stack the moodboard sheets / client views use. A3 landscape:
// cover (hero photo + title + price + location + agent block) → facts + description → photo gallery.
// Output lands in the protected `property-media` bucket (private; signed URL returned).
import { PDFDocument, rgb } from 'pdf-lib';
import {
  loadFonts, embedImageBytes, wrapText, truncate,
  PAGE_W, PAGE_H, MARGIN, COLOR_DARK, COLOR_GRAY, COLOR_WHITE,
} from './layout.ts';
import { userCanAccessWorkspace } from '../_shared/auth.ts';
import { assertEntitled } from '../_shared/entitlement.ts';
import { isModuleEnabled } from '../_shared/modules/registry.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const ACCENT = rgb(0.85, 0.15, 0.45); // magenta accent (matches the platform primary)
const money = (n: number | null, ccy: string) =>
  n == null ? 'Price on request' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: ccy || 'EUR', maximumFractionDigits: 0 }).format(n);

/** Facts shown on the brochure, chosen by category so a plot/warehouse reads correctly. */
function factsFor(p: any): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const add = (label: string, v: any, suffix = '') => { if (v !== null && v !== undefined && v !== '') out.push([label, `${v}${suffix}`]); };
  add('Type', p.subtype || p.property_type);
  add('For', String(p.transaction_type || '').replace('_', ' '));
  if (p.property_type === 'land') {
    add('Plot area', p.plot_area ?? p.area_plot, ' m²');
    add('Building coeff. (ΣΔ)', p.building_coefficient);
    add('Coverage', p.coverage_ratio);
    add('Zoning', p.land_use);
  } else if (p.property_type === 'commercial') {
    add('Gross area', p.gross_area ?? p.area_built, ' m²');
    add('Frontage', p.frontage, ' m');
    add('Ceiling height', p.ceiling_height, ' m');
    add('Yield', p.cap_rate, '%');
    add('Permitted use', p.permitted_use);
  } else {
    add('Bedrooms', p.bedrooms);
    add('Bathrooms', p.bathrooms);
    add('Built area', p.area_built, ' m²');
    add('Floor', p.floor);
    add('Year built', p.year_built);
    add('Parking', p.parking_spaces);
  }
  add('Energy class', p.energy_class);
  if (p.transaction_type === 'short_let') add('Max guests', p.max_guests);
  return out.slice(0, 10);
}

async function signedBytes(supabase: any, path: string): Promise<Uint8Array | null> {
  try {
    const { data } = await supabase.storage.from('property-media').createSignedUrl(path, 600);
    if (!data?.signedUrl) return null;
    const res = await fetch(data.signedUrl);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch { return null; }
}

export async function buildPropertyBrochurePdf(supabase: any, auth: any, propertyId: string): Promise<Response> {
  if (!propertyId) return json({ success: false, error: 'property_id required' }, 400);

  const { data: property } = await supabase.from('properties').select('*').eq('id', propertyId).maybeSingle();
  if (!property) return json({ success: false, error: 'not found' }, 404);
  const ws = property.workspace_id;

  // Gates (mirror real-estate-api): caller ↔ workspace, module publish, entitlement.
  if (!auth?.isService) {
    if (!auth?.userId || !(await userCanAccessWorkspace(supabase, auth.userId, ws))) return json({ success: false, error: 'not found' }, 404);
  }
  if (!(await isModuleEnabled(supabase, 'real-estate'))) return json({ success: false, error: 'Real Estate module is not available' }, 404);
  const ent = await assertEntitled(supabase, ws, 'real-estate');
  if (!ent.ok) return ent.response;

  const { data: photoRows } = await supabase.from('property_photos')
    .select('storage_path, is_cover, sort_order, caption').eq('property_id', propertyId).order('sort_order');
  const photos = (photoRows ?? []).slice(0, 13);
  const coverIdx = Math.max(0, photos.findIndex((p: any) => p.is_cover));

  const pdf = await PDFDocument.create();
  const { regular, bold } = await loadFonts(pdf);
  const hide = !!property.hide_exact_address;
  const location = [property.town, property.region, property.prefecture, property.country_code]
    .filter(Boolean).join(', ') + (hide ? '' : (property.address ? ` · ${property.address}${property.street_number ? ' ' + property.street_number : ''}` : ''));

  // ── Page 1 — cover ──
  const cover = pdf.addPage([PAGE_W, PAGE_H]);
  const heroBytes = photos.length ? await signedBytes(supabase, photos[coverIdx].storage_path) : null;
  const heroImg = heroBytes ? await embedImageBytes(pdf, heroBytes) : null;
  const heroH = PAGE_H * 0.62;
  if (heroImg) {
    const scale = Math.max(PAGE_W / heroImg.width, heroH / heroImg.height);
    const w = heroImg.width * scale, h = heroImg.height * scale;
    cover.drawImage(heroImg, { x: (PAGE_W - w) / 2, y: PAGE_H - heroH + (heroH - h) / 2, width: w, height: h });
  } else {
    cover.drawRectangle({ x: 0, y: PAGE_H - heroH, width: PAGE_W, height: heroH, color: rgb(0.9, 0.9, 0.92) });
  }
  // dark band for title
  cover.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H - heroH, color: COLOR_DARK });
  const titleY = PAGE_H - heroH - 60;
  cover.drawText(truncate(property.title || 'Property listing', 60), { x: MARGIN, y: titleY, size: 34, font: bold, color: COLOR_WHITE });
  cover.drawText(truncate(location, 90), { x: MARGIN, y: titleY - 30, size: 14, font: regular, color: rgb(0.8, 0.8, 0.85) });
  cover.drawText(money(property.price_on_request ? null : property.price, property.currency), { x: MARGIN, y: titleY - 70, size: 26, font: bold, color: rgb(1, 0.55, 0.75) });
  if (property.reference_code) cover.drawText(`Ref ${property.reference_code}`, { x: PAGE_W - MARGIN - 120, y: 30, size: 10, font: regular, color: rgb(0.7, 0.7, 0.75) });
  if (property.agent_license_no) cover.drawText(`Licence ${property.agent_license_no}`, { x: MARGIN, y: 30, size: 10, font: regular, color: rgb(0.7, 0.7, 0.75) });

  // ── Page 2 — facts + description ──
  const p2 = pdf.addPage([PAGE_W, PAGE_H]);
  p2.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: rgb(0.985, 0.985, 0.99) });
  p2.drawText('Overview', { x: MARGIN, y: PAGE_H - MARGIN - 10, size: 20, font: bold, color: COLOR_DARK });
  p2.drawRectangle({ x: MARGIN, y: PAGE_H - MARGIN - 22, width: 60, height: 3, color: ACCENT });
  // facts (left column)
  const facts = factsFor(property);
  let fy = PAGE_H - MARGIN - 60;
  for (const [label, val] of facts) {
    p2.drawText(label, { x: MARGIN, y: fy, size: 10, font: regular, color: COLOR_GRAY });
    p2.drawText(truncate(String(val), 34), { x: MARGIN, y: fy - 14, size: 14, font: bold, color: COLOR_DARK });
    fy -= 40;
  }
  // description (right column)
  const descX = PAGE_W / 2, descW = PAGE_W - descX - MARGIN;
  const desc = property.description_i18n?.en || property.description_i18n?.el || '';
  p2.drawText('Description', { x: descX, y: PAGE_H - MARGIN - 60, size: 12, font: bold, color: COLOR_DARK });
  let dy = PAGE_H - MARGIN - 82;
  for (const line of wrapText(desc, regular, 11, descW).slice(0, 34)) {
    p2.drawText(line, { x: descX, y: dy, size: 11, font: regular, color: rgb(0.25, 0.25, 0.3) });
    dy -= 16;
  }
  const feats: string[] = Array.isArray(property.features) ? property.features : [];
  if (feats.length && dy > MARGIN + 40) {
    dy -= 10;
    p2.drawText('Features', { x: descX, y: dy, size: 12, font: bold, color: COLOR_DARK });
    dy -= 20;
    p2.drawText(truncate(feats.join(' · '), 90), { x: descX, y: dy, size: 10, font: regular, color: COLOR_GRAY });
  }

  // ── Gallery pages (remaining photos, 3×2 per page) ──
  const rest = photos.filter((_: any, i: number) => i !== coverIdx);
  for (let i = 0; i < rest.length; i += 6) {
    const gp = pdf.addPage([PAGE_W, PAGE_H]);
    const cols = 3, rows = 2, gap = 16;
    const cw = (PAGE_W - MARGIN * 2 - gap * (cols - 1)) / cols;
    const ch = (PAGE_H - MARGIN * 2 - gap * (rows - 1)) / rows;
    for (let j = 0; j < 6 && i + j < rest.length; j++) {
      const bytes = await signedBytes(supabase, rest[i + j].storage_path);
      const img = bytes ? await embedImageBytes(pdf, bytes) : null;
      const col = j % cols, row = Math.floor(j / cols);
      const x = MARGIN + col * (cw + gap), y = PAGE_H - MARGIN - ch - row * (ch + gap);
      if (img) {
        const scale = Math.max(cw / img.width, ch / img.height);
        const w = img.width * scale, h = img.height * scale;
        // clip by drawing into the cell bounds (approx — center-crop)
        gp.drawImage(img, { x: x + (cw - w) / 2, y: y + (ch - h) / 2, width: w, height: h });
        gp.drawRectangle({ x, y, width: cw, height: ch, borderColor: rgb(0.9, 0.9, 0.9), borderWidth: 0.5 });
      } else {
        gp.drawRectangle({ x, y, width: cw, height: ch, color: rgb(0.93, 0.93, 0.95) });
      }
    }
  }

  const bytes = await pdf.save();
  const path = `${ws}/${propertyId}/brochure-${Date.now()}.pdf`;
  const up = await supabase.storage.from('property-media').upload(path, bytes, { contentType: 'application/pdf', upsert: true });
  if (up.error) return json({ success: false, error: up.error.message }, 400);
  const { data: signed } = await supabase.storage.from('property-media').createSignedUrl(path, 60 * 60 * 24 * 7);
  return json({ success: true, pdf_url: signed?.signedUrl ?? null, storage_path: path, page_count: pdf.getPageCount() });
}
