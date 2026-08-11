/**
 * Material textures for one product (#321 / #260 item 6) — generate, compare, choose.
 *
 * The bench is the point. Two providers are already wired behind `resolveGenerationRouting`
 * (Gemini and Grok), so "which one is closer" is answered by generating both over the SAME product
 * photo and looking at them side by side, not by picking one in advance. Every candidate is kept;
 * `is_selected` is the one the AR and lighting previews actually render.
 *
 * Albedo only, and the card says so. A diffusion model asked for a normal map returns an image that
 * looks like one — the RGB are not surface directions, so a renderer doing arithmetic on them
 * lights the surface wrongly and it reads as plastic. The normal is derived from the chosen albedo
 * instead, which needs an imaging stack and therefore lands in MIVAA.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Sparkles, Check, Trash2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  productMaterialMapsService,
  type MaterialMapCandidate,
} from '@/services/productMaterialMapsService';

interface Props {
  productId: string;
  workspaceId: string;
  productName: string;
  /** The photo every candidate is derived FROM. Without one there is nothing to flatten. */
  sourceImageUrl: string | null;
}

/**
 * The bench. Both already exist behind `resolveGenerationRouting`, so this adds no provider.
 *
 * These are the REAL tier values (`GenerationTier = 'fast' | 'pro' | 'grok'`). The first draft used
 * an invented `'standard'`, which routes to the same Gemini default by accident — a button that
 * says one thing and does another, and nothing anywhere would have raised.
 */
const BENCH: Array<{ tier: 'fast' | 'pro' | 'grok'; label: string }> = [
  { tier: 'fast', label: 'Gemini' },
  { tier: 'grok', label: 'Grok' },
];

export const ProductMaterialMapsCard: React.FC<Props> = ({
  productId,
  workspaceId,
  productName,
  sourceImageUrl,
}) => {
  const { toast } = useToast();
  const [candidates, setCandidates] = useState<MaterialMapCandidate[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    productMaterialMapsService
      .listCandidates(productId, null)
      .then(setCandidates)
      .catch(() => setCandidates([]));
  }, [productId]);

  useEffect(() => { load(); }, [load]);

  const generate = async (tier: string, label: string) => {
    if (!sourceImageUrl) return;
    setBusy(tier);
    try {
      await productMaterialMapsService.generateAlbedo({
        workspaceId,
        productId,
        sourceImageUrl,
        itemName: productName,
        modelTier: tier,
      });
      load();
      toast({ title: `${label} texture generated` });
    } catch (e) {
      toast({
        title: 'Could not generate the texture',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  const urlFor = (c: MaterialMapCandidate) =>
    c.albedo_path
      ? supabase.storage.from(c.storage_bucket).getPublicUrl(c.albedo_path).data.publicUrl
      : null;

  return (
    <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
      <h3 className="text-sm font-semibold">Material texture</h3>
      <p className="text-[11px] text-muted-foreground mt-1 mb-4">
        Flattens this product's own photo into a seamless tile the AR and lighting previews can
        render as a surface. Without one they show the photo itself, which repeats visibly and
        carries its original lighting.
      </p>

      {!sourceImageUrl ? (
        <p className="text-xs text-muted-foreground">
          This product has no image to derive a texture from.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {BENCH.map((b) => (
            <Button
              key={b.tier}
              size="sm"
              variant="outline"
              className="rounded-full h-8 text-xs"
              disabled={busy !== null}
              onClick={() => generate(b.tier, b.label)}
            >
              {busy === b.tier
                ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                : <Sparkles className="h-3 w-3 mr-1.5" />}
              Generate with {b.label}
            </Button>
          ))}
          {/* Generating both and comparing is the intended use, so say it rather than assume it. */}
          <span className="text-[10px] text-muted-foreground">
            Run both and keep the better one — each costs credits.
          </span>
        </div>
      )}

      {candidates.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {candidates.map((c) => {
            const url = urlFor(c);
            return (
              <div key={c.id} className="space-y-1.5">
                {url && (
                  <img
                    src={url}
                    alt={`${c.model} texture candidate`}
                    className={`aspect-square w-full rounded-lg object-cover border ${
                      c.is_selected ? 'border-primary' : 'border-border/60'
                    }`}
                  />
                )}
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] text-muted-foreground truncate">{c.model}</span>
                  {c.is_selected ? (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                      <Check className="h-3 w-3" /> in use
                    </span>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button
                        className="text-[10px] text-primary hover:underline"
                        onClick={async () => {
                          await productMaterialMapsService.select(c.id);
                          load();
                        }}
                      >
                        use
                      </button>
                      <button
                        className="text-muted-foreground hover:text-destructive"
                        title="Delete this candidate"
                        onClick={async () => {
                          await productMaterialMapsService.remove(c.id);
                          load();
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
