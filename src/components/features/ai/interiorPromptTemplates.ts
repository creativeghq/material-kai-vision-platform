/**
 * Interior Designer prompt-template defaults + helpers.
 *
 * Extracted from the legacy `PromptLibrary.tsx` so the new merged
 * `PromptBuilderModal` ("Prompt Library" tab) can render them alongside
 * the chat-starter prompts and the toolkit cards.
 *
 * Two prompt sources for Interior Designer:
 *   1. DB rows in `prompts` where prompt_type='template' AND category='interior-designer'
 *      (admin-curated, can override the defaults)
 *   2. The DEFAULTS in this file (built-in fallbacks so a fresh install has
 *      content even with an empty DB)
 *
 * Helpers:
 *   - loadInteriorTemplatePrompts() — fetches DB + supplements with defaults
 *   - filterByImageMode() — when an image is attached, shows only image-
 *     compatible subcategories (floor-plan-3d, virtual-staging); when no
 *     image is attached, hides those.
 */

import { supabase } from '@/integrations/supabase/client';

export interface InteriorPromptTemplate {
  id: string;
  name: string;
  description: string;
  prompt_text: string;
  prompt_type: 'template';
  category: 'interior-designer';
  subcategory: string;
  industry?: string;
  stage?: string;
  is_active: boolean;
}

/** Subcategories that require an attached image to make sense. */
export const IMAGE_COMPATIBLE_SUBCATEGORIES = new Set(['floor-plan-3d', 'virtual-staging']);

/** Human-readable labels for the room-chip filters. */
export const INTERIOR_SUBCATEGORY_LABELS: Record<string, string> = {
  'all': 'All',
  'living-room': 'Living Room',
  'bedroom': 'Bedroom',
  'kitchen': 'Kitchen',
  'bathroom': 'Bathroom',
  'dining-room': 'Dining Room',
  'office': 'Office',
  'outdoor': 'Outdoor',
  'kids-room': "Kids' Room",
  'floor-plan-3d': '2D to 3D',
  'virtual-staging': 'Virtual Staging',
};

/** Display order for the room-chip filter strip. */
export const INTERIOR_CATEGORY_ORDER = [
  'living-room', 'bedroom', 'kitchen', 'bathroom', 'dining-room',
  'office', 'outdoor', 'kids-room', 'floor-plan-3d', 'virtual-staging',
];

/** Built-in default templates. Loaded as fallback / supplement when the DB
 * doesn't have its own rows for a given subcategory. 35 prompts across 10
 * subcategories. */
export const INTERIOR_DEFAULT_PROMPTS: InteriorPromptTemplate[] = [
  // ─── Living Room ──────────────────────────────────────────────────
  {
    id: 'modern-living', name: 'Modern Living Room',
    description: 'Contemporary living space with clean lines and neutral tones',
    prompt_text: 'Design a modern living room with minimalist furniture, neutral color palette (whites, grays, beige), large windows for natural light, and contemporary art pieces. Include a comfortable sofa, coffee table, and accent lighting.',
    prompt_type: 'template', category: 'interior-designer', subcategory: 'living-room',
    industry: 'residential', stage: 'design', is_active: true,
  },
  {
    id: 'bohemian-living', name: 'Bohemian Living Space',
    description: 'Eclectic and colorful living area',
    prompt_text: 'Create a bohemian living room with vibrant colors, mixed patterns, layered textiles (rugs, cushions, throws), plants, and eclectic furniture. Include vintage pieces, macramé wall hangings, and a relaxed, artistic vibe.',
    prompt_type: 'template', category: 'interior-designer', subcategory: 'living-room',
    industry: 'residential', stage: 'design', is_active: true,
  },
  {
    id: 'luxury-living', name: 'Luxury Living Room',
    description: 'High-end living space with marble, velvet and gold accents',
    prompt_text: 'Design a luxury living room with marble flooring, floor-to-ceiling curtains, velvet sofa in deep jewel tones, gold and brass accent pieces, a statement fireplace, and a grand chandelier. Rich palette of navy, emerald or burgundy against warm cream walls.',
    prompt_type: 'template', category: 'interior-designer', subcategory: 'living-room',
    industry: 'residential', stage: 'design', is_active: true,
  },
  // ─── Bedroom ──────────────────────────────────────────────────────
  {
    id: 'cozy-bedroom', name: 'Cozy Bedroom',
    description: 'Warm and inviting bedroom with soft textures',
    prompt_text: 'Create a cozy bedroom with warm lighting, soft textiles (plush bedding, curtains), wooden furniture, and calming earth tones. Include a comfortable bed, nightstands, and ambient lighting for a relaxing atmosphere.',
    prompt_type: 'template', category: 'interior-designer', subcategory: 'bedroom',
    industry: 'residential', stage: 'design', is_active: true,
  },
  {
    id: 'japandi-bedroom', name: 'Japandi Master Bedroom',
    description: 'Serene Japanese-Scandinavian bedroom with wabi-sabi warmth',
    prompt_text: 'Design a Japandi master bedroom with a low-profile platform bed in dark walnut, linen bedding in warm oatmeal tones, limewash walls in taupe, subtle ambient lighting, bonsai plant, shoji-style wardrobe doors, and a palette of charcoal, warm sand and natural linen. Calm, minimalist, deeply restful.',
    prompt_type: 'template', category: 'interior-designer', subcategory: 'bedroom',
    industry: 'residential', stage: 'design', is_active: true,
  },
  {
    id: 'luxury-bedroom', name: 'Luxury Hotel Bedroom',
    description: 'Five-star hotel suite aesthetic with opulent finishes',
    prompt_text: 'Design a luxury hotel-style bedroom with an upholstered headboard in champagne velvet, crisp white high-thread-count bedding, bedside pendants, herringbone parquet flooring, a statement mirror, blackout drapes in warm gold, and a palette of ivory, gold and soft grey.',
    prompt_type: 'template', category: 'interior-designer', subcategory: 'bedroom',
    industry: 'residential', stage: 'design', is_active: true,
  },
  // ─── Kitchen ──────────────────────────────────────────────────────
  {
    id: 'industrial-kitchen', name: 'Industrial Kitchen',
    description: 'Modern kitchen with industrial elements',
    prompt_text: 'Design an industrial-style kitchen with exposed brick walls, stainless steel appliances, concrete countertops, and pendant lighting. Include open shelving, bar stools, and a mix of metal and wood materials.',
    prompt_type: 'template', category: 'interior-designer', subcategory: 'kitchen',
    industry: 'residential', stage: 'design', is_active: true,
  },
  {
    id: 'luxury-kitchen', name: 'Luxury White Kitchen',
    description: 'Bright, high-end kitchen with marble and gold hardware',
    prompt_text: 'Design a luxury white kitchen with floor-to-ceiling cabinetry in matt white, Calacatta marble countertops and backsplash, gold brushed hardware, integrated appliances, a large island with waterfall edge, and statement pendant lights. Crisp, immaculate, chef-grade.',
    prompt_type: 'template', category: 'interior-designer', subcategory: 'kitchen',
    industry: 'residential', stage: 'design', is_active: true,
  },
  {
    id: 'farmhouse-kitchen', name: 'Farmhouse Kitchen',
    description: 'Warm and charming country kitchen with rustic character',
    prompt_text: 'Design a farmhouse kitchen with shaker-style painted cabinets in sage green or navy, butcher-block countertops, a large farmhouse sink, open wooden shelves displaying ceramics, terracotta floor tiles, wicker pendant lights, and a large wooden dining table. Warm, welcoming, lived-in.',
    prompt_type: 'template', category: 'interior-designer', subcategory: 'kitchen',
    industry: 'residential', stage: 'design', is_active: true,
  },
  // ─── Bathroom ─────────────────────────────────────────────────────
  {
    id: 'luxury-bathroom', name: 'Luxury Spa Bathroom',
    description: 'Spa-like bathroom with premium finishes',
    prompt_text: 'Design a luxury bathroom with marble tiles, freestanding bathtub, rainfall shower, double vanity, and ambient lighting. Include high-end fixtures, heated floors, and a spa-like atmosphere with neutral tones.',
    prompt_type: 'template', category: 'interior-designer', subcategory: 'bathroom',
    industry: 'residential', stage: 'design', is_active: true,
  },
  {
    id: 'minimalist-bathroom', name: 'Minimalist Wet Room',
    description: 'Open-plan wet room with frameless glass and large-format tiles',
    prompt_text: 'Design a minimalist wet room with large-format porcelain tiles in warm sand or grey, frameless glass shower partition, wall-hung floating vanity, recessed shelf niches, matte black fixtures, and indirect LED lighting strip behind the mirror. Clean, serene, spa-hotel aesthetic.',
    prompt_type: 'template', category: 'interior-designer', subcategory: 'bathroom',
    industry: 'residential', stage: 'design', is_active: true,
  },
  // ─── Dining Room ──────────────────────────────────────────────────
  {
    id: 'modern-dining', name: 'Modern Dining Room',
    description: 'Elegant dining room with a statement table and dramatic lighting',
    prompt_text: 'Design a modern dining room with a large oval or rectangular dining table in dark oak or stone, upholstered chairs in boucle or velvet, a dramatic statement chandelier, floor-to-ceiling curtains, and a sideboard. Palette of deep teal, warm walnut and brass. Photorealistic, warm evening lighting.',
    prompt_type: 'template', category: 'interior-designer', subcategory: 'dining-room',
    industry: 'residential', stage: 'design', is_active: true,
  },
  {
    id: 'mediterranean-dining', name: 'Mediterranean Dining Room',
    description: 'Warm terracotta and stone dining space evoking a villa in Tuscany',
    prompt_text: 'Design a Mediterranean-style dining room with a rustic stone or plaster wall feature, terracotta floor tiles, a long wooden dining table with rattan chairs, wrought iron chandelier, linen curtains, olive branches in ceramic pots. Warm palette of terracotta, cream and dusty gold. Sunlit afternoon atmosphere.',
    prompt_type: 'template', category: 'interior-designer', subcategory: 'dining-room',
    industry: 'residential', stage: 'design', is_active: true,
  },
  // ─── Office ───────────────────────────────────────────────────────
  {
    id: 'scandinavian-office', name: 'Scandinavian Home Office',
    description: 'Bright and functional workspace with Nordic design',
    prompt_text: 'Create a Scandinavian-inspired home office with light wood furniture, white walls, minimalist desk setup, ergonomic chair, and plenty of natural light. Include plants, simple storage solutions, and a clean aesthetic.',
    prompt_type: 'template', category: 'interior-designer', subcategory: 'office',
    industry: 'residential', stage: 'design', is_active: true,
  },
  {
    id: 'executive-office', name: 'Executive Home Office',
    description: 'Sophisticated dark-panelled study with library feel',
    prompt_text: 'Design an executive home office with dark walnut wood panelling, built-in floor-to-ceiling bookshelves, a large leather-topped desk, a tufted leather chair, brass fixtures, a Persian rug, and moody library lighting. Rich, authoritative palette of forest green, navy and aged leather. Classic English club aesthetic.',
    prompt_type: 'template', category: 'interior-designer', subcategory: 'office',
    industry: 'residential', stage: 'design', is_active: true,
  },
  // ─── Outdoor ──────────────────────────────────────────────────────
  {
    id: 'mediterranean-terrace', name: 'Mediterranean Terrace',
    description: 'Outdoor terrace with lush planting and pergola',
    prompt_text: 'Design a Mediterranean outdoor terrace with a wooden pergola draped in wisteria or bougainvillea, terracotta pots with olive trees and citrus, outdoor lounge seating in weather-resistant linen, a natural stone dining table, and warm string lights. Warm evening palette, alfresco dining atmosphere.',
    prompt_type: 'template', category: 'interior-designer', subcategory: 'outdoor',
    industry: 'residential', stage: 'design', is_active: true,
  },
  {
    id: 'rooftop-terrace', name: 'Modern Rooftop Terrace',
    description: 'Contemporary urban rooftop with city views',
    prompt_text: 'Design a modern rooftop terrace with sleek outdoor sectional sofa in charcoal, polished concrete planters with ornamental grasses, a fire pit, outdoor pendant lights, and glass balustrade to showcase city views. Clean, contemporary palette of charcoal, white and warm wood decking.',
    prompt_type: 'template', category: 'interior-designer', subcategory: 'outdoor',
    industry: 'residential', stage: 'design', is_active: true,
  },
  // ─── Kids Room ────────────────────────────────────────────────────
  {
    id: 'kids-room-adventure', name: "Kids' Adventure Room",
    description: 'Playful and stimulating bedroom for children aged 4–10',
    prompt_text: "Design a children's bedroom with a loft bed featuring a slide and climbing wall, bright primary colors (red, blue, yellow), chalkboard wall, reading nook under the loft, storage cubbies shaped like houses, and a play rug with a road map. Fun, safe, stimulating.",
    prompt_type: 'template', category: 'interior-designer', subcategory: 'kids-room',
    industry: 'residential', stage: 'design', is_active: true,
  },
  {
    id: 'kids-room-calm', name: "Kids' Calm Bedroom",
    description: 'Soft and soothing bedroom for toddlers and young children',
    prompt_text: "Design a calm and gentle children's bedroom with a canopy bed with sheer curtains, soft pastel palette (sage green, dusty pink, warm white), wooden toy storage, a plush reading corner with cushions, botanical wall prints, and warm ambient lighting. Nurturing and serene.",
    prompt_type: 'template', category: 'interior-designer', subcategory: 'kids-room',
    industry: 'residential', stage: 'design', is_active: true,
  },
  // ─── 2D to 3D ─────────────────────────────────────────────────────
  {
    id: 'floor-plan-3d-cabin', name: 'Luxury Modern Cabin',
    description: 'Convert a floor plan to photorealistic top-down render — warm wood, timber beams and stone. Upload your floor plan image first.',
    prompt_text: 'Analyze the provided floor plan and generate a photorealistic top-down (true 90° orthographic) rendering of the entire apartment, strictly preserving the exact dimensions, proportions, walls, doors, windows, and furniture placement as shown.\nDo not modify layout, scale, structure, or orientation.\nStyle: Luxury Modern Cabin — high ceilings, exposed timber beams, warm natural wood throughout, wide plank flooring, large floor-to-ceiling glass windows and sliding glass doors, expansive glazing facing exterior areas, cozy yet contemporary cabin aesthetic. Use light and warm wood tones, natural stone accents, soft warm lighting, and comfortable furnishings and natural romantic decorations.\nArchitectural visualization style, ultra-realistic materials, physically accurate lighting, no perspective distortion, no added or removed structural elements.',
    prompt_type: 'template', category: 'interior-designer', subcategory: 'floor-plan-3d',
    industry: 'residential', stage: 'design', is_active: true,
  },
  {
    id: 'floor-plan-3d-minimalist', name: 'Minimalist Contemporary',
    description: 'Convert a floor plan to photorealistic top-down render — white surfaces and natural light. Upload your floor plan image first.',
    prompt_text: 'Analyze the provided floor plan and generate a photorealistic top-down (true 90° orthographic) rendering of the entire apartment, strictly preserving the exact dimensions, proportions, walls, doors, windows, and furniture placement as shown.\nDo not modify layout, scale, structure, or orientation.\nStyle: Minimalist Contemporary — white and off-white walls, polished concrete or large-format porcelain tile flooring, minimal furniture with clean geometric lines, hidden storage, recessed lighting, no clutter. Monochromatic palette with occasional warm wood or black steel accent. Open, airy, flooded with natural light.\nArchitectural visualization style, ultra-realistic materials, physically accurate lighting, no perspective distortion, no added or removed structural elements.',
    prompt_type: 'template', category: 'interior-designer', subcategory: 'floor-plan-3d',
    industry: 'residential', stage: 'design', is_active: true,
  },
  {
    id: 'floor-plan-3d-scandinavian', name: 'Nordic Scandinavian',
    description: 'Convert a floor plan to photorealistic top-down render — birch wood and hygge atmosphere. Upload your floor plan image first.',
    prompt_text: 'Analyze the provided floor plan and generate a photorealistic top-down (true 90° orthographic) rendering of the entire apartment, strictly preserving the exact dimensions, proportions, walls, doors, windows, and furniture placement as shown.\nDo not modify layout, scale, structure, or orientation.\nStyle: Nordic Scandinavian — light birch and ash wood furniture, white-painted walls, pale grey textiles, wool throws and cushions, rattan accents, pendant lamps with warm Edison bulbs. Hygge atmosphere — cozy, unpretentious, functional. Muted palette of white, sage, dusty pink and warm beige. Indoor plants throughout.\nArchitectural visualization style, ultra-realistic materials, physically accurate lighting, no perspective distortion, no added or removed structural elements.',
    prompt_type: 'template', category: 'interior-designer', subcategory: 'floor-plan-3d',
    industry: 'residential', stage: 'design', is_active: true,
  },
  {
    id: 'floor-plan-3d-mediterranean', name: 'Mediterranean Villa',
    description: 'Convert a floor plan to photorealistic top-down render — terracotta, stone and wrought iron. Upload your floor plan image first.',
    prompt_text: 'Analyze the provided floor plan and generate a photorealistic top-down (true 90° orthographic) rendering of the entire apartment, strictly preserving the exact dimensions, proportions, walls, doors, windows, and furniture placement as shown.\nDo not modify layout, scale, structure, or orientation.\nStyle: Mediterranean Villa — terracotta and hand-painted ceramic floor tiles, whitewashed plaster walls with warm ochre and terracotta accents, heavy wooden beams, arched doorways, wrought iron fixtures, linen drapes, olive and citrus plants. Rich warm tones — burnt sienna, dusty gold, deep azure. Sunlight streaming through shuttered windows.\nArchitectural visualization style, ultra-realistic materials, physically accurate lighting, no perspective distortion, no added or removed structural elements.',
    prompt_type: 'template', category: 'interior-designer', subcategory: 'floor-plan-3d',
    industry: 'residential', stage: 'design', is_active: true,
  },
  {
    id: 'floor-plan-3d-industrial', name: 'Industrial Loft',
    description: 'Convert a floor plan to photorealistic top-down render — exposed brick, steel and concrete. Upload your floor plan image first.',
    prompt_text: 'Analyze the provided floor plan and generate a photorealistic top-down (true 90° orthographic) rendering of the entire apartment, strictly preserving the exact dimensions, proportions, walls, doors, windows, and furniture placement as shown.\nDo not modify layout, scale, structure, or orientation.\nStyle: Industrial Loft — exposed brick walls, polished concrete floors, raw steel beams and columns, black steel window frames, open ductwork ceiling. Dark and moody palette of charcoal, rust, aged leather and raw wood. Edison bulb pendants, factory-style metal shelving, no soft finishes. Urban gritty authenticity.\nArchitectural visualization style, ultra-realistic materials, physically accurate lighting, no perspective distortion, no added or removed structural elements.',
    prompt_type: 'template', category: 'interior-designer', subcategory: 'floor-plan-3d',
    industry: 'residential', stage: 'design', is_active: true,
  },
  {
    id: 'floor-plan-3d-japandi', name: 'Luxury Japandi',
    description: 'Convert a floor plan to photorealistic top-down render — Japanese-Scandinavian fusion with wabi-sabi. Upload your floor plan image first.',
    prompt_text: 'Analyze the provided floor plan and generate a photorealistic top-down (true 90° orthographic) rendering of the entire apartment, strictly preserving the exact dimensions, proportions, walls, doors, windows, and furniture placement as shown.\nDo not modify layout, scale, structure, or orientation.\nStyle: Luxury Japandi — Japanese wabi-sabi meets Scandinavian minimalism. Dark stained oak and walnut flooring, limewash walls in warm taupe and greige, low-profile furniture with clean silhouettes, shoji-inspired partitions, bonsai and dried pampas grass. Palette of deep charcoal, warm sand, soft sage and natural linen. Calm, intentional, deeply tactile.\nArchitectural visualization style, ultra-realistic materials, physically accurate lighting, no perspective distortion, no added or removed structural elements.',
    prompt_type: 'template', category: 'interior-designer', subcategory: 'floor-plan-3d',
    industry: 'residential', stage: 'design', is_active: true,
  },
  {
    id: 'floor-plan-3d-luxury', name: 'Luxury Penthouse',
    description: 'Convert a floor plan to photorealistic top-down render — marble, gold and high-end finishes. Upload your floor plan image first.',
    prompt_text: 'Analyze the provided floor plan and generate a photorealistic top-down (true 90° orthographic) rendering of the entire apartment, strictly preserving the exact dimensions, proportions, walls, doors, windows, and furniture placement as shown.\nDo not modify layout, scale, structure, or orientation.\nStyle: Luxury Penthouse — Calacatta marble flooring with brass inlay, bespoke built-in cabinetry in lacquered white and gold, statement chandeliers, floor-to-ceiling curtains in ivory silk, designer furniture in velvet and leather. Palette of champagne, ivory, warm gold and deep navy. Ultra-high-end finish, architectural magazine quality.\nArchitectural visualization style, ultra-realistic materials, physically accurate lighting, no perspective distortion, no added or removed structural elements.',
    prompt_type: 'template', category: 'interior-designer', subcategory: 'floor-plan-3d',
    industry: 'residential', stage: 'design', is_active: true,
  },
  // ─── Virtual Staging ──────────────────────────────────────────────
  {
    id: 'virtual-staging-living-modern', name: 'Stage Empty Living Room — Modern',
    description: 'Add modern furniture to an empty living room photo. Upload or generate a room photo first, then use this prompt.',
    prompt_text: 'Stage this empty living room with Modern style furniture. Use a clean, contemporary look with a low-profile sofa in light grey, walnut coffee table, abstract wall art, a geometric rug, and warm accent lighting.',
    prompt_type: 'template', category: 'interior-designer', subcategory: 'virtual-staging',
    industry: 'residential', stage: 'design', is_active: true,
  },
  {
    id: 'virtual-staging-living-scandi', name: 'Stage Empty Living Room — Scandinavian',
    description: 'Add Nordic-style furniture to an empty living room. Upload or generate a room photo first.',
    prompt_text: 'Stage this empty living room in Scandinavian style. Include a cozy linen sofa in warm white, light birch wood side tables, a chunky knit throw, potted fiddle leaf fig, ceramic vases, and soft pendant lighting. Hygge atmosphere.',
    prompt_type: 'template', category: 'interior-designer', subcategory: 'virtual-staging',
    industry: 'residential', stage: 'design', is_active: true,
  },
  {
    id: 'virtual-staging-bedroom-luxury', name: 'Stage Empty Bedroom — Luxury',
    description: 'Add high-end hotel-style furniture to an empty bedroom. Upload or generate a room photo first.',
    prompt_text: 'Stage this empty bedroom with Transitional Luxury style. Include a king-size upholstered bed in champagne velvet, matching bedside tables with sculptural lamps, a tufted bench at the foot of the bed, blackout drapes in warm gold, and a large statement mirror.',
    prompt_type: 'template', category: 'interior-designer', subcategory: 'virtual-staging',
    industry: 'residential', stage: 'design', is_active: true,
  },
  {
    id: 'virtual-staging-office-modern', name: 'Stage Empty Office — Modern',
    description: 'Add modern office furniture to an empty workspace. Upload or generate a room photo first.',
    prompt_text: 'Stage this empty office in Modern style. Use a large white-top desk with cable management, an ergonomic mesh chair, built-in open shelving with organised books and plants, a standing monitor arm, and soft diffused desk lighting. Clean, productive, minimal.',
    prompt_type: 'template', category: 'interior-designer', subcategory: 'virtual-staging',
    industry: 'residential', stage: 'design', is_active: true,
  },
  {
    id: 'virtual-staging-dining-transitional', name: 'Stage Empty Dining Room — Transitional',
    description: 'Add a dining set and accessories to an empty dining room. Upload or generate a room photo first.',
    prompt_text: 'Stage this empty dining room in Transitional style. Use a rectangular dining table in warm walnut with upholstered chairs in beige boucle, a statement chandelier, a sideboard with decorative objects, linen curtains, and a large area rug. Warm and inviting.',
    prompt_type: 'template', category: 'interior-designer', subcategory: 'virtual-staging',
    industry: 'residential', stage: 'design', is_active: true,
  },
  {
    id: 'virtual-staging-real-estate', name: 'Real Estate Staging — Empty Property',
    description: 'Professionally stage an empty property for a real estate listing. Upload a photo of the empty space.',
    prompt_text: 'Virtually stage this empty room for a real estate listing. Use Modern style furniture that maximises the perceived space — light colours, proportional furniture, tasteful artwork, greenery, and soft lighting. Make the room look bright, spacious and move-in ready for a buyer.',
    prompt_type: 'template', category: 'interior-designer', subcategory: 'virtual-staging',
    industry: 'real-estate', stage: 'design', is_active: true,
  },
];

/**
 * Load Interior-Designer template prompts. DB rows take precedence; defaults
 * fill in any subcategories the DB doesn't have. Falls back to all defaults
 * on DB error so the UI always has content.
 */
export async function loadInteriorTemplatePrompts(): Promise<InteriorPromptTemplate[]> {
  try {
    const { data, error } = await supabase
      .from('prompts')
      .select('*')
      .eq('prompt_type', 'template')
      .eq('category', 'interior-designer')
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.warn('[interiorPromptTemplates] DB load failed, using defaults:', error.message);
      return INTERIOR_DEFAULT_PROMPTS;
    }
    if (!data || data.length === 0) {
      return INTERIOR_DEFAULT_PROMPTS;
    }

    // Drop rows that aren't actually design templates (legacy/extraction prompts)
    const interior = data.filter((p: any) =>
      p.category === 'interior-designer' &&
      p.prompt_type === 'template' &&
      !p.subcategory?.includes('extraction') &&
      !p.subcategory?.includes('metadata') &&
      !p.subcategory?.includes('entity_creation'),
    ) as InteriorPromptTemplate[];

    if (interior.length === 0) return INTERIOR_DEFAULT_PROMPTS;

    // Augment with defaults for any subcategories missing in the DB
    const dbSubcats = new Set(interior.map((p) => p.subcategory));
    const missingDefaults = INTERIOR_DEFAULT_PROMPTS.filter((p) => !dbSubcats.has(p.subcategory));
    return [...interior, ...missingDefaults];
  } catch (e) {
    console.warn('[interiorPromptTemplates] unexpected error, using defaults:', e);
    return INTERIOR_DEFAULT_PROMPTS;
  }
}

/** Apply image-mode filter — when image attached, only keep image-compatible
 * subcategories; when no image, hide them. */
export function filterByImageMode(
  prompts: InteriorPromptTemplate[],
  hasImage: boolean,
): InteriorPromptTemplate[] {
  return prompts.filter((p) => {
    const isImage = IMAGE_COMPATIBLE_SUBCATEGORIES.has(p.subcategory);
    return hasImage ? isImage : !isImage;
  });
}
