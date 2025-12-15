import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Sparkles, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';

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

// Default prompts if database is empty
const DEFAULT_PROMPTS: PromptTemplate[] = [
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
    id: 'luxury-bathroom',
    name: 'Luxury Bathroom',
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
          !p.subcategory?.includes('entity_creation')
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

  const categories = ['all', ...Array.from(new Set(prompts.map(p => p.subcategory).filter(Boolean)))];

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
                {category === 'all' ? 'All Styles' : category.charAt(0).toUpperCase() + category.slice(1)}
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
                      <span className="text-xs px-3 py-1 bg-primary/10 text-primary rounded-full font-semibold whitespace-nowrap ml-2 capitalize">
                        {prompt.subcategory.replace('-', ' ')}
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

