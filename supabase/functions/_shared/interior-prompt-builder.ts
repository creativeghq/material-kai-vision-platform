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

export interface DesignParams {
  room_type?: string;
  style?: string;
  materials?: string[];
  user_prompt?: string;
  sqm?: number;
  is_edit?: boolean;
  edit_instruction?: string;
}

export interface FloorPlanParams {
  room_type?: string;
  style?: string;
  sqm?: number;
  user_description?: string;
}

const STYLE_DEFAULTS: Record<string, string> = {
  modern: 'clean lines, neutral palette, functional furniture, minimal clutter, recessed lighting',
  minimalist: 'white surfaces, hidden storage, no ornamentation, single accent material, flooded with natural light',
  scandinavian: 'light birch wood, linen textiles, hygge warmth, muted sage and white palette, indoor plants',
  industrial: 'exposed brick, raw steel, polished concrete, Edison bulbs, dark moody palette',
  luxury: 'marble surfaces, bespoke furniture, statement lighting, rich jewel tones, layered textures',
  mediterranean: 'terracotta tiles, whitewashed plaster, wrought iron, arched openings, warm ochre tones',
  japandi: 'dark stained oak, limewash walls, wabi-sabi textures, low-profile furniture, deep calm palette',
  traditional: 'ornate mouldings, warm walnut wood, plush upholstery, Persian rugs, warm ambient lighting',
  cabin: 'exposed timber beams, wide plank flooring, natural stone, cozy fireside, warm wood tones',
  contemporary: 'bold geometric forms, mixed materials, statement art, dynamic lighting, open plan',
};

/**
 * Build a rich narrative scene description for interior design generation.
 * Uses Claude Haiku for fast, high-quality narrative output.
 */
export async function buildNarrativePrompt(params: DesignParams): Promise<string> {
  const styleCue = params.style
    ? (STYLE_DEFAULTS[params.style.toLowerCase()] ?? params.style)
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

  const systemPrompt = `You are an architectural photography director writing image generation prompts.
Convert design parameters into a vivid, narrative scene description for a photorealistic AI renderer.
Write exactly 3-4 sentences. Focus on: lighting conditions, specific materials and their textures,
spatial atmosphere, camera angle (always specify), and mood.
Never use bullet points or lists. Output only the scene description — no preamble.
Always end with: "Shot with a 24mm architectural lens, no distortion, ultra-realistic materials."`;

  const inputPrompt = `Room type: ${params.room_type || 'living room'}
Style: ${params.style || 'modern'} — ${styleCue}
${sqmLine}
${materialsLine}
${userContext}
${editContext}`.trim();

  try {
    const { output } = await generateWithClaude(inputPrompt, {
      model: 'claude-haiku-4-5-20251001',
      systemPrompt,
      maxTokens: 250,
      temperature: 0.8,
    });
    return output.trim();
  } catch {
    // Fallback to template if Claude is unavailable
    return buildFallbackPrompt(params, styleCue, materialsLine);
  }
}

/**
 * Build the 2D floor plan → 3D photorealistic orthographic render prompt.
 * Used when a floor plan IMAGE is provided as input.
 */
export function buildFloorPlanRenderPrompt(style?: string): string {
  const styleDescription = style
    ? (STYLE_DEFAULTS[style.toLowerCase()] ?? style)
    : STYLE_DEFAULTS['modern'];

  const styleName = style
    ? style.charAt(0).toUpperCase() + style.slice(1)
    : 'Modern Contemporary';

  return `Analyze the provided floor plan and generate a photorealistic top-down (true 90° orthographic) rendering of the entire apartment, strictly preserving the exact dimensions, proportions, walls, doors, windows, and furniture placement as shown.
Do not modify layout, scale, structure, or orientation.
Style: ${styleName} — ${styleDescription}.
Architectural visualization style, ultra-realistic materials, physically accurate lighting, no perspective distortion, no added or removed structural elements.`;
}

/**
 * Build a text-only floor plan generation prompt (Phase 7 — no input image).
 * Step 1 of the two-step pipeline: generates a clean 2D floor plan diagram.
 */
export function buildFloorPlanDiagramPrompt(params: FloorPlanParams): string {
  const sqmLine = params.sqm ? `Total floor area: ${params.sqm} sqm.` : '';
  const descLine = params.user_description ? params.user_description : '';

  return `Generate a clean, accurate top-down architectural floor plan diagram.
${params.room_type ? `Space type: ${params.room_type}.` : ''}
${sqmLine}
${descLine}
Show walls as solid thick lines, doors as arcs, windows as thin parallel lines.
Include furniture placement as simple geometric shapes with labels.
Add dimension callouts on exterior walls in metres.
Label each zone clearly (e.g. "Living Area", "Kitchen", "Bedroom 1").
True orthographic top-down view, no perspective, black lines on white background.
Architectural drawing style, clean and precise.`.trim();
}

function buildFallbackPrompt(params: DesignParams, styleCue: string, materialsLine: string): string {
  const room = params.room_type || 'living room';
  const style = params.style || 'modern';
  return `A photorealistic ${style} ${room} bathed in soft natural light. ${styleCue}. ${materialsLine} The space feels open, well-proportioned and professionally staged. Shot with a 24mm architectural lens, no distortion, ultra-realistic materials.`;
}
