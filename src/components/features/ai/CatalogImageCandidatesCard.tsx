import React, { useState } from 'react';
import { ImageIcon, Loader2, Globe, Database, Check } from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { catalogsService } from '@/services/catalogsService';

export interface ImageCandidate {
  source: 'db' | 'web';
  thumb_url: string;
  full_url: string;
  title: string | null;
  source_metadata: Record<string, any>;
}

interface Props {
  catalogId: string;
  sectionId: string | null;
  materialId: string | null;
  materialName: string;
  candidates: ImageCandidate[];
}

export const CatalogImageCandidatesCard: React.FC<Props> = ({
  catalogId, sectionId, materialId, materialName, candidates,
}) => {
  const { toast } = useToast();
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [committed, setCommitted] = useState(false);

  const canPersist = !!sectionId && !!materialId;

  const handleSelect = async (idx: number) => {
    if (!canPersist) {
      toast({
        title: 'Material not linked',
        description: 'Image candidates were generated without a target material. Open the catalog to attach manually.',
        variant: 'destructive',
      });
      return;
    }
    const c = candidates[idx];
    setSelectedIdx(idx);
    setSubmitting(true);
    try {
      await catalogsService.setMaterialImage(catalogId, sectionId!, materialId!, {
        url: c.full_url,
        source: c.source,
        metadata: c.source_metadata,
      });
      toast({ title: 'Image attached', description: `${c.source === 'db' ? 'Catalog' : 'Web'} image attached to "${materialName}"` });
      setCommitted(true);
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to attach', variant: 'destructive' });
      setSelectedIdx(null);
    } finally {
      setSubmitting(false);
    }
  };

  if (candidates.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/50 bg-muted/30 overflow-hidden mb-2">
      <div className="px-3 py-2 border-b border-border/50 flex items-center gap-2">
        <ImageIcon className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Image candidates</span>
        <Badge variant="outline" className="text-[10px] py-0">{candidates.length}</Badge>
        <span className="text-xs text-muted-foreground truncate">for "{materialName}"</span>
        {!canPersist && (
          <Badge variant="outline" className="ml-auto text-[10px] py-0">view-only</Badge>
        )}
      </div>

      <div className="p-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {candidates.map((c, i) => {
          const isPicked = selectedIdx === i;
          const meta = c.source_metadata || {};
          const domain: string | null = c.source === 'web' ? (meta.source_domain ?? null) : null;
          const sourceUrl: string | null = c.source === 'web' ? (meta.source_url ?? null) : null;
          const w = meta.width;
          const h = meta.height;
          const dims: string | null = c.source === 'web' && w && h ? `${w}×${h}` : null;
          const rawScore = meta.score;
          const scorePct: number | null =
            c.source === 'db' && typeof rawScore === 'number'
              ? Math.round(rawScore <= 1 ? rawScore * 100 : rawScore)
              : null;
          return (
            <div key={i} className="flex flex-col gap-0.5 min-w-0">
              <button
                disabled={committed || submitting}
                onClick={() => handleSelect(i)}
                className={`relative rounded overflow-hidden border-2 transition group ${
                  isPicked ? 'border-primary' : committed ? 'border-border opacity-50' : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="aspect-square bg-muted">
                  <img src={c.thumb_url} alt={c.title || ''} className="w-full h-full object-cover" />
                </div>
                <div className="absolute top-1 left-1 bg-black/60 text-white rounded px-1 py-0.5 text-[10px] flex items-center gap-1">
                  {c.source === 'db' ? <Database className="h-2.5 w-2.5" /> : <Globe className="h-2.5 w-2.5" />}
                  {c.source}
                </div>
                {dims && (
                  <div className="absolute top-1 right-1 bg-black/60 text-white rounded px-1 py-0.5 text-[10px]">
                    {dims}
                  </div>
                )}
                {scorePct != null && (
                  <div className="absolute top-1 right-1 bg-black/60 text-white rounded px-1 py-0.5 text-[10px]">
                    {scorePct}% match
                  </div>
                )}
                {isPicked && (
                  <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                    {submitting ? (
                      <Loader2 className="h-6 w-6 animate-spin text-primary-foreground" />
                    ) : (
                      <Check className="h-8 w-8 text-primary-foreground bg-primary rounded-full p-1" />
                    )}
                  </div>
                )}
                {c.title && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[10px] px-1 py-0.5 truncate text-left">
                    {c.title}
                  </div>
                )}
              </button>
              {domain && (
                sourceUrl ? (
                  <a
                    href={sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline text-[10px] truncate px-0.5"
                    title={sourceUrl}
                  >
                    {domain}
                  </a>
                ) : (
                  <span className="text-muted-foreground text-[10px] truncate px-0.5">{domain}</span>
                )
              )}
            </div>
          );
        })}
      </div>

      {committed ? (
        <div className="px-3 py-2 border-t border-border/50 text-xs text-muted-foreground">
          ✓ Image attached. Open the catalog to fine-tune.
        </div>
      ) : (
        <div className="px-3 py-2 border-t border-border/50 text-xs text-muted-foreground">
          Click an image to attach it to "{materialName}".
        </div>
      )}
    </div>
  );
};
