import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Sparkles, Search, X } from 'lucide-react';
import { Input } from '@/components/core/ui/input';

interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  prompt_text: string;
  prompt_type: string;
  category: string;
  subcategory?: string;
  industry?: string;
  stage?: string;
  is_active: boolean;
}

interface PromptLibraryProps {
  onSelectPrompt: (promptText: string) => void;
  onClose: () => void;
}

// Human-readable labels for subcategory filter chips
const SUBCATEGORY_LABELS: Record<string, string> = {
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

// Default prompts if database is empty
const DEFAULT_PROMPTS: PromptTemplate[] = [
  // ─── Living Room ────────────────────────────────────────────────────────────
  {
    id: 'modern-living',
    name: 'Modern Living Room',
    description: 'Contemporary living space with clean lines and neutral tones',
    prompt_text: 'Design a modern living room with minimalist furniture, neutral color palette (whites, grays, beige), large windows for natural light, and contemporary art pieces. Include a comfortable sofa, coffee table, and accent lighting.',
    prompt_type: 'template',
    category: 'interior-designer',
    subcategory: 'living-room',
    industry: 'residential',
    stage: 'design',
    is_active: true,
  },
  {
    id: 'bohemian-living',
    name: 'Bohemian Living Space',
    description: 'Eclectic and colorful living area',
    prompt_text: 'Create a bohemian living room with vibrant colors, mixed patterns, layered textiles (rugs, cushions, throws), plants, and eclectic furniture. Include vintage pieces, macramé wall hangings, and a relaxed, artistic vibe.',
    prompt_type: 'template',
    category: 'interior-designer',
    subcategory: 'living-room',
    industry: 'residential',
    stage: 'design',
    is_active: true,
  },
  {
    id: 'luxury-living',
    name: 'Luxury Living Room',
    description: 'High-end living space with marble, velvet and gold accents',
    prompt_text: 'Design a luxury living room with marble flooring, floor-to-ceiling curtains, velvet sofa in deep jewel tones, gold and brass accent pieces, a statement fireplace, and a grand chandelier. Rich palette of navy, emerald or burgundy against warm cream walls.',
    prompt_type: 'template',
    category: 'interior-designer',
    subcategory: 'living-room',
    industry: 'residential',
    stage: 'design',
    is_active: true,
  },
  // ─── Bedroom ────────────────────────────────────────────────────────────────
  {
    id: 'cozy-bedroom',
    name: 'Cozy Bedroom',
    description: 'Warm and inviting bedroom with soft textures',
    prompt_text: 'Create a cozy bedroom with warm lighting, soft textiles (plush bedding, curtains), wooden furniture, and calming earth tones. Include a comfortable bed, nightstands, and ambient lighting for a relaxing atmosphere.',
    prompt_type: 'template',
    category: 'interior-designer',
    subcategory: 'bedroom',
    industry: 'residential',
    stage: 'design',
    is_active: true,
  },
  {
    id: 'japandi-bedroom',
    name: 'Japandi Master Bedroom',
    description: 'Serene Japanese-Scandinavian bedroom with wabi-sabi warmth',
    prompt_text: 'Design a Japandi master bedroom with a low-profile platform bed in dark walnut, linen bedding in warm oatmeal tones, limewash walls in taupe, subtle ambient lighting, bonsai plant, shoji-style wardrobe doors, and a palette of charcoal, warm sand and natural linen. Calm, minimalist, deeply restful.',
    prompt_type: 'template',
    category: 'interior-designer',
    subcategory: 'bedroom',
    industry: 'residential',
    stage: 'design',
    is_active: true,
  },
  {
    id: 'luxury-bedroom',
    name: 'Luxury Hotel Bedroom',
    description: 'Five-star hotel suite aesthetic with opulent finishes',
    prompt_text: 'Design a luxury hotel-style bedroom with an upholstered headboard in champagne velvet, crisp white high-thread-count bedding, bedside pendants, herringbone parquet flooring, a statement mirror, blackout drapes in warm gold, and a palette of ivory, gold and soft grey.',
    prompt_type: 'template',
    category: 'interior-designer',
    subcategory: 'bedroom',
    industry: 'residential',
    stage: 'design',
    is_active: true,
  },
  // ─── Kitchen ────────────────────────────────────────────────────────────────
  {
    id: 'industrial-kitchen',
    name: 'Industrial Kitchen',
    description: 'Modern kitchen with industrial elements',
    prompt_text: 'Design an industrial-style kitchen with exposed brick walls, stainless steel appliances, concrete countertops, and pendant lighting. Include open shelving, bar stools, and a mix of metal and wood materials.',
    prompt_type: 'template',
    category: 'interior-designer',
    subcategory: 'kitchen',
    industry: 'residential',
    stage: 'design',
    is_active: true,
  },
  {
    id: 'luxury-kitchen',
    name: 'Luxury White Kitchen',
    description: 'Bright, high-end kitchen with marble and gold hardware',
    prompt_text: 'Design a luxury white kitchen with floor-to-ceiling cabinetry in matt white, Calacatta marble countertops and backsplash, gold brushed hardware, integrated appliances, a large island with waterfall edge, and statement pendant lights. Crisp, immaculate, chef-grade.',
    prompt_type: 'template',
    category: 'interior-designer',
    subcategory: 'kitchen',
    industry: 'residential',
    stage: 'design',
    is_active: true,
  },
  {
    id: 'farmhouse-kitchen',
    name: 'Farmhouse Kitchen',
    description: 'Warm and charming country kitchen with rustic character',
    prompt_text: 'Design a farmhouse kitchen with shaker-style painted cabinets in sage green or navy, butcher-block countertops, a large farmhouse sink, open wooden shelves displaying ceramics, terracotta floor tiles, wicker pendant lights, and a large wooden dining table. Warm, welcoming, lived-in.',
    prompt_type: 'template',
    category: 'interior-designer',
    subcategory: 'kitchen',
    industry: 'residential',
    stage: 'design',
    is_active: true,
  },
  // ─── Bathroom ───────────────────────────────────────────────────────────────
  {
    id: 'luxury-bathroom',
    name: 'Luxury Spa Bathroom',
    description: 'Spa-like bathroom with premium finishes',
    prompt_text: 'Design a luxury bathroom with marble tiles, freestanding bathtub, rainfall shower, double vanity, and ambient lighting. Include high-end fixtures, heated floors, and a spa-like atmosphere with neutral tones.',
    prompt_type: 'template',
    category: 'interior-designer',
    subcategory: 'bathroom',
    industry: 'residential',
    stage: 'design',
    is_active: true,
  },
  {
    id: 'minimalist-bathroom',
    name: 'Minimalist Wet Room',
    description: 'Open-plan wet room with frameless glass and large-format tiles',
    prompt_text: 'Design a minimalist wet room with large-format porcelain tiles in warm sand or grey, frameless glass shower partition, wall-hung floating vanity, recessed shelf niches, matte black fixtures, and indirect LED lighting strip behind the mirror. Clean, serene, spa-hotel aesthetic.',
    prompt_type: 'template',
    category: 'interior-designer',
    subcategory: 'bathroom',
    industry: 'residential',
    stage: 'design',
    is_active: true,
  },
  // ─── Dining Room ────────────────────────────────────────────────────────────
  {
    id: 'modern-dining',
    name: 'Modern Dining Room',
    description: 'Elegant dining room with a statement table and dramatic lighting',
    prompt_text: 'Design a modern dining room with a large oval or rectangular dining table in dark oak or stone, upholstered chairs in boucle or velvet, a dramatic statement chandelier, floor-to-ceiling curtains, and a sideboard. Palette of deep teal, warm walnut and brass. Photorealistic, warm evening lighting.',
    prompt_type: 'template',
    category: 'interior-designer',
    subcategory: 'dining-room',
    industry: 'residential',
    stage: 'design',
    is_active: true,
  },
  {
    id: 'mediterranean-dining',
    name: 'Mediterranean Dining Room',
    description: 'Warm terracotta and stone dining space evoking a villa in Tuscany',
    prompt_text: 'Design a Mediterranean-style dining room with a rustic stone or plaster wall feature, terracotta floor tiles, a long wooden dining table with rattan chairs, wrought iron chandelier, linen curtains, olive branches in ceramic pots. Warm palette of terracotta, cream and dusty gold. Sunlit afternoon atmosphere.',
    prompt_type: 'template',
    category: 'interior-designer',
    subcategory: 'dining-room',
    industry: 'residential',
    stage: 'design',
    is_active: true,
  },
  // ─── Office ─────────────────────────────────────────────────────────────────
  {
    id: 'scandinavian-office',
    name: 'Scandinavian Home Office',
    description: 'Bright and functional workspace with Nordic design',
    prompt_text: 'Create a Scandinavian-inspired home office with light wood furniture, white walls, minimalist desk setup, ergonomic chair, and plenty of natural light. Include plants, simple storage solutions, and a clean aesthetic.',
    prompt_type: 'template',
    category: 'interior-designer',
    subcategory: 'office',
    industry: 'residential',
    stage: 'design',
    is_active: true,
  },
  {
    id: 'executive-office',
    name: 'Executive Home Office',
    description: 'Sophisticated dark-panelled study with library feel',
    prompt_text: 'Design an executive home office with dark walnut wood panelling, built-in floor-to-ceiling bookshelves, a large leather-topped desk, a tufted leather chair, brass fixtures, a Persian rug, and moody library lighting. Rich, authoritative palette of forest green, navy and aged leather. Classic English club aesthetic.',
    prompt_type: 'template',
    category: 'interior-designer',
    subcategory: 'office',
    industry: 'residential',
    stage: 'design',
    is_active: true,
  },
  // ─── Outdoor ────────────────────────────────────────────────────────────────
  {
    id: 'mediterranean-terrace',
    name: 'Mediterranean Terrace',
    description: 'Outdoor terrace with lush planting and pergola',
    prompt_text: 'Design a Mediterranean outdoor terrace with a wooden pergola draped in wisteria or bougainvillea, terracotta pots with olive trees and citrus, outdoor lounge seating in weather-resistant linen, a natural stone dining table, and warm string lights. Warm evening palette, alfresco dining atmosphere.',
    prompt_type: 'template',
    category: 'interior-designer',
    subcategory: 'outdoor',
    industry: 'residential',
    stage: 'design',
    is_active: true,
  },
  {
    id: 'rooftop-terrace',
    name: 'Modern Rooftop Terrace',
    description: 'Contemporary urban rooftop with city views',
    prompt_text: 'Design a modern rooftop terrace with sleek outdoor sectional sofa in charcoal, polished concrete planters with ornamental grasses, a fire pit, outdoor pendant lights, and glass balustrade to showcase city views. Clean, contemporary palette of charcoal, white and warm wood decking.',
    prompt_type: 'template',
    category: 'interior-designer',
    subcategory: 'outdoor',
    industry: 'residential',
    stage: 'design',
    is_active: true,
  },
  // ─── Kids Room ──────────────────────────────────────────────────────────────
  {
    id: 'kids-room-adventure',
    name: "Kids' Adventure Room",
    description: 'Playful and stimulating bedroom for children aged 4–10',
    prompt_text: "Design a children's bedroom with a loft bed featuring a slide and climbing wall, bright primary colors (red, blue, yellow), chalkboard wall, reading nook under the loft, storage cubbies shaped like houses, and a play rug with a road map. Fun, safe, stimulating.",
    prompt_type: 'template',
    category: 'interior-designer',
    subcategory: 'kids-room',
    industry: 'residential',
    stage: 'design',
    is_active: true,
  },
  {
    id: 'kids-room-calm',
    name: "Kids' Calm Bedroom",
    description: 'Soft and soothing bedroom for toddlers and young children',
    prompt_text: "Design a calm and gentle children's bedroom with a canopy bed with sheer curtains, soft pastel palette (sage green, dusty pink, warm white), wooden toy storage, a plush reading corner with cushions, botanical wall prints, and warm ambient lighting. Nurturing and serene.",
    prompt_type: 'template',
    category: 'interior-designer',
    subcategory: 'kids-room',
    industry: 'residential',
    stage: 'design',
    is_active: true,
  },
  // ─── 2D to 3D ───────────────────────────────────────────────────────────────
  {
    id: 'floor-plan-3d-cabin',
    name: 'Luxury Modern Cabin',
    description: 'Convert a floor plan to photorealistic top-down render — warm wood, timber beams and stone. Upload your floor plan image first.',
    prompt_text: 'Analyze the provided floor plan and generate a photorealistic top-down (true 90° orthographic) rendering of the entire apartment, strictly preserving the exact dimensions, proportions, walls, doors, windows, and furniture placement as shown.\nDo not modify layout, scale, structure, or orientation.\nStyle: Luxury Modern Cabin — high ceilings, exposed timber beams, warm natural wood throughout, wide plank flooring, large floor-to-ceiling glass windows and sliding glass doors, expansive glazing facing exterior areas, cozy yet contemporary cabin aesthetic. Use light and warm wood tones, natural stone accents, soft warm lighting, and comfortable furnishings and natural romantic decorations.\nArchitectural visualization style, ultra-realistic materials, physically accurate lighting, no perspective distortion, no added or removed structural elements.',
    prompt_type: 'template',
    category: 'interior-designer',
    subcategory: 'floor-plan-3d',
    industry: 'residential',
    stage: 'design',
    is_active: true,
  },
  {
    id: 'floor-plan-3d-minimalist',
    name: 'Minimalist Contemporary',
    description: 'Convert a floor plan to photorealistic top-down render — white surfaces and natural light. Upload your floor plan image first.',
    prompt_text: 'Analyze the provided floor plan and generate a photorealistic top-down (true 90° orthographic) rendering of the entire apartment, strictly preserving the exact dimensions, proportions, walls, doors, windows, and furniture placement as shown.\nDo not modify layout, scale, structure, or orientation.\nStyle: Minimalist Contemporary — white and off-white walls, polished concrete or large-format porcelain tile flooring, minimal furniture with clean geometric lines, hidden storage, recessed lighting, no clutter. Monochromatic palette with occasional warm wood or black steel accent. Open, airy, flooded with natural light.\nArchitectural visualization style, ultra-realistic materials, physically accurate lighting, no perspective distortion, no added or removed structural elements.',
    prompt_type: 'template',
    category: 'interior-designer',
    subcategory: 'floor-plan-3d',
    industry: 'residential',
    stage: 'design',
    is_active: true,
  },
  {
    id: 'floor-plan-3d-scandinavian',
    name: 'Nordic Scandinavian',
    description: 'Convert a floor plan to photorealistic top-down render — birch wood and hygge atmosphere. Upload your floor plan image first.',
    prompt_text: 'Analyze the provided floor plan and generate a photorealistic top-down (true 90° orthographic) rendering of the entire apartment, strictly preserving the exact dimensions, proportions, walls, doors, windows, and furniture placement as shown.\nDo not modify layout, scale, structure, or orientation.\nStyle: Nordic Scandinavian — light birch and ash wood furniture, white-painted walls, pale grey textiles, wool throws and cushions, rattan accents, pendant lamps with warm Edison bulbs. Hygge atmosphere — cozy, unpretentious, functional. Muted palette of white, sage, dusty pink and warm beige. Indoor plants throughout.\nArchitectural visualization style, ultra-realistic materials, physically accurate lighting, no perspective distortion, no added or removed structural elements.',
    prompt_type: 'template',
    category: 'interior-designer',
    subcategory: 'floor-plan-3d',
    industry: 'residential',
    stage: 'design',
    is_active: true,
  },
  {
    id: 'floor-plan-3d-mediterranean',
    name: 'Mediterranean Villa',
    description: 'Convert a floor plan to photorealistic top-down render — terracotta, stone and wrought iron. Upload your floor plan image first.',
    prompt_text: 'Analyze the provided floor plan and generate a photorealistic top-down (true 90° orthographic) rendering of the entire apartment, strictly preserving the exact dimensions, proportions, walls, doors, windows, and furniture placement as shown.\nDo not modify layout, scale, structure, or orientation.\nStyle: Mediterranean Villa — terracotta and hand-painted ceramic floor tiles, whitewashed plaster walls with warm ochre and terracotta accents, heavy wooden beams, arched doorways, wrought iron fixtures, linen drapes, olive and citrus plants. Rich warm tones — burnt sienna, dusty gold, deep azure. Sunlight streaming through shuttered windows.\nArchitectural visualization style, ultra-realistic materials, physically accurate lighting, no perspective distortion, no added or removed structural elements.',
    prompt_type: 'template',
    category: 'interior-designer',
    subcategory: 'floor-plan-3d',
    industry: 'residential',
    stage: 'design',
    is_active: true,
  },
  {
    id: 'floor-plan-3d-industrial',
    name: 'Industrial Loft',
    description: 'Convert a floor plan to photorealistic top-down render — exposed brick, steel and concrete. Upload your floor plan image first.',
    prompt_text: 'Analyze the provided floor plan and generate a photorealistic top-down (true 90° orthographic) rendering of the entire apartment, strictly preserving the exact dimensions, proportions, walls, doors, windows, and furniture placement as shown.\nDo not modify layout, scale, structure, or orientation.\nStyle: Industrial Loft — exposed brick walls, polished concrete floors, raw steel beams and columns, black steel window frames, open ductwork ceiling. Dark and moody palette of charcoal, rust, aged leather and raw wood. Edison bulb pendants, factory-style metal shelving, no soft finishes. Urban gritty authenticity.\nArchitectural visualization style, ultra-realistic materials, physically accurate lighting, no perspective distortion, no added or removed structural elements.',
    prompt_type: 'template',
    category: 'interior-designer',
    subcategory: 'floor-plan-3d',
    industry: 'residential',
    stage: 'design',
    is_active: true,
  },
  {
    id: 'floor-plan-3d-japandi',
    name: 'Luxury Japandi',
    description: 'Convert a floor plan to photorealistic top-down render — Japanese-Scandinavian fusion with wabi-sabi. Upload your floor plan image first.',
    prompt_text: 'Analyze the provided floor plan and generate a photorealistic top-down (true 90° orthographic) rendering of the entire apartment, strictly preserving the exact dimensions, proportions, walls, doors, windows, and furniture placement as shown.\nDo not modify layout, scale, structure, or orientation.\nStyle: Luxury Japandi — Japanese wabi-sabi meets Scandinavian minimalism. Dark stained oak and walnut flooring, limewash walls in warm taupe and greige, low-profile furniture with clean silhouettes, shoji-inspired partitions, bonsai and dried pampas grass. Palette of deep charcoal, warm sand, soft sage and natural linen. Calm, intentional, deeply tactile.\nArchitectural visualization style, ultra-realistic materials, physically accurate lighting, no perspective distortion, no added or removed structural elements.',
    prompt_type: 'template',
    category: 'interior-designer',
    subcategory: 'floor-plan-3d',
    industry: 'residential',
    stage: 'design',
    is_active: true,
  },
  {
    id: 'floor-plan-3d-luxury',
    name: 'Luxury Penthouse',
    description: 'Convert a floor plan to photorealistic top-down render — marble, gold and high-end finishes. Upload your floor plan image first.',
    prompt_text: 'Analyze the provided floor plan and generate a photorealistic top-down (true 90° orthographic) rendering of the entire apartment, strictly preserving the exact dimensions, proportions, walls, doors, windows, and furniture placement as shown.\nDo not modify layout, scale, structure, or orientation.\nStyle: Luxury Penthouse — Calacatta marble flooring with brass inlay, bespoke built-in cabinetry in lacquered white and gold, statement chandeliers, floor-to-ceiling curtains in ivory silk, designer furniture in velvet and leather. Palette of champagne, ivory, warm gold and deep navy. Ultra-high-end finish, architectural magazine quality.\nArchitectural visualization style, ultra-realistic materials, physically accurate lighting, no perspective distortion, no added or removed structural elements.',
    prompt_type: 'template',
    category: 'interior-designer',
    subcategory: 'floor-plan-3d',
    industry: 'residential',
    stage: 'design',
    is_active: true,
  },
  // ─── Virtual Staging ────────────────────────────────────────────────────────
  {
    id: 'virtual-staging-living-modern',
    name: 'Stage Empty Living Room — Modern',
    description: 'Add modern furniture to an empty living room photo. Upload or generate a room photo first, then use this prompt.',
    prompt_text: 'Stage this empty living room with Modern style furniture. Use a clean, contemporary look with a low-profile sofa in light grey, walnut coffee table, abstract wall art, a geometric rug, and warm accent lighting.',
    prompt_type: 'template',
    category: 'interior-designer',
    subcategory: 'virtual-staging',
    industry: 'residential',
    stage: 'design',
    is_active: true,
  },
  {
    id: 'virtual-staging-living-scandi',
    name: 'Stage Empty Living Room — Scandinavian',
    description: 'Add Nordic-style furniture to an empty living room. Upload or generate a room photo first.',
    prompt_text: 'Stage this empty living room in Scandinavian style. Include a cozy linen sofa in warm white, light birch wood side tables, a chunky knit throw, potted fiddle leaf fig, ceramic vases, and soft pendant lighting. Hygge atmosphere.',
    prompt_type: 'template',
    category: 'interior-designer',
    subcategory: 'virtual-staging',
    industry: 'residential',
    stage: 'design',
    is_active: true,
  },
  {
    id: 'virtual-staging-bedroom-luxury',
    name: 'Stage Empty Bedroom — Luxury',
    description: 'Add high-end hotel-style furniture to an empty bedroom. Upload or generate a room photo first.',
    prompt_text: 'Stage this empty bedroom with Transitional Luxury style. Include a king-size upholstered bed in champagne velvet, matching bedside tables with sculptural lamps, a tufted bench at the foot of the bed, blackout drapes in warm gold, and a large statement mirror.',
    prompt_type: 'template',
    category: 'interior-designer',
    subcategory: 'virtual-staging',
    industry: 'residential',
    stage: 'design',
    is_active: true,
  },
  {
    id: 'virtual-staging-office-modern',
    name: 'Stage Empty Office — Modern',
    description: 'Add modern office furniture to an empty workspace. Upload or generate a room photo first.',
    prompt_text: 'Stage this empty office in Modern style. Use a large white-top desk with cable management, an ergonomic mesh chair, built-in open shelving with organised books and plants, a standing monitor arm, and soft diffused desk lighting. Clean, productive, minimal.',
    prompt_type: 'template',
    category: 'interior-designer',
    subcategory: 'virtual-staging',
    industry: 'residential',
    stage: 'design',
    is_active: true,
  },
  {
    id: 'virtual-staging-dining-transitional',
    name: 'Stage Empty Dining Room — Transitional',
    description: 'Add a dining set and accessories to an empty dining room. Upload or generate a room photo first.',
    prompt_text: 'Stage this empty dining room in Transitional style. Use a rectangular dining table in warm walnut with upholstered chairs in beige boucle, a statement chandelier, a sideboard with decorative objects, linen curtains, and a large area rug. Warm and inviting.',
    prompt_type: 'template',
    category: 'interior-designer',
    subcategory: 'virtual-staging',
    industry: 'residential',
    stage: 'design',
    is_active: true,
  },
  {
    id: 'virtual-staging-real-estate',
    name: 'Real Estate Staging — Empty Property',
    description: 'Professionally stage an empty property for a real estate listing. Upload a photo of the empty space.',
    prompt_text: 'Virtually stage this empty room for a real estate listing. Use Modern style furniture that maximises the perceived space — light colours, proportional furniture, tasteful artwork, greenery, and soft lighting. Make the room look bright, spacious and move-in ready for a buyer.',
    prompt_type: 'template',
    category: 'interior-designer',
    subcategory: 'virtual-staging',
    industry: 'real-estate',
    stage: 'design',
    is_active: true,
  },
];

export const PromptLibrary: React.FC<PromptLibraryProps> = ({ onSelectPrompt, onClose }) => {
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    loadPrompts();
  }, []);

  const loadPrompts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('prompts')
        .select('*')
        .eq('prompt_type', 'template')
        .eq('category', 'interior-designer')  // STRICT: Only interior-designer category
        .eq('is_active', true)
        .order('name');

      if (error) {
        console.warn('Error loading prompts from database, using defaults:', error);
        setPrompts(DEFAULT_PROMPTS);
      } else if (!data || data.length === 0) {
        console.log('No interior design prompts in database, using defaults');
        setPrompts(DEFAULT_PROMPTS);
      } else {
        // ADDITIONAL FILTER: Only include prompts that are truly for interior design
        // Filter out any prompts with categories like 'products', 'extraction', etc.
        const interiorPrompts = data.filter((p: any) =>
          p.category === 'interior-designer' &&
          p.prompt_type === 'template' &&
          !p.subcategory?.includes('extraction') &&
          !p.subcategory?.includes('metadata') &&
          !p.subcategory?.includes('entity_creation'),
        );

        if (interiorPrompts.length === 0) {
          console.log('No valid interior design prompts found, using defaults');
          setPrompts(DEFAULT_PROMPTS);
        } else {
          console.log(`✅ Loaded ${interiorPrompts.length} interior design prompts`);
          setPrompts(interiorPrompts as PromptTemplate[]);
        }
      }
    } catch (error) {
      console.error('Error loading prompts:', error);
      setPrompts(DEFAULT_PROMPTS);
    } finally {
      setLoading(false);
    }
  };

  const filteredPrompts = prompts.filter(prompt => {
    const matchesSearch = prompt.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (prompt.description?.toLowerCase() || '').includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || prompt.subcategory === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Build ordered category list — fixed order so categories don't jump around
  const CATEGORY_ORDER = ['all', 'living-room', 'bedroom', 'kitchen', 'bathroom', 'dining-room', 'office', 'outdoor', 'kids-room', 'floor-plan-3d', 'virtual-staging'];
  const presentSubcats = new Set(prompts.map(p => p.subcategory).filter(Boolean));
  const categories = CATEGORY_ORDER.filter(c => c === 'all' || presentSubcats.has(c));

  const handleSelectPrompt = (prompt: PromptTemplate) => {
    onSelectPrompt(prompt.prompt_text);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-lg shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden border border-border">
        {/* Header */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Sparkles className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-foreground">Design Prompt Library</h2>
                <p className="text-sm text-muted-foreground mt-0.5">Quick-start templates for interior design</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search design prompts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-lg"
            />
          </div>
        </div>

        {/* Category Filter */}
        <div className="px-6 py-4 border-b border-border bg-background">
          <div className="flex gap-2 flex-wrap">
            {categories.map(category => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedCategory === category
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {SUBCATEGORY_LABELS[category] ?? category.charAt(0).toUpperCase() + category.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Prompts Grid */}
        <div className="p-6 overflow-y-auto max-h-[calc(85vh-280px)]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
            </div>
          ) : filteredPrompts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <div className="p-4 bg-muted/50 rounded-2xl w-fit mx-auto mb-4">
                <Sparkles className="w-12 h-12 opacity-50" />
              </div>
              <p className="text-lg font-medium">No prompts found</p>
              <p className="text-sm mt-1">Try adjusting your search or category filter</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredPrompts.map(prompt => (
                <button
                  key={prompt.id}
                  onClick={() => handleSelectPrompt(prompt)}
                  className="text-left p-5 bg-card border-2 border-border rounded-2xl hover:border-primary hover:shadow-xl transition-all group hover:scale-[1.02] dashboard-card"
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-bold text-foreground group-hover:text-primary transition-colors text-base">
                      {prompt.name}
                    </h3>
                    {prompt.subcategory && (
                      <span className="text-xs px-3 py-1 bg-primary/10 text-primary rounded-full font-semibold whitespace-nowrap ml-2">
                        {SUBCATEGORY_LABELS[prompt.subcategory!] ?? prompt.subcategory!.replace('-', ' ')}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">{prompt.description}</p>

                  {/* Hover indicator */}
                  <div className="mt-3 flex items-center gap-2 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                    <Sparkles className="w-3 h-3" />
                    <span className="font-medium">Click to use this prompt</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

