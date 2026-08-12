/**
 * `/embed/planner?key=…` — the room planner, for a merchant's visitor (#341 join 4).
 *
 * THE DOOR THE SDK WAS MISSING. The advertised flow is ask → configure → see → PLACE → price, and
 * "place" existed only inside the platform. A visitor on someone else's website could configure a
 * product and price it, and had no way to find out whether it fits.
 *
 * WHY A HOSTED PAGE RATHER THAN A WIDGET. The planner is React + R3F; shipping that into a
 * merchant's page means a 3D scene graph and a React runtime on every product page, for a feature
 * most visitors never open. The widget links here instead, so there is ONE planner — the same
 * canvas the platform uses — and the merchant's page stays two lines.
 *
 * NOTHING IS WRITTEN. An anonymous visitor cannot create a `room_layouts` row: RLS requires
 * workspace membership, and inventing an anonymous write path to a tenant table to store furniture
 * positions would be a new attack surface bought for a convenience. The arrangement lives in the
 * browser and travels WITH the enquiry, the same way the AI impression does — so the merchant
 * receives a lead saying what the visitor wanted AND how they laid it out.
 *
 * The catalogue comes through the embed API, so the key's scope, its origin rules and the
 * published-only gate all apply exactly as they do to the widget. This page never touches the
 * database directly.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Plus, Ruler, Trash2, RotateCw } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { RoomPlannerCanvas } from '@/components/features/roomplanner/RoomPlannerCanvas';
import type { ResolvedLayoutItem } from '@/services/roomPlannerService';
import { supabaseConfig } from '@/config/apis/supabaseConfig';

/** One product as the embed API returns it, reduced to what a plan needs. */
interface EmbedProduct {
  product_id: string;
  name: string;
  image: string | null;
  width_m: number | null;
  depth_m: number | null;
}

/** Placeholder footprint for a product with no measured model. Stated in the UI, never implied. */
const DEFAULT_FOOTPRINT_M = 0.6;

export default function EmbedPlannerPage() {
  const [params] = useSearchParams();
  const apiKey = params.get('key') ?? '';
  const initialProduct = params.get('product');

  const [products, setProducts] = useState<EmbedProduct[]>([]);
  const [items, setItems] = useState<ResolvedLayoutItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [room, setRoom] = useState({ widthM: 5, depthM: 4 });
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState('');

  const apiBase = supabaseConfig.projectUrl.replace(/\/$/, '');

  useEffect(() => {
    if (!apiKey) {
      setFailure('This planner link is missing its key.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    const url = `${apiBase}/functions/v1/products-3d-api?action=list`
      + `&key=${encodeURIComponent(apiKey)}&limit=60`;
    fetch(url)
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        const rows = Array.isArray(body?.products) ? body.products : [];
        setProducts(
          rows
            .map((p: Record<string, unknown>) => ({
              product_id: String(p.product_id ?? p.id ?? ''),
              name: String(p.name ?? 'Product'),
              image: (p.image as string) ?? null,
              // The embed API returns the model's measured dimensions when a model exists.
              width_m: (p.width_m as number) ?? null,
              depth_m: (p.depth_m as number) ?? null,
            }))
            .filter((p: EmbedProduct) => p.product_id),
        );
      })
      .catch(() => {
        if (!cancelled) setFailure('Could not load the catalogue.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [apiKey, apiBase]);

  const imageUrls = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of products) if (p.image) m.set(p.product_id, p.image);
    return m;
  }, [products]);

  /** Place one product in the middle of the room. Ids are local — nothing is persisted. */
  const place = (product: EmbedProduct) => {
    setItems((cur) => [
      ...cur,
      {
        id: `local-${crypto.randomUUID()}`,
        workspace_id: '',
        layout_id: '',
        product_id: product.product_id,
        x_m: room.widthM / 2,
        y_m: room.depthM / 2,
        rotation_deg: 0,
        sort_order: cur.length,
        footprint_width_m: null,
        footprint_depth_m: null,
        effective_width_m: product.width_m ?? DEFAULT_FOOTPRINT_M,
        effective_depth_m: product.depth_m ?? DEFAULT_FOOTPRINT_M,
        footprint_source: product.width_m ? 'model' : 'default',
        product_name: product.name,
      },
    ]);
  };

  // Place the product the visitor arrived with, once the catalogue is known.
  useEffect(() => {
    if (!initialProduct || products.length === 0 || items.length > 0) return;
    const p = products.find((x) => x.product_id === initialProduct);
    if (p) place(p);
    // Once, on arrival. Re-running would stack copies on the same spot, invisibly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialProduct, products]);

  const assumed = items.filter((i) => i.footprint_source === 'default').length;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl space-y-5 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <Ruler className="h-5 w-5 text-primary" /> Plan your room
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Arrange the pieces at their real size to see how they fit. Nothing is saved — send it with
          an enquiry when you are happy with it.
        </p>
      </div>

      {failure && <p className="text-sm text-destructive">{failure}</p>}

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-28">
          <Label className="text-xs">Room width (m)</Label>
          <Input
            type="number"
            step="0.1"
            min="1"
            value={room.widthM}
            onChange={(e) => setRoom((r) => ({ ...r, widthM: Math.max(1, Number(e.target.value) || 1) }))}
          />
        </div>
        <div className="w-28">
          <Label className="text-xs">Room depth (m)</Label>
          <Input
            type="number"
            step="0.1"
            min="1"
            value={room.depthM}
            onChange={(e) => setRoom((r) => ({ ...r, depthM: Math.max(1, Number(e.target.value) || 1) }))}
          />
        </div>
      </div>

      <RoomPlannerCanvas
        room={room}
        items={items}
        selectedId={selectedId}
        onSelect={setSelectedId}
        imageUrls={imageUrls}
        onMoveCommit={(id, at) => setItems((cur) =>
          cur.map((i) => (i.id === id ? { ...i, x_m: at.xM, y_m: at.yM } : i)))}
        onRotate={(id, deg) => setItems((cur) =>
          cur.map((i) => (i.id === id ? { ...i, rotation_deg: deg } : i)))}
        onRemove={(id) => setItems((cur) => cur.filter((i) => i.id !== id))}
      />

      {/* Which sizes are real. A 60 x 60 placeholder presented silently as a measurement is how
          somebody orders a sofa that does not fit. */}
      <p className="text-xs text-muted-foreground">
        {items.length} item{items.length === 1 ? '' : 's'}
        {assumed > 0 && ` · ${assumed} shown at an assumed size — no measured model yet`}
      </p>

      <div>
        <Label className="text-xs">Add a piece</Label>
        <div className="mt-1 flex flex-wrap gap-2">
          {products.map((p) => (
            <Button
              key={p.product_id}
              size="sm"
              variant="outline"
              className="rounded-full text-xs"
              onClick={() => place(p)}
            >
              <Plus className="mr-1 h-3 w-3" />
              {p.name}
            </Button>
          ))}
          {products.length === 0 && !failure && (
            <span className="text-xs text-muted-foreground">Nothing published to plan with yet.</span>
          )}
        </div>
      </div>

      {selectedId && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => setItems((cur) => cur.map((i) => (
              i.id === selectedId ? { ...i, rotation_deg: (Number(i.rotation_deg) + 90) % 360 } : i
            )))}
          >
            <RotateCw className="mr-1 h-3.5 w-3.5" />
            Rotate
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => {
              setItems((cur) => cur.filter((i) => i.id !== selectedId));
              setSelectedId(null);
            }}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Remove
          </Button>
        </div>
      )}
    </div>
  );
}
