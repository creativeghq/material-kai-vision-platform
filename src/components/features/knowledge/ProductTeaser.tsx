import React from 'react';
import { Package } from 'lucide-react';

/** Marketing-safe product teaser card used on KB article pages, brand hubs and
 *  the brand index. Shows an anon-loadable thumbnail when available, else a
 *  placeholder. Click is owned by the parent (register funnel vs. product link). */
export const ProductTeaser: React.FC<{
  name: string;
  imageUrl?: string | null;
  cta: string;
  onClick: () => void;
}> = ({ name, imageUrl, cta, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="text-left rounded-2xl border bg-white p-3 hover:border-primary hover:shadow-sm transition group"
  >
    {imageUrl ? (
      <img
        src={imageUrl}
        alt={name}
        loading="lazy"
        className="w-full h-28 object-cover rounded-xl mb-3 bg-muted"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
      />
    ) : (
      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
        <Package className="h-4 w-4 text-primary" />
      </div>
    )}
    <p className="text-sm font-medium line-clamp-2 group-hover:text-primary transition-colors px-1">{name}</p>
    <p className="text-xs text-muted-foreground mt-1 px-1">{cta}</p>
  </button>
);
