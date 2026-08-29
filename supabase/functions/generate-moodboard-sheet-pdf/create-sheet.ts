// Canonical sheet-CREATE pipeline — the single source of truth for turning
// {moodboard_id, sheet_type, title, initial_data} into a draft sheet row with
// credits debited and auto-enhanced data. Both callers go through here:
//   - the agent tool (generate_presentation_sheet) invokes this edge function
//     with {action:'create', ...} and translates the response into chat chunks;
//   - the SheetWizardModal (frontend) invokes it via moodboardSheetsService.
// Previously this logic lived ONLY in the agent tool, so the client path
// silently skipped credits + auto-extract. Now it lives here, beside the render.
// This module does NOT render the PDF. The handler renders passive types via its
// existing render block (so there's one renderer); interactive types return for
// the canvas. Refund-on-render-failure is handled by the handler.

import { getGenerationPrompt } from '../_shared/prompt-utils.ts';
import type { DbClient } from '../_shared/supabase-client.ts';
import { createClient } from '@supabase/supabase-js';
import { resolveTokenPrice } from '../_shared/ai-logger.ts';
import { fetchImageGuardedOrNull } from '../_shared/fetch-image.ts';
import { snapshotSheetAssets } from '../_shared/sheets/asset-refs.ts';

// One source (#391) — the generated mirror of src/services/moodboards/sheetVocabulary.ts.
export type { SheetType } from '../_shared/sheetVocabulary.generated.ts';
// Also imported: a re-export does not bind the name locally.
import type { SheetType } from '../_shared/sheetVocabulary.generated.ts';

type SupabaseClient = DbClient;

// Keep aligned with SHEET_TYPE_CREDITS (frontend) and the storage-cost trend.
export const SHEET_CREDITS: Record<SheetType, number> = {
  material_board: 1,
  color_palette: 2,
  concept_board: 1,
  ffe_schedule: 1,
  lighting_plan: 3,
  plumbing_plan: 3,
  electrical_plan: 3,
  annotated_render: 4,
  elevation_render_pair: 3,
  area_breakdown: 2,
  // Same as ffe_schedule: reads a table the platform already holds and renders it.
  scope_of_works: 1,
  full_deck: 5,
};

export const INTERACTIVE_TYPES: SheetType[] = [
  'lighting_plan',
  'plumbing_plan',
  'electrical_plan',
  'annotated_render',
  'elevation_render_pair',
  'full_deck',
];

export interface CreateSheetParams {
  userId: string;
  /** Moodboard parent. Omit for a project-owned technical plan. */
  moodboard_id?: string | null;
  /** Project parent. Used when the sheet is not attached to a moodboard. */
  project_id?: string | null;
  sheet_type: SheetType;
  title: string;
  initial_data?: Record<string, any>;
  auto_enhance?: boolean;
  auto_render?: boolean;
  /**
   * Project room this sheet documents. Provenance only — the backdrop is copied
   * into initial_data by the caller. Still verified against the caller's own
   * access before being stored, because a body-supplied id is never trusted
   * (security invariant 1), even when nothing later reads it back.
   */
  room_id?: string | null;
}

export type CreateSheetResult =
  | { ok: false; status: number; error: string; validation_error?: boolean }
  | {
      ok: true;
      interactive: boolean;
      sheet_id: string;
      sheet_type: SheetType;
      title: string;
      initial_data: Record<string, any>;
      credits_charged: number;
    };

/**
 * Validate the user owns the moodboard, auto-enhance the payload, validate it,
 * debit credits, and insert the draft row. Returns the inserted sheet (and
 * whether it's interactive) — the caller renders passive types.
 */
export async function createSheet(
  supabase: DbClient,
  params: CreateSheetParams,
): Promise<CreateSheetResult> {
  const { userId, moodboard_id, sheet_type, title } = params;
  const project_id = params.project_id ?? null;
  const auto_enhance = params.auto_enhance !== false;
  let initial_data = params.initial_data || {};

  // 1. Ownership of whichever parent is claimed. A technical plan belongs to a
  //    project; a presentation sheet belongs to a moodboard. Exactly one, matching
  //    the sheets_has_a_parent CHECK.
  if (!moodboard_id && !project_id) {
    return { ok: false, status: 400, error: 'A sheet needs either a moodboard_id or a project_id' };
  }

  if (moodboard_id) {
    const { data: moodboard, error: mbError } = await supabase
      .from('moodboards')
      .select('id, user_id')
      .eq('id', moodboard_id)
      .maybeSingle();
    if (mbError || !moodboard) return { ok: false, status: 404, error: 'Moodboard not found' };
    if ((moodboard as any).user_id !== userId) {
      // 404, not 403, on an ownership mismatch — a 403 confirms the id exists.
      return { ok: false, status: 404, error: 'Moodboard not found' };
    }
  } else {
    const { data: project, error: pjError } = await supabase
      .from('projects')
      .select('id, user_id')
      .eq('id', project_id!)
      .maybeSingle();
    if (pjError || !project) return { ok: false, status: 404, error: 'Project not found' };
    if ((project as any).user_id !== userId) {
      return { ok: false, status: 404, error: 'Project not found' };
    }
  }

  // 1a. room_id is caller-supplied, so verify the caller actually owns the
  //     project that room belongs to before storing it. Nothing later resolves
  //     this id server-side, but an unverified foreign id on a tenant row is the
  //     shape security invariant 1 exists to stop — and it would leak room
  //     existence through a foreign-key error otherwise. Silently dropped rather
  //     than 403'd: it is provenance metadata, not the point of the request.
  let safeRoomId: string | null = null;
  if (params.room_id) {
    const { data: room } = await supabase
      .from('project_rooms')
      .select('id, project:projects!inner(user_id)')
      .eq('id', params.room_id)
      .maybeSingle();
    if (room && (room as any).project?.user_id === userId) safeRoomId = params.room_id;
    else console.warn(`[createSheet] dropping room_id ${params.room_id} — not owned by ${userId}`);
  }

  // 1b. Auto-enhance — fill sensible defaults from the moodboard BEFORE validation.
  //     Both enhancers read the moodboard's own contents, so they only apply to a
  //     moodboard-parented sheet. A project-owned technical plan has no palette
  //     to extract and no moodboard imagery to detect callouts in.
  if (auto_enhance && moodboard_id) {
    if (sheet_type === 'color_palette' && (!initial_data.swatches || initial_data.swatches.length === 0)) {
      const swatches = await autoExtractPalette(supabase, moodboard_id, 8);
      if (swatches.length > 0) initial_data = { ...initial_data, swatches };
    }
    if (sheet_type === 'annotated_render' && initial_data.backdrop_image_url &&
        (!initial_data.annotations || initial_data.annotations.length === 0)) {
      const annotations = await autoDetectCallouts(supabase, userId, moodboard_id, initial_data.backdrop_image_url);
      if (annotations.length > 0) initial_data = { ...initial_data, annotations };
    }
  }

  // 1.5. Reject empty/incomplete content BEFORE debiting / inserting.
  const validationError = validateInitialData(sheet_type, initial_data);
  if (validationError) {
    return { ok: false, status: 422, error: `Sheet content is incomplete: ${validationError}`, validation_error: true };
  }

  // 2. Debit credits
  const creditCost = SHEET_CREDITS[sheet_type] ?? 0;
  if (creditCost > 0) {
    const { data: debitResult, error: debitError } = await supabase.rpc('debit_credits', {
      p_user_id: userId,
      p_amount: creditCost,
      p_operation_type: `presentation_sheet_${sheet_type}`,
      p_description: `Presentation sheet: ${sheet_type} (${title})`,
      p_metadata: { moodboard_id, sheet_type, title },
      p_workspace_id: null,  // moodboards are user-scoped (no workspace_id) → personal wallet
    });
    const result = Array.isArray(debitResult) ? debitResult[0] : debitResult;
    if (debitError || !(result as any)?.success) {
      const msg = (result as any)?.error_message || debitError?.message || 'Insufficient credits';
      return { ok: false, status: 402, error: `Credit debit failed: ${msg}` };
    }
    await supabase.from('ai_usage_logs').insert({
      user_id: userId,
      operation_type: `presentation_sheet_${sheet_type}`,
      model_name: 'presentation-sheet',
      api_provider: 'platform',
      input_tokens: 0, output_tokens: 0, input_cost_usd: 0, output_cost_usd: 0,
      raw_cost_usd: creditCost / 100, markup_multiplier: 1, billed_cost_usd: creditCost / 100,
      credits_debited: creditCost,
      // Post-call row; `success` is the key ops.silent_zero_provider reads.
      metadata: { success: true, feature: 'presentation_sheet', sheet_type, moodboard_id, title },
      created_at: new Date().toISOString(),
    });
  }

  // 3. Insert draft row
  const { data: sheet, error: insertError } = await supabase
    .from('moodboard_presentation_sheets')
    .insert({
      moodboard_id: moodboard_id ?? null,
      project_id,
      sheet_type, title,
      data: initial_data || {},
      credits_used: creditCost,
      status: 'draft',
      created_by: userId,
      room_id: safeRoomId,
    })
    .select('id')
    .single();

  if (insertError || !sheet) {
    if (creditCost > 0) {
      await supabase.rpc('refund_credits', {
        p_user_id: userId, p_amount: creditCost,
        p_operation_type: `presentation_sheet_${sheet_type}_refund`,
        p_description: 'Refund: sheet creation failed',
        p_metadata: { moodboard_id, sheet_type, reason: insertError?.message },
        p_workspace_id: null,
      });
    }
    return { ok: false, status: 500, error: insertError?.message || 'Failed to create sheet' };
  }

  // 3b. Snapshot the images into the sheet's own private folder (#392).
  //
  //     Runs AFTER the insert because the folder is keyed by sheet id, and after the credit
  //     debit because it is not the expensive part — a failed copy leaves the source URL in
  //     place, so this can never turn a paid-for sheet into a broken one. The row is written
  //     twice as a result; that is deliberate and NOT the create-then-stamp shape rule 4
  //     warns about, because the second write is idempotent: re-running the snapshot on a
  //     payload that already holds refs copies nothing and rewrites nothing, so a retry (or
  //     the next edit) repairs a half-copied sheet instead of duplicating anything.
  const sheetId = (sheet as any).id as string;
  const snapshot = await snapshotSheetAssets(supabase as any, sheetId, initial_data, fetchImageGuardedOrNull);
  const copied = Object.keys(snapshot.report.copied).length;
  const failed = Object.keys(snapshot.report.failed).length;
  if (copied > 0) {
    const { error: rewriteError } = await supabase
      .from('moodboard_presentation_sheets')
      .update({ data: snapshot.data })
      .eq('id', sheetId);
    if (rewriteError) {
      // The sheet is intact — it still points at the sources it was created from. Say so
      // rather than failing the create: a refunded sheet the operator has to make again is a
      // worse outcome than one whose images are not yet private.
      console.error(`[createSheet] ${sheetId}: asset refs not stored — ${rewriteError.message}`);
    } else {
      initial_data = snapshot.data as Record<string, any>;
    }
  }
  if (failed > 0) {
    console.warn(`[createSheet] ${sheetId}: ${failed}/${copied + failed} image(s) could not be copied `
      + `and still point at their source: ${JSON.stringify(snapshot.report.failed)}`);
  }

  return {
    ok: true,
    interactive: INTERACTIVE_TYPES.includes(sheet_type),
    sheet_id: sheetId,
    sheet_type,
    title,
    initial_data,
    credits_charged: creditCost,
  };
}

/** Refund a create-mode credit charge when the subsequent render fails. */
export async function refundSheetCredits(
  supabase: DbClient,
  userId: string,
  sheet_type: string,
  creditCost: number,
  reason: string,
): Promise<void> {
  if (creditCost <= 0) return;
  try {
    await supabase.rpc('refund_credits', {
      p_user_id: userId, p_amount: creditCost,
      p_operation_type: `presentation_sheet_${sheet_type}_refund`,
      p_description: 'Refund: PDF generation failed',
      p_metadata: { sheet_type, reason },
      p_workspace_id: null,
    });
  } catch (err) {
    console.error('[createSheet] refund failed:', err);
  }
}

// ── Auto-enhance helpers (ported verbatim from the agent tool) ───────────────

/**
 * Auto-extract a color palette from a moodboard's image items. Coarse 4×4×4 RGB
 * binning over a crude byte-stream pixel scan — no image decoder needed.
 */
async function autoExtractPalette(
  supabase: DbClient,
  moodboardId: string,
  maxSwatches = 8,
): Promise<{ hex: string; name: string }[]> {
  const { data: items } = await supabase
    .from('moodboard_items')
    .select('media_url, material_id')
    .eq('moodboard_id', moodboardId)
    .limit(20);

  const urls: string[] = (items || [])
    .map((it: any) => it.media_url)
    .filter((u: string | null): u is string => !!u)
    .slice(0, 6);
  if (urls.length === 0) return [];

  const bins = new Map<number, { count: number; r: number; g: number; b: number }>();
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      const step = Math.max(1, Math.floor(bytes.length / 8000));
      for (let i = 0; i + 2 < bytes.length; i += step) {
        const r = bytes[i], g = bytes[i + 1], b = bytes[i + 2];
        if (r === g && g === b && (r < 16 || r > 240)) continue;
        const key = ((r >> 6) << 4) | ((g >> 6) << 2) | (b >> 6);
        const bin = bins.get(key) || { count: 0, r: 0, g: 0, b: 0 };
        bin.count++; bin.r += r; bin.g += g; bin.b += b;
        bins.set(key, bin);
      }
    } catch { /* skip image errors */ }
  }

  const ranked = [...bins.values()].sort((a, b) => b.count - a.count).slice(0, maxSwatches);
  return ranked.map((bin) => {
    const r = Math.round(bin.r / bin.count);
    const g = Math.round(bin.g / bin.count);
    const b = Math.round(bin.b / bin.count);
    const hex = '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase();
    return { hex, name: namedFromHex(r, g, b) };
  });
}

/** Heuristic friendly name from RGB. */
function namedFromHex(r: number, g: number, b: number): string {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const lightness = (max + min) / 2 / 255;
  let baseHue = 'Neutral';
  if (max - min < 25) baseHue = lightness < 0.25 ? 'Charcoal' : lightness < 0.55 ? 'Stone' : lightness < 0.85 ? 'Bone' : 'Cream';
  else if (r >= g && r >= b) baseHue = g >= b ? (g > 130 ? 'Ochre' : 'Terracotta') : 'Rose';
  else if (g >= r && g >= b) baseHue = b > r ? 'Sage' : 'Moss';
  else baseHue = r > g ? 'Plum' : 'Slate';
  const tone = lightness < 0.3 ? 'Deep' : lightness < 0.55 ? 'Warm' : lightness < 0.8 ? 'Soft' : 'Light';
  return `${tone} ${baseHue}`;
}

/** Auto-detect up to 6 callouts on an annotated_render backdrop via Claude Vision. */
async function autoDetectCallouts(
  supabase: DbClient,
  userId: string,
  moodboardId: string,
  imageUrl: string,
): Promise<{ x: number; y: number; line_endpoint_x: number; line_endpoint_y: number; label: string; source: 'ai' }[]> {
  const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
  if (!ANTHROPIC_API_KEY) return [];

  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'url', url: imageUrl } },
            {
              type: 'text',
              text: await getGenerationPrompt(supabase, 'moodboard_sheet_elements'),
            },
          ],
        }],
      }),
    });
  } catch (fetchErr) {
    console.warn('[autoDetectCallouts] anthropic fetch failed:', fetchErr instanceof Error ? fetchErr.message : fetchErr);
    return [];
  }
  if (!res.ok) return [];
  const data = await res.json();

  try {
    const inputTokens = data?.usage?.input_tokens ?? 0;
    const outputTokens = data?.usage?.output_tokens ?? 0;
    // 0.80/4.00 was a literal for a row that names claude-haiku-4-5, whose real rate is
    // 1.00/5.00 — under-reporting this call by a fifth. One derivation, from ai_model_pricing.
    const price = await resolveTokenPrice(supabase as any, 'claude-haiku-4-5');
    const inputCost = price ? (inputTokens / 1_000_000) * price.input : null;
    const outputCost = price ? (outputTokens / 1_000_000) * price.output : null;
    // null, never 0: an unpriced model is a gap in ai_model_pricing, not a free call.
    const rawCost = price ? inputCost! + outputCost! : null;
    (supabase as any).from('ai_usage_logs').insert({
      user_id: userId,
      operation_type: 'presentation_sheet_auto_detect_callouts',
      model_name: 'claude-haiku-4-5',
      api_provider: 'anthropic',
      input_tokens: inputTokens, output_tokens: outputTokens,
      input_cost_usd: inputCost, output_cost_usd: outputCost,
      raw_cost_usd: rawCost,
      markup_multiplier: price?.markup ?? null,
      billed_cost_usd: rawCost === null ? null : rawCost * (price!.markup),
      credits_debited: 0,
      metadata: { success: true, feature: 'presentation_sheet', event: 'auto_detect_callouts', moodboard_id: moodboardId },
      created_at: new Date().toISOString(),
    }).then?.(({ error }: any) => { if (error) console.warn('[autoDetectCallouts] cost log failed:', error); });
  } catch (e) {
    // Non-blocking, but not silent — this is the billing row for a Haiku call that already
    // happened, so swallowing the failure means real spend with no record of it.
    console.error('[autoDetectCallouts] cost log threw — Haiku call unbilled:', e);
  }

  const text: string = data?.content?.[0]?.text ?? '';
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];
  try {
    const arr = JSON.parse(jsonMatch[0]) as { x: number; y: number; label: string }[];
    return arr.slice(0, 6).map((a, idx) => ({
      x: Math.max(0.05, Math.min(0.95, a.x)),
      y: Math.max(0.05, Math.min(0.95, a.y)),
      line_endpoint_x: idx % 2 === 0 ? Math.min(0.97, a.x + 0.25) : Math.max(0.03, a.x - 0.25),
      line_endpoint_y: Math.max(0.05, Math.min(0.95, a.y - 0.05 + (idx * 0.02))),
      label: a.label || 'Element',
      source: 'ai' as const,
    }));
  } catch {
    return [];
  }
}

/** Create-time content validation (looser than render-time — interactive sheets
 *  only need their backdrop here; the canvas fills the rest). */
function validateInitialData(sheet_type: SheetType, data: Record<string, any> | undefined): string | null {
  const d = data || {};
  switch (sheet_type) {
    case 'material_board':
      if (!Array.isArray(d.product_ids) || d.product_ids.length === 0) {
        return 'material_board needs at least one product.';
      }
      return null;
    case 'color_palette':
      if (!Array.isArray(d.swatches) || d.swatches.length === 0) {
        return 'color_palette needs at least one swatch (none could be auto-extracted — add images to the moodboard).';
      }
      for (const sw of d.swatches) {
        if (!sw?.hex || typeof sw.hex !== 'string') return 'Every swatch must have a hex value.';
      }
      return null;
    case 'concept_board':
      if (!Array.isArray(d.layout) || d.layout.length === 0) return 'concept_board needs at least one image.';
      for (const item of d.layout) if (!item?.image_url) return 'Every concept_board item must have an image_url.';
      return null;
    case 'lighting_plan':
    case 'plumbing_plan':
    case 'electrical_plan':
      if (!d.backdrop || !['upload', 'rect'].includes(d.backdrop.kind)) {
        return `${sheet_type} needs a backdrop (upload a floor plan or give room dimensions).`;
      }
      if (d.backdrop.kind === 'upload' && !d.backdrop.image_url) return `${sheet_type} upload backdrop needs an image_url.`;
      if (d.backdrop.kind === 'rect' && (!d.backdrop.width_mm || !d.backdrop.height_mm)) {
        return `${sheet_type} rect backdrop needs width_mm and height_mm.`;
      }
      return null;
    case 'annotated_render':
      if (!d.backdrop_image_url) return 'annotated_render needs a backdrop image.';
      return null;
    case 'elevation_render_pair':
      if (!d.elevation_image_url) return 'elevation_render_pair needs an elevation image.';
      return null;
    case 'scope_of_works': {
      const hasProject = typeof d.project_id === 'string' && d.project_id.length > 0;
      const hasPhases = Array.isArray(d.phases) && d.phases.length > 0;
      if (!hasProject && !hasPhases) return 'scope_of_works needs a project or at least one phase.';
      return null;
    }
    case 'ffe_schedule':
      if (!d.quote_id && (!Array.isArray(d.items) || d.items.length === 0)) {
        return 'ffe_schedule needs a quote or at least one item.';
      }
      if (Array.isArray(d.items)) for (const it of d.items) if (!it?.name) return 'Every ffe_schedule item needs a name.';
      return null;
    case 'area_breakdown':
      if (!d.hero_image_url && !d.plan_image_url && !d.elevation_image_url &&
          !(Array.isArray(d.finishes) && d.finishes.length > 0)) {
        return 'area_breakdown needs a hero render (or a plan/elevation image, or finishes).';
      }
      return null;
    case 'full_deck':
      return null; // canvas enforces inclusion + cover at render time
  }
  return null;
}
