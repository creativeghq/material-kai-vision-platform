import React, { useState } from 'react';
import { Globe, ChevronDown, ChevronUp, ExternalLink, Palette, Layers, Paintbrush, Package } from 'lucide-react';

interface InspirationProduct {
  id?: string | null;
  name?: string;
  image_url?: string | null;
  score?: number | null;
}

interface InspirationCardProps {
  sourceUrl: string;
  pageTitle?: string;
  heroImage?: string | null;
  colors: string[];
  colorHex: string[];
  materials: string[];
  textures: string[];
  styles: string[];
  roomType?: string | null;
  focus?: string;
  products?: InspirationProduct[];
  searchQueryUsed?: string;
  totalResults?: number;
}

export function InspirationCard({
  sourceUrl,
  pageTitle,
  heroImage,
  colors,
  colorHex,
  materials,
  textures,
  styles,
  roomType,
  focus,
  products,
  searchQueryUsed,
  totalResults,
}: InspirationCardProps) {
  const [expanded, setExpanded] = useState(true);

  const hostname = (() => {
    try { return new URL(sourceUrl).hostname.replace('www.', ''); } catch { return sourceUrl; }
  })();

  return (
    <div className="rounded-xl border border-border bg-card text-card-foreground overflow-hidden mb-3">
      {/* Header */}
      <button
        className="w-full flex items-center gap-3 p-3 hover:bg-primary/10 transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="p-1.5 rounded-lg bg-primary/10 shrink-0">
          <Globe className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">Design Inspiration Analysis</p>
          <p className="text-xs text-muted-foreground truncate">{pageTitle || hostname}</p>
        </div>
        {focus && focus !== 'all' && (
          <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full shrink-0">
            Focus: {focus}
          </span>
        )}
        {expanded ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3">
          {/* Hero image thumbnail */}
          {heroImage && (
            <div className="rounded-lg overflow-hidden border border-border max-h-40">
              <img src={heroImage} alt="Inspiration" className="w-full h-full object-cover" loading="lazy" />
            </div>
          )}

          {/* Color palette */}
          {colorHex.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Palette className="h-3 w-3" />
                <span>Colors</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {colorHex.map((hex, i) => (
                  <div key={i} className="flex items-center gap-1.5 bg-background/80 rounded-full px-2 py-1 border border-border/50">
                    <div
                      className="w-4 h-4 rounded-full border border-white/30 shadow-sm"
                      style={{ backgroundColor: hex }}
                    />
                    <span className="text-xs">{colors[i] || hex}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Materials */}
          {materials.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Layers className="h-3 w-3" />
                <span>Materials</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {materials.map((m, i) => (
                  <span key={i} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{m}</span>
                ))}
              </div>
            </div>
          )}

          {/* Styles + Textures */}
          {(styles.length > 0 || textures.length > 0) && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Paintbrush className="h-3 w-3" />
                <span>Style & Texture</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {styles.map((s, i) => (
                  <span key={`s-${i}`} className="text-xs bg-accent px-2 py-0.5 rounded-full">{s}</span>
                ))}
                {textures.map((t, i) => (
                  <span key={`t-${i}`} className="text-xs bg-muted px-2 py-0.5 rounded-full">{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* Room type */}
          {roomType && (
            <p className="text-xs text-muted-foreground">Room: <span className="text-foreground">{roomType}</span></p>
          )}

          {/* Matching catalog materials — the whole point of the analysis */}
          {products && products.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Package className="h-3 w-3" />
                <span>Matching materials{typeof totalResults === 'number' && totalResults > products.length ? ` (${products.length} of ${totalResults})` : ` (${products.length})`}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {products.map((p, i) => (
                  <div key={i} className="rounded-lg">
                    <div className="aspect-square rounded-md overflow-hidden border border-border bg-muted/40">
                      {p.image_url
                        ? <img src={p.image_url} alt={p.name || 'Material'} className="w-full h-full object-cover" loading="lazy" />
                        : <div className="w-full h-full flex items-center justify-center text-muted-foreground"><Package className="h-5 w-5" /></div>}
                    </div>
                    <div className="mt-1 flex items-baseline justify-between gap-1">
                      <span className="text-[11px] truncate">{p.name || 'Untitled'}</span>
                      {typeof p.score === 'number' && (
                        <span className="text-[10px] text-muted-foreground shrink-0">{Math.round(p.score * 100)}%</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {searchQueryUsed && (
                <p className="text-[10px] text-muted-foreground">Matched on “{searchQueryUsed}”</p>
              )}
            </div>
          )}

          {/* Source link */}
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="h-3 w-3" />
            {hostname}
          </a>
        </div>
      )}
    </div>
  );
}
