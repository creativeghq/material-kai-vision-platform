import React, { useEffect, useState } from 'react';
import { ChevronDown, Layers, Loader2, RotateCcw, Sparkles, X } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { ProductPicker } from '@/components/features/scenestudio/ScenePanels';
import { SCENE_SLOT_FOLLOWS, SCENE_SLOT_LABELS, slotsForKind, type SceneObjectSlot } from '@/lib/scene/sceneReadSchema';
import { colourOptions, resolveFinish } from '@/lib/scene/sceneSurfaces';
import { decorLabel, decorTone, type BoardDecorRef } from '@/lib/scene/boardDecor';
import { sceneStudioService, type BoardDecor, type SceneObject, type SceneObjectFinish, type SceneProduct } from '@/services/sceneStudioService';

const EDGED_SLOTS: ReadonlySet<SceneObjectSlot> = new Set(['fronts', 'carcass']);
const DECOR_SLOTS: ReadonlySet<SceneObjectSlot> = new Set(['fronts', 'carcass', 'plinth', 'worktop', 'top', 'seat', 'frame']);

/** The edge tape the catalogue matches to a board (same decor and surface structure); says so when there is none. */
const BoardEdgeTape: React.FC<{ product: SceneProduct }> = ({ product }) => {
  const decor = (product.metadata as Record<string, unknown> | null)?.decor_code;
  const [tapes, setTapes] = useState<Array<{ name: string }> | null>(null);
  useEffect(() => {
    let live = true;
    if (!decor) return;
    void sceneStudioService.boardEdgeTapes(product.id).then((t) => { if (live) setTapes(t); }).catch(() => { if (live) setTapes([]); });
    return () => { live = false; };
  }, [product.id, decor]);
  if (!decor || !tapes) return null;
  return (
    <p className="text-[11px] text-muted-foreground">
      {tapes.length ? `Edge tape: ${tapes.map((t) => t.name).join(', ')}` : `No edge tape in the catalogue matches decor ${String(decor)}.`}
    </p>
  );
};

const NO_CATEGORIES: string[] = [];

const refOf = (d: BoardDecor): BoardDecorRef => ({ brand: d.brand, code: d.decor_code, name: d.decor_name });

const BoardDecorPicker: React.FC<{ workspaceId: string; title: string; onPick(d: BoardDecor): void; onCancel(): void }> = ({ workspaceId, title, onPick, onCancel }) => {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<BoardDecor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      sceneStudioService.searchBoardDecors(workspaceId, q)
        .then((r) => { if (live) { setResults(r); setError(null); } })
        .catch((e) => { if (live) setError(e instanceof Error ? e.message : 'Search failed'); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [workspaceId, q]);
  return (
    <div className="space-y-2 rounded-sm border border-hairline bg-card p-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{title}</span>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onCancel} aria-label="Close"><X className="h-3.5 w-3.5" /></Button>
      </div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by code, name or brand (e.g. U665, oak, Egger)" autoFocus />
      {error ? <p className="text-xs text-destructive">{error}</p> : results === null ? (
        <p className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Searching</p>
      ) : results.length === 0 ? (
        <p className="text-xs text-muted-foreground">{q.trim() ? 'No board decor matches. Try a code or a colour word.' : 'No supplier price list with melamine decors has been loaded for this workspace.'}</p>
      ) : (
        <div className="max-h-64 divide-y divide-hairline overflow-y-auto rounded-sm border border-hairline">
          {results.map((d) => {
            const tone = decorTone(d.decor_name);
            return (
              <button
                key={`${d.brand}:${d.decor_code}`}
                type="button"
                onClick={() => onPick(d)}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-surface-sunken"
              >
                <span
                  className={`h-5 w-5 shrink-0 rounded-sm border ${tone ? 'border-hairline' : 'border-dashed border-muted-foreground/50'}`}
                  style={tone ? { backgroundColor: tone } : undefined}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs">{decorLabel(refOf(d))}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {[d.thicknesses?.join(', '), d.collection].filter(Boolean).join(' · ') || '—'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const SlotMaterials: React.FC<{
  obj: SceneObject;
  rows: SceneObjectFinish[];
  products: Record<string, SceneProduct>;
  workspaceId: string;
  makingTexture: boolean;
  onSet(slot: SceneObjectSlot, patch: { product: SceneProduct | null; colour_hex: string | null; decor?: BoardDecorRef | null }): void;
  onReset(slot: SceneObjectSlot): void;
  onMakeTexture(product: SceneProduct, hex?: string | null): void;
}> = ({ obj, rows, products, workspaceId, makingTexture, onSet, onReset, onMakeTexture }) => {
  const slots = slotsForKind(obj.kind);
  const [open, setOpen] = useState<SceneObjectSlot | null>(slots.length === 1 ? slots[0] : null);
  const [picking, setPicking] = useState<'decor' | null>(null);
  const [slotCats, setSlotCats] = useState<Record<string, string[]> | null>(null);
  useEffect(() => {
    let live = true;
    void sceneStudioService.slotCategories().then((c) => { if (live) setSlotCats(c); }).catch(() => { if (live) setSlotCats({}); });
    return () => { live = false; };
  }, []);
  const own = (slot: SceneObjectSlot) => rows.find((r) => r.object_id === obj.id && r.slot === slot);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Materials</Label>
      <div className="divide-y divide-hairline rounded-sm border border-hairline">
        {slots.map((slot, i) => {
          const row = own(slot);
          const follows = !row && SCENE_SLOT_FOLLOWS[slot] ? own(SCENE_SLOT_FOLLOWS[slot]!) : undefined;
          const shown = row ?? follows;
          const product = shown?.product_id ? products[shown.product_id] : undefined;
          const finish = shown ? resolveFinish(shown, product) : null;
          const swatchHex = finish?.hex ?? (i === 0 ? obj.colour_hex : null);
          const isOpen = open === slot;
          return (
            <div key={slot}>
              <button
                type="button"
                onClick={() => { setOpen(isOpen ? null : slot); setPicking(null); }}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-surface-sunken"
              >
                <span className="h-6 w-6 shrink-0 overflow-hidden rounded-sm border border-hairline" style={{ backgroundColor: swatchHex ?? '#e9e6e1' }}>
                  {finish?.imageUrl && <img src={finish.imageUrl} alt="" className="h-full w-full object-cover" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium">{SCENE_SLOT_LABELS[slot]}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {finish?.label ?? (follows ? `As ${SCENE_SLOT_LABELS[SCENE_SLOT_FOLLOWS[slot]!]}` : 'Material not chosen')}
                  </span>
                </span>
                <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <Tabs defaultValue="materials" className="bg-surface-sunken px-2 py-2">
                  <TabsList className="h-8">
                    <TabsTrigger value="materials" className="text-xs">Materials</TabsTrigger>
                    <TabsTrigger value="colours" className="text-xs">Colours</TabsTrigger>
                  </TabsList>
                  <TabsContent value="materials" className="mt-2 space-y-2">
                    <p className="text-[11px] text-muted-foreground">
                      {product ? `Now: ${product.name}` : row?.decor_code ? `Now: ${finish?.label ?? row.decor_code}` : 'Now: Material not chosen. Pick something you sell.'}
                    </p>
                    {picking === 'decor' ? (
                      <BoardDecorPicker
                        workspaceId={workspaceId}
                        title={`${SCENE_SLOT_LABELS[slot]} Board Decor`}
                        onCancel={() => setPicking(null)}
                        onPick={(d) => { setPicking(null); onSet(slot, { product: null, colour_hex: decorTone(d.decor_name), decor: refOf(d) }); }}
                      />
                    ) : slotCats === null ? (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Loading</p>
                    ) : (
                      <ProductPicker
                        workspaceId={workspaceId}
                        title={`${SCENE_SLOT_LABELS[slot]} From Your Catalogue`}
                        categoryIds={slotCats[slot] ?? NO_CATEGORIES}
                        emptyText={`Nothing in your catalogue is sold for ${SCENE_SLOT_LABELS[slot].toLowerCase()} yet. Add the product to your catalogue to use it here.`}
                        onPick={(p) => onSet(slot, { product: p, colour_hex: null })}
                      />
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {DECOR_SLOTS.has(slot) && picking !== 'decor' && (
                        <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={() => setPicking('decor')}>
                          <Layers className="h-3.5 w-3.5" />{row?.decor_code ? 'Another board decor' : 'Board decor'}
                        </Button>
                      )}
                      {row && (
                        <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => onReset(slot)}>
                          <RotateCcw className="h-3.5 w-3.5" />Reset
                        </Button>
                      )}
                    </div>
                    {product && EDGED_SLOTS.has(slot) && <BoardEdgeTape product={product} />}
                  </TabsContent>
                  <TabsContent value="colours" className="mt-2 space-y-2">
                    {product && colourOptions(product).length > 0 ? (
                      <div className="grid grid-cols-4 gap-1.5">
                        {colourOptions(product).map((o) => (
                          <button
                            key={o.hex}
                            type="button"
                            title={o.name}
                            onClick={() => onSet(slot, { product, colour_hex: row?.colour_hex === o.hex ? null : o.hex })}
                            className={`overflow-hidden rounded-sm border text-left ${row?.colour_hex === o.hex ? 'border-primary ring-2 ring-primary/40' : 'border-hairline'}`}
                          >
                            <span className="block aspect-square w-full" style={{ backgroundColor: o.hex }}>
                              {o.swatch_url && <img src={o.swatch_url} alt="" className="h-full w-full object-cover" />}
                            </span>
                            <span className="block truncate px-1 py-0.5 text-[10px]">{o.name}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        {product ? `${product.name} is sold in one colour.` : row?.decor_code ? 'A board decor is one fixed colour.' : 'Choose a material first. Its colours come from the product you sell.'}
                      </p>
                    )}
                    {row?.decor_code && (
                      <p className="text-[11px] text-muted-foreground">
                        {row.colour_hex ? `Approximate Tone ≈ ${row.colour_hex}. ` : 'No approximate tone for this decor. '}
                        The photo-real render reproduces the named decor, not this preview colour.
                      </p>
                    )}
                    {product && row && (row.colour_hex
                      ? !product.colourTextures?.[row.colour_hex] && colourOptions(product).some((o) => o.hex === row.colour_hex && o.swatch_url)
                      : !product.albedoUrl) && (
                      <Button size="sm" variant="outline" className="w-full gap-1.5" disabled={makingTexture} onClick={() => onMakeTexture(product, row.colour_hex)}>
                        {makingTexture ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                        {makingTexture ? 'Making the Texture…' : 'Make a Clean Texture (6 credits)'}
                      </Button>
                    )}
                  </TabsContent>
                </Tabs>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
