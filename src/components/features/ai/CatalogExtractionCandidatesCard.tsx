import React, { useMemo, useState } from 'react';
import { CheckSquare, Square, Loader2, Package, Eye, Plus, X } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { catalogsService } from '@/services/catalogsService';

import { onEnterOrSpace } from '@/utils/a11y';


import { useEscapeKey } from '@/hooks/useEscapeKey';
export interface ExtractionCandidate {
  source_pdf_id: string;
  page_no: number | null;
  name: string;
  description: string | null;
  image_url: string | null;
  price: number | null;
  currency: string | null;
  specs: Record<string, any> | null;
}

interface Props {
  catalogId: string;
  query: string;
  candidates: ExtractionCandidate[];
}

export const CatalogExtractionCandidatesCard: React.FC<Props> = ({ catalogId, query, candidates }) => {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<number>>(new Set(candidates.map((_, i) => i)));
  const [sectionTitle, setSectionTitle] = useState(`Extracted: ${query.slice(0, 60)}`);
  const [submitting, setSubmitting] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);
  useEscapeKey(previewIdx !== null, () => setPreviewIdx(null));

  const allSelected = selected.size === candidates.length;
  const noneSelected = selected.size === 0;

  const toggle = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(candidates.map((_, i) => i)));
  };

  const handleApprove = async () => {
    if (noneSelected || !sectionTitle.trim()) return;
    setSubmitting(true);
    try {
      const picked = candidates.filter((_, i) => selected.has(i));
      await catalogsService.approveExtractionCandidates(catalogId, sectionTitle.trim(), picked);
      toast({ title: 'Added to catalog', description: `${picked.length} material${picked.length === 1 ? '' : 's'} → "${sectionTitle.trim()}"` });
      setCommitted(true);
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to approve', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const previewCandidate = useMemo(() => previewIdx == null ? null : candidates[previewIdx], [previewIdx, candidates]);

  if (candidates.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/50 bg-muted/30 overflow-hidden mb-2">
      <div className="px-3 py-2 border-b border-border/50 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Extraction candidates</span>
          <Badge variant="outline" className="text-[10px] py-0">{candidates.length}</Badge>
          <span className="text-xs text-muted-foreground hidden sm:inline">for "{query}"</span>
        </div>
        {!committed && (
          <Button size="sm" variant="ghost" onClick={toggleAll}>
            {allSelected ? <CheckSquare className="h-4 w-4 mr-1" /> : <Square className="h-4 w-4 mr-1" />}
            {allSelected ? 'Deselect all' : 'Select all'}
          </Button>
        )}
      </div>

      {!committed && (
        <div className="px-3 py-2 border-b border-border/50 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Add to section:</span>
          <Input
            value={sectionTitle}
            onChange={(e) => setSectionTitle(e.target.value)}
            className="h-7 text-sm flex-1 max-w-md"
            placeholder="Section title"
          />
        </div>
      )}

      {!committed && (
        <div className="px-3 pt-2 text-xs text-muted-foreground">
          Materials pulled from the catalog PDF. Deselect any that don't belong, then add the rest to a section.
        </div>
      )}

      <div className="p-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[420px] overflow-y-auto">
        {candidates.map((c, i) => {
          const isSelected = selected.has(i);
          return (
            <div
              role="button"
              tabIndex={0}
              onKeyDown={onEnterOrSpace(() => !committed && toggle(i))}
              key={i}
              className={`relative rounded border p-2 flex gap-2 cursor-pointer transition ${
                committed ? 'opacity-60 cursor-default' : isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
              }`}
              onClick={() => !committed && toggle(i)}
            >
              <div className="w-16 h-16 rounded overflow-hidden bg-muted shrink-0 relative">
                {c.image_url ? (
                  <img src={c.image_url} alt={c.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-muted-foreground text-center px-1">no image</div>
                )}
                {c.image_url && (
                  <button
                    className="absolute top-0 right-0 bg-black/60 text-white rounded-bl px-1 hover:bg-black/80"
                    onClick={(e) => { e.stopPropagation(); setPreviewIdx(i); }}
                    title="Preview"
                  >
                    <Eye className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-1">
                  <div className="font-medium text-xs truncate">{c.name}</div>
                  {!committed && (
                    isSelected ? <CheckSquare className="h-4 w-4 text-primary shrink-0" /> : <Square className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </div>
                {c.description && <div className="text-[11px] text-muted-foreground line-clamp-2">{c.description}</div>}
                <div className="flex flex-wrap gap-1 mt-1 items-center text-[10px]">
                  {c.page_no != null && <Badge variant="outline" className="py-0 px-1">p.{c.page_no}</Badge>}
                  {c.price != null && (
                    <span className="font-medium">{formatPrice(c.price, c.currency)}</span>
                  )}
                </div>
                {(() => {
                  const specEntries = c.specs
                    ? Object.entries(c.specs).filter(([k]) => k !== 'bbox')
                    : [];
                  const specsRaw = (c as any).specs_raw as Record<string, any> | null | undefined;
                  const rawEntries = specsRaw
                    ? Object.entries(specsRaw).filter(([k]) => k !== 'bbox')
                    : [];
                  if (specEntries.length === 0) return null;
                  return (
                    <details
                      role="presentation"
                      className="group rounded-lg border border-border bg-muted/40 mt-1.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <summary className="cursor-pointer list-none px-2.5 py-1.5 text-xs flex items-center justify-between gap-2">
                        <span className="font-medium">Specs</span>
                        <span className="text-[10px] text-muted-foreground">{specEntries.length}</span>
                      </summary>
                      <div className="px-2.5 pb-2 pt-0.5 space-y-1 text-[11px]">
                        {specEntries.map(([k, v]) => (
                          <div key={k} className="flex justify-between gap-2">
                            <span className="text-muted-foreground shrink-0">{humanizeSpecKey(k)}</span>
                            <span className="text-right break-words min-w-0">{formatSpecValue(v)}</span>
                          </div>
                        ))}
                        {rawEntries.length > 0 && (
                          <div className="pt-1 mt-1 border-t border-border">
                            <div className="text-muted-foreground mb-0.5">Original values</div>
                            {rawEntries.map(([k, v]) => (
                              <div key={k} className="flex justify-between gap-2">
                                <span className="text-muted-foreground shrink-0">{humanizeSpecKey(k)}</span>
                                <span className="text-right break-words min-w-0">{formatSpecValue(v)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </details>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>

      {!committed ? (
        <div className="px-3 py-2 border-t border-border/50 flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{selected.size} of {candidates.length} selected</span>
          <Button size="sm" onClick={handleApprove} disabled={submitting || noneSelected || !sectionTitle.trim()}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Add to catalog
          </Button>
        </div>
      ) : (
        <div className="px-3 py-2 border-t border-border/50 text-xs text-muted-foreground">
          ✓ Added to catalog. Review at <button className="underline text-primary" onClick={() => window.open(`/admin/catalogs/${catalogId}`, '_blank')}>/admin/catalogs/{catalogId.slice(0, 8)}…</button>
        </div>
      )}

      {previewCandidate?.image_url && (
        <div
          role="presentation"
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setPreviewIdx(null)}
        >
          <button className="absolute top-4 right-4 text-white bg-white/10 hover:bg-white/20 rounded-full p-2">
            <X className="h-4 w-4" />
          </button>
          <img src={previewCandidate.image_url} alt={previewCandidate.name} className="max-h-[90vh] max-w-[90vw] object-contain rounded" />
        </div>
      )}
    </div>
  );
};

function formatPrice(amount: number, currency: string | null): string {
  const symbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency === 'GBP' ? '£' : (currency ? `${currency} ` : '');
  return `${symbol}${amount.toFixed(2)}`;
}

function humanizeSpecKey(k: string): string {
  if (k.toLowerCase() === 'sku') return 'SKU';
  return k
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function formatSpecValue(v: any): string {
  if (v == null) return '—';
  if (Array.isArray(v)) return v.map((x) => formatSpecValue(x)).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
