import React, { useEffect, useState } from 'react';
import { ChevronDown, Loader2, Package, RotateCcw, Sparkles } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Label } from '@/components/core/ui/label';
import { ColourRow, ProductPicker } from '@/components/features/scenestudio/ScenePanels';
import { SCENE_SLOT_FOLLOWS, SCENE_SLOT_LABELS, slotsForKind, type SceneObjectSlot } from '@/lib/scene/sceneReadSchema';
import { colourOptions, resolveFinish } from '@/lib/scene/sceneSurfaces';
import { sceneStudioService, type SceneObject, type SceneObjectFinish, type SceneProduct } from '@/services/sceneStudioService';

const EDGED_SLOTS: ReadonlySet<SceneObjectSlot> = new Set(['fronts', 'carcass']);

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

export const SlotMaterials: React.FC<{
  obj: SceneObject;
  rows: SceneObjectFinish[];
  products: Record<string, SceneProduct>;
  workspaceId: string;
  makingTexture: boolean;
  onSet(slot: SceneObjectSlot, patch: { product: SceneProduct | null; colour_hex: string | null }): void;
  onReset(slot: SceneObjectSlot): void;
  onMakeTexture(product: SceneProduct): void;
}> = ({ obj, rows, products, workspaceId, makingTexture, onSet, onReset, onMakeTexture }) => {
  const slots = slotsForKind(obj.kind);
  const [open, setOpen] = useState<SceneObjectSlot | null>(slots.length === 1 ? slots[0] : null);
  const [picking, setPicking] = useState(false);
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
                onClick={() => { setOpen(isOpen ? null : slot); setPicking(false); }}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-surface-sunken"
              >
                <span className="h-6 w-6 shrink-0 overflow-hidden rounded-sm border border-hairline" style={{ backgroundColor: swatchHex ?? '#e9e6e1' }}>
                  {finish?.imageUrl && <img src={finish.imageUrl} alt="" className="h-full w-full object-cover" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium">{SCENE_SLOT_LABELS[slot]}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {finish?.label ?? (finish?.hex ? finish.hex : follows ? `As ${SCENE_SLOT_LABELS[SCENE_SLOT_FOLLOWS[slot]!]}` : 'As modelled')}
                  </span>
                </span>
                <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="space-y-2 bg-surface-sunken px-2 py-2">
                  <ColourRow value={row && !row.product_id ? row.colour_hex : null} onChange={(hex) => onSet(slot, { product: null, colour_hex: hex })} />
                  {product && colourOptions(product).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {colourOptions(product).map((o) => (
                        <button
                          key={o.hex}
                          type="button"
                          title={o.name}
                          aria-label={o.name}
                          onClick={() => onSet(slot, { product, colour_hex: row?.colour_hex === o.hex ? null : o.hex })}
                          className={`h-7 w-7 overflow-hidden rounded-sm border ${row?.colour_hex === o.hex ? 'border-primary ring-2 ring-primary/40' : 'border-hairline'}`}
                          style={{ backgroundColor: o.hex }}
                        >
                          {o.swatch_url && <img src={o.swatch_url} alt="" className="h-full w-full object-cover" />}
                        </button>
                      ))}
                    </div>
                  )}
                  {product && EDGED_SLOTS.has(slot) && <BoardEdgeTape product={product} />}
                  {product && row && !row.colour_hex && !product.albedoUrl && (
                    <Button size="sm" variant="outline" className="w-full gap-1.5" disabled={makingTexture} onClick={() => onMakeTexture(product)}>
                      {makingTexture ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      {makingTexture ? 'Making the Texture…' : 'Make a Clean Texture (6 credits)'}
                    </Button>
                  )}
                  {picking ? (
                    <ProductPicker
                      workspaceId={workspaceId}
                      title={`${SCENE_SLOT_LABELS[slot]} from the catalogue`}
                      onCancel={() => setPicking(false)}
                      onPick={(p) => { setPicking(false); onSet(slot, { product: p, colour_hex: null }); }}
                    />
                  ) : (
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={() => setPicking(true)}>
                        <Package className="h-3.5 w-3.5" />{product && row ? 'Another material' : 'Choose a material'}
                      </Button>
                      {row && (
                        <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => onReset(slot)}>
                          <RotateCcw className="h-3.5 w-3.5" />Reset
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
