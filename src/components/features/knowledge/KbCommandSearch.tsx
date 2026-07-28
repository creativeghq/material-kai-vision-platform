import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Star, Tag } from 'lucide-react';

import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/core/ui/dialog';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/core/ui/command';
import { KBCategory, KBDocument } from '@/services/knowledgeBaseService';

/** Brand from a brand/product doc title: "About HARMONY" → HARMONY,
 *  "MAISON - Certifications" / "HARMONY — Standards" → first segment. */
function brandFromTitle(title: string): string | null {
  if (!title) return null;
  const about = title.match(/^about\s+(.+)$/i);
  if (about) return about[1].trim();
  const seg = title.split(/\s[—–-]\s/)[0];
  return seg && seg !== title && seg.length <= 32 ? seg.trim() : null;
}

const collapse = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allDocs: KBDocument[];
  categories: KBCategory[];
  onSelect: (doc: KBDocument) => void;
}

/** MAC-style (⌘K) command-palette search for the Knowledge Base, with category
 *  + brand filters. Featured (tier 1) results rank first; secondary docs still
 *  appear under "More results". Filtering is custom (shouldFilter=false) so it
 *  matches "heatpump" ↔ "Heat Pump" and respects the chips. */
export const KbCommandSearch: React.FC<Props> = ({ open, onOpenChange, allDocs, categories, onSelect }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [catId, setCatId] = useState<string | null>(null);
  const [brand, setBrand] = useState<string | null>(null);

  const catName = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [categories]);

  const brands = useMemo(() => {
    const set = new Set<string>();
    allDocs.forEach((d) => {
      const b = brandFromTitle(d.title);
      if (b) set.add(b);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allDocs]);

  const matchedBrands = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? brands.filter((b) => b.toLowerCase().includes(q)) : brands).slice(0, 6);
  }, [brands, query]);

  const openBrand = (b: string) => {
    onOpenChange(false);
    navigate(`/brand/${b.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`);
  };

  const filtered = useMemo(() => {
    const qCollapsed = collapse(query);
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    return allDocs
      .filter((d) => {
        if (catId && d.category_id !== catId) return false;
        if (brand && brandFromTitle(d.title) !== brand) return false;
        if (!query.trim()) return true;
        const hay = `${d.title} ${d.summary || ''}`.toLowerCase();
        if (qCollapsed && collapse(hay).includes(qCollapsed)) return true;
        return tokens.length > 0 && tokens.every((t) => hay.includes(t));
      })
      .sort((a, b) => (((a as any).content_tier || 1) - ((b as any).content_tier || 1)));
  }, [allDocs, query, catId, brand]);

  const featured = filtered.filter((d) => ((d as any).content_tier || 1) === 1).slice(0, 8);
  const more = filtered.filter((d) => ((d as any).content_tier || 1) !== 1).slice(0, 12);

  const pick = (doc: KBDocument) => {
    onSelect(doc);
    onOpenChange(false);
  };

  const Chip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1 text-xs transition ${
        active ? 'bg-primary text-primary-foreground border-transparent' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 shadow-lg max-w-2xl">
        <DialogTitle className="sr-only">Search the Knowledge Base</DialogTitle>
        <DialogDescription className="sr-only">Search articles, filter by category or brand</DialogDescription>
        <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
          <CommandInput value={query} onValueChange={setQuery} placeholder="Search the knowledge base…" />

          {(categories.length > 0 || brands.length > 0) && (
            <div className="flex items-center gap-2 overflow-x-auto border-b px-3 py-2">
              <Chip active={!catId && !brand} onClick={() => { setCatId(null); setBrand(null); }}>All</Chip>
              {categories.map((c) => (
                <Chip key={c.id} active={catId === c.id} onClick={() => setCatId(catId === c.id ? null : c.id)}>
                  {c.name}
                </Chip>
              ))}
              {brands.slice(0, 12).map((b) => (
                <Chip key={b} active={brand === b} onClick={() => setBrand(brand === b ? null : b)}>
                  {b}
                </Chip>
              ))}
            </div>
          )}

          <CommandList className="max-h-[55vh]">
            <CommandEmpty>No articles found.</CommandEmpty>

            {matchedBrands.length > 0 && (
              <CommandGroup heading="Brands">
                {matchedBrands.map((b) => (
                  <CommandItem key={`b-${b}`} value={`brand-${b}`} onSelect={() => openBrand(b)} className="gap-2">
                    <Tag className="h-4 w-4 text-primary shrink-0" />
                    <span className="flex-1 truncate">Open {b} page</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {featured.length > 0 && (
              <CommandGroup heading="Featured">
                {featured.map((d) => (
                  <CommandItem key={d.id} value={`f-${d.id}`} onSelect={() => pick(d)} className="gap-2">
                    <Star className="h-4 w-4 text-primary shrink-0" />
                    <span className="flex-1 truncate">{d.title}</span>
                    {d.category_id && catName.get(d.category_id) && (
                      <span className="text-xs text-muted-foreground shrink-0">{catName.get(d.category_id)}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {more.length > 0 && (
              <CommandGroup heading="More results">
                {more.map((d) => (
                  <CommandItem key={d.id} value={`m-${d.id}`} onSelect={() => pick(d)} className="gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate">{d.title}</span>
                    {d.category_id && catName.get(d.category_id) && (
                      <span className="text-xs text-muted-foreground shrink-0">{catName.get(d.category_id)}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
};
