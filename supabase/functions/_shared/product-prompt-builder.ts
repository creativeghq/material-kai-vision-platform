/**
 * Prompt builders for the PRODUCT generation modes — the subject is one item being
 * sold, not a room. (Room/floor-plan prompts live in interior-prompt-builder.ts.)
 *
 * Pure string builders on purpose: no Deno, no network, no imports. That keeps them
 * importable by a test or a throwaway harness, so the wording can be exercised
 * against a real model without standing up the whole edge function.
 */

/**
 * A single item on seamless white, rendered true to its spec. Used for made-to-order
 * purchase-sheet items (doors/windows) and for catalog product hero shots.
 */
export function buildProductShotPrompt(
  itemType: string,
  name: string,
  spec: Record<string, unknown>,
  extraPrompt?: string,
): string {
  const t = (itemType || 'door').toLowerCase();
  // Render the spec as readable "Key: value" lines so the model honours real measurements/finishes.
  const specLines = Object.entries(spec || {})
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
    .map(([k, v]) => `- ${k.replace(/_/g, ' ')}: ${String(v)}`)
    .join('\n');

  if (t === 'window') {
    return `Studio product photograph of a SINGLE ${name || 'window'}, shown as a clean front elevation, centred on a seamless pure-white background. Architectural product-catalogue style: even soft lighting, no room, no furniture, no people, no props, subtle contact shadow only.

Render the window EXACTLY to this specification — honour the frame type, opening type, glazing and finish; keep proportions true to the width/height ratio:
${specLines || '- a standard casement window'}

The opening mechanism must be visually clear (e.g. tilt-turn vs casement vs sliding) with correct hinge/sash lines. Realistic glass with faint reflection, accurate frame finish colour and material. Sharp focus, high detail, no text, no watermark, no dimension labels. ${extraPrompt ?? ''}`.trim();
  }

  if (t === 'product') {
    return `Studio product photograph of a SINGLE ${name || 'product'}, centred on a seamless pure-white background, shot at a natural three-quarter angle. E-commerce catalogue style: even soft studio lighting, gentle contact shadow beneath, no room, no furniture, no people, no props, no background objects.

${specLines ? `Honour this specification exactly:\n${specLines}\n` : ''}
Accurate materials and finish, true colour, sharp focus edge to edge, high detail, correct real-world proportions. No text, no watermark, no labels, no duplicate of the product. ${extraPrompt ?? ''}`.trim();
  }

  // door (default)
  return `Studio product photograph of a SINGLE ${name || 'interior door'}, shown as a clean front elevation, centred on a seamless pure-white background. Architectural product-catalogue style: even soft lighting, no room, no furniture, no people, no props, subtle contact shadow only.

Render the door EXACTLY to this specification — honour the finish, frame, hardware, opening direction and handing; keep proportions true to the width/height ratio:
${specLines || '- a flush interior door with a satin finish'}

Show the door leaf within its frame, with the handle/hardware on the correct side per the handing. Accurate finish colour, wood grain or paint texture as specified, realistic materials. Sharp focus, high detail, no text, no watermark, no dimension labels. ${extraPrompt ?? ''}`.trim();
}

/**
 * Product staged in a room. When a reference photo is supplied the product must survive
 * the edit unchanged — the room is what gets invented, not the item being sold. That
 * instruction is load-bearing: without it the model redesigns the product too, and the
 * result is a lifestyle shot of something the customer cannot actually buy.
 */
export function buildProductLifestylePrompt(
  name: string,
  roomType?: string,
  style?: string,
  extraPrompt?: string,
  hasReference?: boolean,
): string {
  const room = (roomType || 'living room').replace(/_/g, ' ');
  const look = style ? `${style.replace(/_/g, ' ')} ` : '';
  const fidelity = hasReference
    ? `The product in the supplied image is the subject. Reproduce it EXACTLY — identical shape, proportions, colour, material and detailing. Do NOT restyle, recolour, or redesign it. Place that same product, unchanged, into the scene.`
    : `The subject is a ${name || 'product'}.`;

  return `Photorealistic interior lifestyle photograph: a ${look}${room} furnished around a single hero product.

${fidelity}

Scene: a believable ${look}${room} with natural daylight from a window, soft realistic shadows, complementary furniture and styling that flatters but never obscures the product. The product is clearly the focal point, fully visible, at a natural viewing angle and true to its real-world scale against the room.

Editorial interior-magazine quality: shallow depth of field, accurate materials, no text, no watermark, no people, no duplicated product. ${extraPrompt ?? ''}`.trim();
}

/**
 * A seamless tileable material swatch, framed flat-on so it can be used as a texture map
 * rather than looked at as a picture. Perspective, props and vignetting are all disqualifying
 * here — anything that reads as "a photograph of fabric" tiles visibly when repeated.
 */
export function buildMaterialTexturePrompt(name: string, extraPrompt?: string): string {
  return `A seamless, tileable material texture swatch of ${name || 'woven upholstery fabric'}, photographed perfectly flat and straight-on from directly above.

Fills the entire frame edge to edge with the material only. Absolutely flat orthographic view — no perspective, no curvature, no folds, no draping, no stitching, no edges of the material, no background, no props, no objects, no hands, no text, no watermark.

Completely even, diffuse lighting with no highlights, no hotspots, no vignetting and no directional shadow, so the tile repeats invisibly. Uniform scale across the whole frame. Sharp macro detail showing the true weave, fibre and surface structure at consistent density. ${extraPrompt ?? ''}`.trim();
}
