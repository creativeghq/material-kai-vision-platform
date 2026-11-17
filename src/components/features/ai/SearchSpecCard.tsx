import React, { useState } from 'react';
import { Search, ChevronDown, ChevronUp, Palette, Layers, Paintbrush, FileText, Ruler } from 'lucide-react';

interface SearchSpec {
  intent: string;
  color_keywords?: string[];
  color_hex?: string[];
  material_types?: string[];
  style_keywords?: string[];
  texture_finish?: string;
  specifications?: string;
}

interface SearchSpecCardProps {
  spec: SearchSpec;
  query: string;
}

export function SearchSpecCard({ spec, query }: SearchSpecCardProps) {
  const [expanded, setExpanded] = useState(false);

  const hasDimensions = (spec.color_keywords?.length || 0) > 0
    || (spec.material_types?.length || 0) > 0
    || (spec.style_keywords?.length || 0) > 0
    || spec.texture_finish
    || spec.specifications;

  if (!hasDimensions && !spec.intent) return null;

  return (
    <div className="rounded-xl border border-border/50 bg-muted/30 overflow-hidden mb-2">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-xs text-muted-foreground flex-1 truncate">
          {spec.intent || `Searching for: ${query}`}
        </span>
        {expanded ? <ChevronUp className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />}
      </button>

      {expanded && hasDimensions && (
        <div className="px-3 pb-3 pt-1 space-y-2.5 border-t border-border/30">
          {/* Colors */}
          {spec.color_keywords && spec.color_keywords.length > 0 && (
            <div className="flex items-start gap-2">
              <Palette className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex flex-wrap gap-1.5">
                {spec.color_hex?.map((hex, i) => (
                  <div key={i} className="flex items-center gap-1 bg-background rounded-full px-2 py-0.5 border border-border/50">
                    <div className="w-3 h-3 rounded-full border border-white/30" style={{ backgroundColor: hex }} />
                    <span className="text-xs">{spec.color_keywords?.[i] || hex}</span>
                  </div>
                ))}
                {/* Show keywords without hex */}
                {(spec.color_keywords?.length || 0) > (spec.color_hex?.length || 0) &&
                  spec.color_keywords?.slice(spec.color_hex?.length || 0).map((c, i) => (
                    <span key={`k-${i}`} className="text-xs bg-background rounded-full px-2 py-0.5 border border-border/50">{c}</span>
                  ))
                }
              </div>
            </div>
          )}

          {/* Materials */}
          {spec.material_types && spec.material_types.length > 0 && (
            <div className="flex items-start gap-2">
              <Layers className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex flex-wrap gap-1.5">
                {spec.material_types.map((m, i) => (
                  <span key={i} className="text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5">{m}</span>
                ))}
              </div>
            </div>
          )}

          {/* Style */}
          {spec.style_keywords && spec.style_keywords.length > 0 && (
            <div className="flex items-start gap-2">
              <Paintbrush className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex flex-wrap gap-1.5">
                {spec.style_keywords.map((s, i) => (
                  <span key={i} className="text-xs bg-accent rounded-full px-2 py-0.5">{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Texture/Finish */}
          {spec.texture_finish && (
            <div className="flex items-start gap-2">
              <FileText className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
              <span className="text-xs text-muted-foreground">Finish: <span className="text-foreground">{spec.texture_finish}</span></span>
            </div>
          )}

          {/* Specifications */}
          {spec.specifications && (
            <div className="flex items-start gap-2">
              <Ruler className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
              <span className="text-xs text-muted-foreground">Specs: <span className="text-foreground">{spec.specifications}</span></span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
