/**
 * Pinterest Import Edge Function
 *
 * Handles pin URL extraction and import into moodboards (no OAuth required).
 * Uses Pinterest oEmbed API for metadata extraction.
 *
 * Actions:
 *   extract_pin      - Extract pin metadata via oEmbed
 *   import_pin       - Import a single pin into a moodboard
 *   import_pins_bulk - Import multiple pins into a moodboard
 */

import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MIVAA_GATEWAY_URL = Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';

interface PinData {
  title: string;
  image_url: string;
  author: string;
  source_url: string;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Extract pin ID from various Pinterest URL formats
 */
function extractPinId(pinUrl: string): string | null {
  // Matches: pinterest.com/pin/123456/, www.pinterest.com/pin/123456789/, etc.
  const match = pinUrl.match(/pinterest\.com\/pin\/(\d+)/i);
  return match ? match[1] : null;
}

/**
 * Fetch pin metadata via Pinterest oEmbed API
 */
async function extractPinData(pinUrl: string): Promise<PinData> {
  const oembedUrl = `https://www.pinterest.com/oembed.json?url=${encodeURIComponent(pinUrl)}`;
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
  const res = await fetch(imageUrl);
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
  supabase: ReturnType<typeof createClient>,
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
 * Import a single pin into a moodboard
 */
async function importSinglePin(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  pinUrl: string,
  moodboardId: string,
  autoMatch: boolean,
): Promise<{
  success: boolean;
  moodboard_item_id?: string;
  image_url?: string;
  matches?: unknown[];
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

    // 6. Auto-match if requested
    let matches: unknown[] = [];
    if (autoMatch) {
      try {
        const searchRes = await fetch(`${MIVAA_GATEWAY_URL}/api/rag/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: pinData.title, top_k: 5 }),
        });

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          matches = searchData.results || searchData.matches || [];
        }
      } catch (err) {
        console.warn('[pinterest-import] Auto-match failed:', err);
        // Non-fatal — continue without matches
      }
    }

    return {
      success: true,
      moodboard_item_id: moodboardItem.id,
      image_url: publicUrl,
      matches,
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

    const result = await importSinglePin(supabase, userId, pin_url, moodboard_id, auto_match);

    if (!result.success) {
      return jsonResponse({ success: false, error: result.error }, 400);
    }

    return jsonResponse({
      success: true,
      moodboard_item_id: result.moodboard_item_id,
      image_url: result.image_url,
      matches: result.matches,
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
      const result = await importSinglePin(supabase, userId, pinUrl, moodboard_id, auto_match);
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
