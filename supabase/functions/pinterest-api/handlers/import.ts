/** Pinterest Import Edge Function */

import type { DbClient } from '../../_shared/supabase-client.ts';
import { jsonResponse } from '../../_shared/http.ts';
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate, listUserWorkspaceIds, userCanAccessWorkspace } from '../../_shared/auth.ts';
import { assertSafeUrl } from '../../_shared/ssrf-guard.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MIVAA_GATEWAY_URL = Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';

interface PinData {
  title: string;
  image_url: string;
  author: string;
  source_url: string;
}


/**
 * Pinterest hosts we accept a pin URL from (#360 CB-10).
 *
 * `pinterest.com` plus its country domains (`pinterest.co.uk`, `pinterest.de`, …) and the `pin.it`
 * shortener, which redirects into one of them.
 */
const PINTEREST_HOST = /^(?:[a-z0-9-]+\.)*pinterest\.[a-z.]{2,6}$|^pin\.it$/i;

/** Is this actually a Pinterest pin URL? (#360 CB-10) */
function parsePinterestUrl(pinUrl: string): { url: URL; pinId: string | null } | null {
  let url: URL;
  try {
    url = new URL(String(pinUrl).trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!PINTEREST_HOST.test(url.hostname)) return null;
  const m = url.pathname.match(/^\/pin\/(\d+)/);
  return { url, pinId: m ? m[1] : null };
}

/**
 * Extract pin ID from various Pinterest URL formats.
 *
 * Host-checked first — see parsePinterestUrl. A number lifted out of a foreign URL is not a pin id.
 */
function extractPinId(pinUrl: string): string | null {
  return parsePinterestUrl(pinUrl)?.pinId ?? null;
}

/**
 * Fetch pin metadata via Pinterest oEmbed API
 */
async function extractPinData(pinUrl: string): Promise<PinData> {
  const parsed = parsePinterestUrl(pinUrl);
  if (!parsed) {
    throw new Error('That is not a Pinterest pin URL. Copy the link from a pin — it looks like https://www.pinterest.com/pin/123456789/');
  }
  // The normalised URL, not the caller's string: a fragment, a userinfo prefix or a stray
  // whitespace-encoded suffix should not travel to the provider.
  const oembedUrl = `https://www.pinterest.com/oembed.json?url=${encodeURIComponent(parsed.url.toString())}`;
  const res = await fetch(oembedUrl);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pinterest oEmbed API error ${res.status}: ${text}`);
  }

  const data = await res.json();

  return {
    title: data.title || 'Untitled Pin',
    image_url: data.thumbnail_url || '',
    author: data.author_name || 'Unknown',
    source_url: pinUrl,
  };
}

/**
 * Download image from URL and return as Uint8Array
 */
async function downloadImage(imageUrl: string): Promise<Uint8Array> {
  // SSRF (invariant #7): thumbnail_url comes from the oEmbed response for a USER-supplied pin, so a
  // crafted pin could point it at an internal host / 169.254.169.254. Validate + block redirects,
  // exactly as the VR function does for its user-image fetch.
  const safeUrl = await assertSafeUrl(imageUrl);
  const res = await fetch(safeUrl, { redirect: 'error' });
  if (!res.ok) {
    throw new Error(`Failed to download image: ${res.status}`);
  }
  const buffer = await res.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Verify the authenticated user owns the target moodboard. The edge function
 * uses the service-role supabase client (RLS bypassed) so this check is the
 * only barrier between an authenticated user and someone else's moodboard.
 */
async function assertMoodboardOwner(
  supabase: DbClient,
  moodboardId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { data, error } = await supabase
    .from('moodboards')
    .select('user_id')
    .eq('id', moodboardId)
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: `Moodboard lookup failed: ${error.message}` };
  if (!data) return { ok: false, status: 404, error: 'Moodboard not found' };
  if (data.user_id !== userId) return { ok: false, status: 403, error: 'You do not own this moodboard' };
  return { ok: true };
}

/**
 * The catalogue a pin is matched against. Moodboards carry no workspace, so: the moodboard's
 * project's workspace, else the caller's active-workspace hint, else their only workspace —
 * each accepted only when the caller is an active member of it (invariant 1).
 */
async function resolveMatchWorkspace(
  supabase: DbClient,
  userId: string,
  moodboardId: string,
  hint: unknown,
): Promise<string | null> {
  const { data: mb } = await supabase.from('moodboards').select('project_id').eq('id', moodboardId).maybeSingle();
  if (mb?.project_id) {
    const { data: proj } = await supabase.from('projects').select('workspace_id').eq('id', mb.project_id).maybeSingle();
    if (proj?.workspace_id && await userCanAccessWorkspace(supabase, userId, proj.workspace_id)) return proj.workspace_id;
  }
  if (typeof hint === 'string' && hint && await userCanAccessWorkspace(supabase, userId, hint)) return hint;
  const memberships = await listUserWorkspaceIds(supabase, userId);
  return memberships.length === 1 ? memberships[0] : null;
}

interface CatalogMatch {
  product_id: string;
  product_name: string;
  similarity: number;
  image_url?: string;
}

// deno-lint-ignore no-explicit-any
function toCatalogMatch(r: any): CatalogMatch | null {
  const id = r?.product_id ?? r?.id;
  const name = r?.product_name ?? r?.name;
  if (!id || !name) return null;
  const score = typeof r.score === 'number' ? r.score : (typeof r.similarity_score === 'number' ? r.similarity_score : 0);
  const image = r.image_url ?? r.thumbnail ?? r.related_images?.[0]?.url ?? r.metadata?.image_url;
  return { product_id: String(id), product_name: String(name), similarity: score, ...(image ? { image_url: String(image) } : {}) };
}

async function matchPinAgainstCatalog(
  imageUrl: string,
  workspaceId: string,
): Promise<{ matches: CatalogMatch[] } | { error: string }> {
  const mivaaKey = Deno.env.get('MIVAA_API_KEY') || Deno.env.get('MATERIAL_KAI_API_KEY') || '';
  try {
    const res = await fetch(`${MIVAA_GATEWAY_URL}/api/rag/search?strategy=multi_vector`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(mivaaKey ? { Authorization: `Bearer ${mivaaKey}` } : {}),
      },
      // Image only: a pin title ("Untitled Pin") is not a query worth embedding.
      body: JSON.stringify({ query: '', image_url: imageUrl, workspace_id: workspaceId, top_k: 5 }),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      console.error(`[pinterest-import] auto-match failed: MIVAA ${res.status} ${detail}`);
      return { error: `Catalog match failed (search service returned ${res.status})` };
    }
    const data = await res.json();
    const rows = Array.isArray(data?.results) ? data.results : [];
    return { matches: rows.map(toCatalogMatch).filter((m: CatalogMatch | null): m is CatalogMatch => m !== null) };
  } catch (err) {
    console.error('[pinterest-import] auto-match failed:', err);
    return { error: 'Catalog match failed (search service unreachable)' };
  }
}

/**
 * Import a single pin into a moodboard
 */
async function importSinglePin(
  supabase: DbClient,
  userId: string,
  pinUrl: string,
  moodboardId: string,
  autoMatch: boolean,
  workspaceHint: unknown,
): Promise<{
  success: boolean;
  moodboard_item_id?: string;
  image_url?: string;
  matches?: CatalogMatch[];
  match_error?: string;
  error?: string;
}> {
  try {
    // 0. RBAC: verify caller owns this moodboard. The function runs with the
    // service role key so RLS doesn't gate writes to moodboard_items — without
    // this explicit ownership check, any authenticated user could attach
    // imported pins to anyone else's moodboard by passing a guessed UUID.
    const { data: mb, error: mbErr } = await supabase
      .from('moodboards')
      .select('user_id')
      .eq('id', moodboardId)
      .maybeSingle();
    if (mbErr || !mb) {
      return { success: false, error: 'Moodboard not found' };
    }
    if (mb.user_id !== userId) {
      return { success: false, error: 'Not authorized for this moodboard' };
    }

    // 1. Extract pin data via oEmbed
    const pinData = await extractPinData(pinUrl);
    const pinId = extractPinId(pinUrl);

    if (!pinData.image_url) {
      return { success: false, error: 'No image found for this pin' };
    }

    // 2. Download the image
    const imageBytes = await downloadImage(pinData.image_url);

    // 3. Upload to Supabase Storage
    const storagePath = `pinterest-imports/${userId}/${pinId || crypto.randomUUID()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from('generation-images')
      .upload(storagePath, imageBytes, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    // 4. Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('generation-images')
      .getPublicUrl(storagePath);

    const publicUrl = publicUrlData.publicUrl;

    // 5. Create moodboard item
    const { data: moodboardItem, error: insertError } = await supabase
      .from('moodboard_items')
      .insert({
        moodboard_id: moodboardId,
        material_id: null,
        media_url: publicUrl,
        media_type: 'image',
        media_title: pinData.title,
        notes: 'Imported from Pinterest',
      })
      .select('id')
      .single();

    if (insertError) {
      throw new Error(`Failed to create moodboard item: ${insertError.message}`);
    }

    // 6. Auto-match if requested. A failed match is reported as match_error, never as zero matches.
    let matches: CatalogMatch[] = [];
    let matchError: string | undefined;
    if (autoMatch) {
      const workspaceId = await resolveMatchWorkspace(supabase, userId, moodboardId, workspaceHint);
      if (!workspaceId) {
        matchError = 'Catalog match skipped: could not determine which workspace catalog to search';
      } else {
        const outcome = await matchPinAgainstCatalog(publicUrl, workspaceId);
        if ('error' in outcome) matchError = outcome.error;
        else matches = outcome.matches;
      }
    }

    return {
      success: true,
      moodboard_item_id: moodboardItem.id,
      image_url: publicUrl,
      matches,
      ...(matchError ? { match_error: matchError } : {}),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[pinterest-import] Failed to import pin ${pinUrl}:`, message);
    return { success: false, error: message };
  }
}

// ── Main Handler ────────────────────────────────────────────────────────────────

export async function handlePinterestImport(req: Request, body: any): Promise<Response> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const auth = await authenticate(req);

  if (!auth.user) {
    return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
  }

  const userId = auth.user.id;
  const { action } = body;

  // ── extract_pin ─────────────────────────────────────────────────────────────
  if (action === 'extract_pin') {
    const { pin_url } = body;

    if (!pin_url) {
      return jsonResponse({ success: false, error: 'pin_url is required' }, 400);
    }

    try {
      const pinData = await extractPinData(pin_url);
      return jsonResponse({ success: true, pin: pinData });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return jsonResponse({ success: false, error: message }, 400);
    }
  }

  // ── import_pin ──────────────────────────────────────────────────────────────
  if (action === 'import_pin') {
    const { pin_url, moodboard_id, auto_match = false } = body;

    if (!pin_url || !moodboard_id) {
      return jsonResponse({ success: false, error: 'pin_url and moodboard_id are required' }, 400);
    }

    // The function uses the service-role client (RLS bypassed). Without an
    // explicit ownership check, any authenticated user could write into any
    // moodboard by guessing/learning a UUID. Verify caller owns the target.
    const ownerCheck = await assertMoodboardOwner(supabase, moodboard_id, userId);
    if (!ownerCheck.ok) return jsonResponse({ success: false, error: ownerCheck.error }, ownerCheck.status);

    const result = await importSinglePin(supabase, userId, pin_url, moodboard_id, auto_match, body.workspace_id);

    if (!result.success) {
      return jsonResponse({ success: false, error: result.error }, 400);
    }

    return jsonResponse({
      success: true,
      moodboard_item_id: result.moodboard_item_id,
      image_url: result.image_url,
      matches: result.matches,
      ...(result.match_error ? { match_error: result.match_error } : {}),
    });
  }

  // ── import_pins_bulk ────────────────────────────────────────────────────────
  if (action === 'import_pins_bulk') {
    const { pin_urls, moodboard_id, auto_match = false } = body;

    if (!pin_urls || !Array.isArray(pin_urls) || pin_urls.length === 0) {
      return jsonResponse({ success: false, error: 'pin_urls array is required' }, 400);
    }

    if (!moodboard_id) {
      return jsonResponse({ success: false, error: 'moodboard_id is required' }, 400);
    }

    // RLS-bypass safety: explicitly verify ownership before bulk-inserting items.
    const ownerCheck = await assertMoodboardOwner(supabase, moodboard_id, userId);
    if (!ownerCheck.ok) return jsonResponse({ success: false, error: ownerCheck.error }, ownerCheck.status);

    const results = [];
    let imported = 0;
    let failed = 0;

    for (const pinUrl of pin_urls) {
      const result = await importSinglePin(supabase, userId, pinUrl, moodboard_id, auto_match, body.workspace_id);
      results.push({ pin_url: pinUrl, ...result });

      if (result.success) {
        imported++;
      } else {
        failed++;
      }
    }

    return jsonResponse({
      success: true,
      imported,
      failed,
      results,
    });
  }

  return jsonResponse({ success: false, error: `Unknown action: ${action}` }, 400);
}
