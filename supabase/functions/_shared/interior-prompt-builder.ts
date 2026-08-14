/**
 * Interior Prompt Builder
 *
 * Converts structured design parameters into rich narrative scene descriptions
 * for AI image generation. Applies to all models (Gemini + Replicate).
 *
 * Key insight from Nano Banana guide: "Describe the scene, don't just list keywords."
 * Narrative descriptions outperform keyword lists across all modern image models.
 */

import { generateWithClaude } from './ai-client.ts';
import type { DbClient } from './supabase-client.ts';
import { getGenerationPrompt, loadPrompt, renderPromptTemplate } from './prompt-utils.ts';

export interface DesignParams {
  room_type?: string;
  style?: string;
  materials?: string[];
  user_prompt?: string;
  sqm?: number;
  is_edit?: boolean;
  edit_instruction?: string;
  /**
   * Who the generation is for. This helper runs one paid Haiku call INSIDE a request whose image
   * generation is already billed to a workspace, so the ids are always available at the call site —
   * they simply were not passed, and the prompt-build half of the cost was attributed to nobody.
   */
  user_id?: string;
  workspace_id?: string;
}

export interface FloorPlanParams {
  room_type?: string;
  style?: string;
  sqm?: number;
  user_description?: string;
}

// Style -> scene description now lives in `interior_design_styles` (#347), so a style can be
// added or reworded in admin instead of by editing this file. It was the last hardcoded
// vocabulary in the interior path, and it had already drifted from replicateConfig's
// `design_style` enum, which offers rustic/bohemian that this map had no description for.
const STYLE_CACHE_TTL_MS = 5 * 60 * 1000;
let styleCache: { at: number; byKey: Map<string, string> } | null = null;

async function loadStyles(db: DbClient): Promise<Map<string, string>> {
  if (styleCache && Date.now() - styleCache.at < STYLE_CACHE_TTL_MS) return styleCache.byKey;

  const { data, error } = await db
    .from('interior_design_styles')
    .select('style_key, description')
    .eq('is_active', true);

  // supabase-js RESOLVES on an RLS denial, so an unchecked result would surface as "no styles"
  // and every render would silently fall back to the bare style word.
  if (error) throw new Error(`Could not read interior_design_styles: ${error.message}`);
  if (!data?.length) throw new Error('interior_design_styles returned no active rows.');

  const byKey = new Map(data.map((r) => [r.style_key as string, r.description as string]));
  styleCache = { at: Date.now(), byKey };
  return byKey;
}

/** The description for a style, or the style word itself when the DB has no entry for it. */
async function styleDescription(db: DbClient, style?: string): Promise<string> {
  const styles = await loadStyles(db);
  if (!style) return styles.get('modern') ?? 'modern contemporary';
  return styles.get(style.toLowerCase()) ?? style;
}


/**
 * Build a rich narrative scene description for interior design generation.
 * Uses Claude Haiku for fast, high-quality narrative output.
 */
export async function buildNarrativePrompt(db: DbClient, params: DesignParams): Promise<string> {
  const styleCue = params.style
    ? await styleDescription(db, params.style)
    : 'modern contemporary';

  const materialsLine = params.materials && params.materials.length > 0
    ? `Specific materials to include: ${params.materials.join(', ')}.`
    : '';

  const sqmLine = params.sqm ? `Room area: approximately ${params.sqm} sqm.` : '';

  const userContext = params.user_prompt
    ? `User's request: "${params.user_prompt}"`
    : '';

  const editContext = params.is_edit && params.edit_instruction
    ? `This is an EDIT request. Edit instruction: "${params.edit_instruction}". Preserve everything not mentioned.`
    : '';

  const systemPrompt = await loadPrompt(db, 'tool', 'interior_narrative_system');

  const inputPrompt = `Room type: ${params.room_type || 'living room'}
Style: ${params.style || 'modern'} — ${styleCue}
${sqmLine}
${materialsLine}
${userContext}
${editContext}`.trim();

  try {
    const { output } = await generateWithClaude(inputPrompt, {
      task: 'interior_prompt_build',
      userId: params.user_id,
      workspaceId: params.workspace_id,
      model: 'claude-haiku-4-5',
      systemPrompt,
      maxTokens: 250,
      temperature: 0.8,
    });
    return output.trim();
  } catch {
    // Degraded MODE, not a prompt fallback — the template still comes from the DB.
    return buildFallbackPrompt(db, params, styleCue, materialsLine);
  }
}

/**
 * Build the floor plan / reference image → photorealistic perspective interior render prompt.
 *
 * Two modes:
 *  - userPrompt provided: use the uploaded image as a style/mood reference to generate a
 *    brand new room design described by userPrompt (Copy Style use-case).
 *  - userPrompt absent: treat the uploaded image as a 2D floor plan and generate a
 *    photorealistic eye-level perspective interior render of that layout.
 */
export async function buildFloorPlanRenderPrompt(
  db: DbClient, style?: string, userPrompt?: string,
): Promise<string> {
  const styleDesc = await styleDescription(db, style);

  const styleName = style
    ? style.charAt(0).toUpperCase() + style.slice(1)
    : 'Modern Contemporary';

  const styleTag = `Style: ${styleName} — ${styleDesc}.`;
  const technicalTag = await getGenerationPrompt(db, 'interior_technical_tag');

  // Style-reference mode: generate a completely new room inspired by the reference image
  if (userPrompt && !/floor\s*plan|convert.*plan|render.*layout|layout.*render/i.test(userPrompt)) {
    return renderPromptTemplate(
      await getGenerationPrompt(db, 'interior_style_reference'),
      { user_prompt: userPrompt, style_tag: styleTag, technical_tag: technicalTag },
    );
  }

  // Floor plan mode: interpret the uploaded 2D plan and render a perspective view
  return renderPromptTemplate(
    await getGenerationPrompt(db, 'interior_floorplan_render'),
    { style_tag: styleTag, technical_tag: technicalTag },
  );
}

/**
 * Build a text-only floor plan generation prompt (Phase 7 — no input image).
 * Step 1 of the two-step pipeline: generates a clean 2D floor plan diagram.
 */
export async function buildFloorPlanDiagramPrompt(
  db: DbClient, params: FloorPlanParams,
): Promise<string> {
  return renderPromptTemplate(
    await getGenerationPrompt(db, 'interior_floorplan_diagram'),
    {
      room_type: params.room_type ? `Room type: ${params.room_type}.` : '',
      sqm_line: params.sqm ? `Total floor area: ${params.sqm} sqm.` : '',
      desc_line: params.user_description ?? '',
    },
  );
}

/**
 * Build a dual-reference prompt for when the user uploads TWO images:
 *   Image 1 = their room (spatial layout and furniture positions to preserve)
 *   Image 2 = design inspiration (copy EVERYTHING visual from this image)
 *
 * Used for Copy Style and Redesign Room chip modes when two images are attached.
 *
 * The images are sent with labeled text separators in generateMultiImageWithGemini
 * so Gemini knows exactly which image is the layout donor and which is the design donor.
 */
export async function buildDualReferenceStylePrompt(
  db: DbClient, style?: string, userPrompt?: string,
): Promise<string> {
  const styleName = style
    ? style.charAt(0).toUpperCase() + style.slice(1)
    : null;

  return renderPromptTemplate(
    await getGenerationPrompt(db, 'interior_dual_reference_style'),
    {
      user_prompt: userPrompt ? `

ADDITIONAL USER DIRECTION: ${userPrompt}` : '',
      style_name: styleName ? `
STYLE NAME: ${styleName}` : '',
    },
  );
}

async function buildFallbackPrompt(
  db: DbClient, params: DesignParams, styleCue: string, materialsLine: string,
): Promise<string> {
  return renderPromptTemplate(
    await getGenerationPrompt(db, 'interior_narrative_fallback'),
    {
      style: params.style || 'modern',
      room: params.room_type || 'living room',
      style_cue: styleCue,
      materials: materialsLine,
    },
  );
}
