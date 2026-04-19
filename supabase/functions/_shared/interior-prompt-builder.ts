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
      task: 'interior_prompt_build',
      model: 'claude-haiku-4-5',
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

  return `You are editing a room photo. You have two images.

IMAGE 1 = STYLE MOOD BOARD (visual reference only)
IMAGE 2 = THE ROOM YOU ARE EDITING (the actual photo to modify)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR TASK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Perform a cosmetic renovation of IMAGE 2. Every object stays exactly where it is. Only the surfaces, finishes, colors, and material aesthetics change — sourced from IMAGE 1.

IMAGE 1 tells you WHAT to use visually. IMAGE 2 tells you WHERE everything stays. You are painting and re-finishing IMAGE 2, not rebuilding it.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ABSOLUTE POSITION RULES — never break these
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Every element in IMAGE 2 stays on its exact wall, at its exact height, in its exact position:

  ✗ DO NOT move the toilet — same wall, same corner, same distance from other elements
  ✗ DO NOT move the sink or basin — same wall, same position
  ✗ DO NOT move the vanity — same location, same footprint
  ✗ DO NOT move the shower enclosure — same corner/wall, same dimensions
  ✗ DO NOT move the bath — same position and orientation
  ✗ DO NOT move doors or windows — same walls, same sizes
  ✗ DO NOT move niches, recesses, or shelving
  ✗ DO NOT move mirrors, towel rails, or accessories
  ✗ DO NOT change the camera angle or perspective — render from the identical viewpoint as IMAGE 2

The spatial layout of IMAGE 1 is completely irrelevant. Do not use it. Do not let it influence where anything is placed.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT TO CHANGE — extract from IMAGE 1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Apply these visual elements from IMAGE 1 to IMAGE 2's layout:

FLOORS: material, color, tile size, format, finish, laying pattern, grout color and width
WALLS: tile/cladding color, size, format, texture, finish, laying pattern, grout; any dual-color zone splits — copy height and alignment from IMAGE 1
CEILING: color, finish, any coving, shadow gap, or structural ceiling detail
FIXTURES — keep IMAGE 2 positions, apply IMAGE 1 aesthetics:
  - Basin style (under-mount, vessel, wall-hung) and finish
  - Vanity door style, color, material, handles
  - Tap/faucet style and metal finish
  - Mirror shape, frame, any integrated LED
  - Shower glass type, niche tile treatment, shower head style
  - Towel rail style and finish
HARDWARE: metal finish tone from IMAGE 1 applied consistently to all hardware
LIGHTING: fixture types, color temperature, and atmosphere from IMAGE 1
COLOR PALETTE: every color in the output comes from IMAGE 1 only
${userPrompt ? `\nADDITIONAL INSTRUCTION: ${userPrompt}` : ''}${styleName ? `\nDESIGN STYLE: ${styleName}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIXTURE PRESENCE RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
If a fixture type is completely absent from IMAGE 1, REMOVE it from the output entirely. Do not preserve fixtures from IMAGE 2 that do not appear at all in IMAGE 1.

Examples:
  - If IMAGE 1 has NO bathtub → remove the bathtub from IMAGE 2's output entirely
  - If IMAGE 1 has NO freestanding bath → no bath appears in the result
  - If IMAGE 1 has NO towel rail → remove towel rails from the result
  - Fixtures present in IMAGE 1 (regardless of position) are kept in IMAGE 2 at their IMAGE 2 positions

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT CHECK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Before finalising: verify the toilet is on the same wall as in IMAGE 2. Verify the sink is on the same wall as in IMAGE 2. Verify the shower is in the same corner as in IMAGE 2. If anything moved, correct it. Verify any fixture absent from IMAGE 1 has been removed.

Photorealistic professional interior photography. 24mm architectural lens, corrected verticals, no fisheye, ultra-realistic material textures and lighting.`;
}

function buildFallbackPrompt(params: DesignParams, styleCue: string, materialsLine: string): string {
  const room = params.room_type || 'living room';
  const style = params.style || 'modern';
  return `A photorealistic ${style} ${room} bathed in soft natural light. ${styleCue}. ${materialsLine} The space feels open, well-proportioned and professionally staged. Shot with a 24mm architectural lens, no distortion, ultra-realistic materials.`;
}
