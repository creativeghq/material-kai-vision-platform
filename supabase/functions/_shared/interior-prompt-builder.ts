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
 * Build the floor plan / reference image → photorealistic perspective interior render prompt.
 *
 * Two modes:
 *  - userPrompt provided: use the uploaded image as a style/mood reference to generate a
 *    brand new room design described by userPrompt (Copy Style use-case).
 *  - userPrompt absent: treat the uploaded image as a 2D floor plan and generate a
 *    photorealistic eye-level perspective interior render of that layout.
 */
export function buildFloorPlanRenderPrompt(style?: string, userPrompt?: string): string {
  const styleDescription = style
    ? (STYLE_DEFAULTS[style.toLowerCase()] ?? style)
    : STYLE_DEFAULTS['modern'];

  const styleName = style
    ? style.charAt(0).toUpperCase() + style.slice(1)
    : 'Modern Contemporary';

  const styleTag = `Style: ${styleName} — ${styleDescription}.`;
  const technicalTag = `Ultra-realistic physically accurate materials and lighting. Professional architectural photography quality. Shot with a 24mm architectural lens, corrected vertical lines, no fisheye distortion.`;

  // Style-reference mode: generate a completely new room inspired by the reference image
  if (userPrompt && !/floor\s*plan|convert.*plan|render.*layout|layout.*render/i.test(userPrompt)) {
    return `${userPrompt}

Use the provided reference image purely as a style and mood guide. Extract its color palette, material choices, lighting atmosphere, and overall aesthetic feel, then apply them to a fresh new interior design.
${styleTag}
${technicalTag}`;
  }

  // Floor plan mode: interpret the uploaded 2D plan and render a perspective view of the interior
  return `Based on the provided floor plan, generate a photorealistic perspective interior render of this space as it would look in real life. Interpret the room layout, wall positions, windows, doors, openings, and furniture placement shown in the floor plan.

Camera position: eye-level (150–160 cm height) standing inside the main living area, looking towards the most architecturally interesting wall or window. Do not produce a top-down view — this must be a standing perspective render as if photographed from inside the room.
${styleTag}
Warm natural daylight flooding through windows. ${technicalTag}`;
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

/**
 * Build a dual-reference prompt for when the user uploads TWO images:
 *   Image 1 = their room (spatial layout and furniture positions to preserve)
 *   Image 2 = design inspiration (copy EVERYTHING visual from this image)
 *
 * Used for Copy Style and Redesign Room chip modes when two images are attached.
 *
 * NOTE: The images are sent with labeled text separators in generateMultiImageWithGemini
 * so Gemini knows exactly which image is the layout donor and which is the design donor.
 */
export function buildDualReferenceStylePrompt(style?: string, userPrompt?: string): string {
  const styleName = style
    ? style.charAt(0).toUpperCase() + style.slice(1)
    : null;

  return `You are performing a COMPLETE VISUAL TRANSFORMATION. You have two reference images.

═══ IMAGE 1 — SPATIAL DONOR ═══
Extract ONLY the spatial data from this image:
  - Room shape, dimensions, and proportions
  - Positions of all fixed elements: sink, toilet, shower/bath enclosure, vanity, doors, windows, niches
  - Furniture and fixture placement coordinates
  - Zone boundaries (wet zone, dry zone, double-height areas, alcoves)
  - Camera angle and perspective from which to render the result
NOTHING visual from Image 1 carries into the output. Not a single tile, color, or finish.

═══ IMAGE 2 — COMPLETE DESIGN DONOR ═══
Every visual decision in the output must be copied from this image. Go element by element:

FLOORS:
  - Exact tile/stone/material: color, size, format, finish (matte/gloss/honed/polished)
  - Exact laying pattern (straight, diagonal, herringbone, brick bond, large format slab)
  - Grout color and joint width
  - Any transition strips or border treatments

WALLS:
  - Primary wall tile/cladding: color, size, format, texture, finish, laying pattern
  - Secondary wall treatment where walls change material or color
  - Exact zone where each treatment starts and ends (floor-to-ceiling, dado height, feature wall only)
  - Double-color or dual-material zones: copy the exact split height and alignment
  - Any niches, recesses, shelving: their position, depth, and interior surface treatment
  - Grout color on wall tiles, joint width

CEILING:
  - Color, finish, material
  - Any coving, cornice, or shadow gap detail
  - Recessed zones, soffits, or dropped sections
  - Ceiling-mounted fixtures

SANITARY FIXTURES & VANITY:
  - Sink/basin model style (under-mount, vessel, semi-recessed, wall-hung, integrated)
  - Vanity unit: shape, color, material, door/drawer style, legs or floating
  - Tap/faucet style: finish (chrome, brushed brass, matte black, etc.)
  - Mirror: shape, size, framing style, any integrated LED strip
  - Toilet style if visible: wall-hung or floor-standing, cistern type
  - Any heated towel rail: shape, finish, position

SHOWER / WET AREA ARCHITECTURE:
  - Enclosure type: frameless glass, framed, walk-in open, wet room, bath-shower combo
  - Glass thickness and any frosting/patterning
  - Shower niche: position, size, tile treatment inside niche vs surrounding wall
  - Shower head style: rain overhead, wall-mounted, handheld, combination
  - Shower tray or wet floor: material, color, drain style
  - Any step, threshold, or floor transition detail

STORAGE & BUILT-INS:
  - All wall-mounted or recessed storage: doors, color, handle style
  - Open shelving: bracket style, shelf material
  - Any integrated lighting inside storage

LIGHTING:
  - Every fixture type: recessed downlights, pendant, wall sconce, under-cabinet, mirror light, LED strip
  - Light color temperature: warm/cool/neutral
  - Any directional or accent lighting on features

HARDWARE & ACCESSORIES:
  - Towel bar / ring / hook: style and finish
  - Toilet roll holder: style and finish
  - All hardware finishes: copy the exact metal tone throughout

COLOR PALETTE:
  - Every color in the output comes exclusively from Image 2
  - If Image 2 uses two tile colors in different zones, reproduce the same zones in the same colors
  - If Image 2 has a dominant neutral with one accent, match that ratio exactly

ATMOSPHERE & LIGHTING MOOD:
  - Replicate the exact warmth or coolness of the light
  - Copy shadow depth and contrast level
  - Copy time-of-day feel (bright daylight, soft evening, etc.)
${userPrompt ? `\nADDITIONAL INSTRUCTION FROM USER: ${userPrompt}` : ''}${styleName ? `\nDESIGN STYLE CONTEXT: ${styleName}` : ''}

═══ OUTPUT REQUIREMENT ═══
Someone who has seen Image 2 must immediately recognise every design choice in the output. The room from Image 1 should feel completely rebuilt in the aesthetic of Image 2 — not partially updated, not inspired by — fully transformed. Every surface, every fixture, every material must match.

Photorealistic, professional architectural photography quality. 24mm lens, corrected verticals, no fisheye distortion, ultra-realistic material textures and lighting.`;
}

function buildFallbackPrompt(params: DesignParams, styleCue: string, materialsLine: string): string {
  const room = params.room_type || 'living room';
  const style = params.style || 'modern';
  return `A photorealistic ${style} ${room} bathed in soft natural light. ${styleCue}. ${materialsLine} The space feels open, well-proportioned and professionally staged. Shot with a 24mm architectural lens, no distortion, ultra-realistic materials.`;
}
