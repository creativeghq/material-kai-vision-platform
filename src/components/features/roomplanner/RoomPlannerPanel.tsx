/**
 * Room planner panel (#321 M3, #259 Phase 1) — pick a layout, drop catalog products on it, arrange
 * to scale.
 *
 * "To scale" is not decorative here. A footprint comes from the product's measured 3D model when
 * one exists (M0 stores `width_m` / `depth_m`), and the UI says so — "measured" vs "assumed" — so
 * nobody reads a default 60 × 60 cm placeholder as a real dimension. That distinction is the
 * difference between a plan you can order from and a picture.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Ruler } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { RoomPlannerCanvas } from './RoomPlannerCanvas';
import { occupiedAreaM2 } from './roomGeometry';
import { roomPlannerService, type RoomLayout, type ResolvedLayoutItem } from '@/services/roomPlannerService';

export const RoomPlannerPanel: React.FC = () => {
  const { activeWorkspaceId } = useWorkspace();
  const { toast } = useToast();

  const [layouts, setLayouts] = useState<RoomLayout[]>([]);
  const [layoutId, setLayoutId] = useState<string | null>(null);
  const [items, setItems] = useState<ResolvedLayoutItem[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const layout = useMemo(() => layouts.find((l) => l.id === layoutId) ?? null, [layouts, layoutId]);

  const loadLayouts = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    try {
      const rows = await roomPlannerService.listLayouts(activeWorkspaceId);
      setLayouts(rows);
      setLayoutId((cur) => cur ?? rows[0]?.id ?? null);
    } catch (err) {
      toast({
        title: 'Could not load room plans',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId, toast]);

  useEffect(() => { void loadLayouts(); }, [loadLayouts]);

  const loadItems = useCallback(async () => {
    if (!layoutId) { setItems([]); return; }
    try {
      setItems(await roomPlannerService.listItems(layoutId));
    } catch (err) {
      toast({
        title: 'Could not load the plan',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [layoutId, toast]);

  useEffect(() => { void loadItems(); }, [loadItems]);

  // Products to place. Capped — this is a picker, not a catalog browser.
  useEffect(() => {
    if (!activeWorkspaceId) return;
    let cancelled = false;
    supabase.from('products').select('id, name').eq('workspace_id', activeWorkspaceId)
      .order('name').limit(100)
      .then(({ data }) => { if (!cancelled) setProducts((data ?? []) as { id: string; name: string }[]); });
    return () => { cancelled = true; };
  }, [activeWorkspaceId]);

  const createLayout = async () => {
    if (!activeWorkspaceId) return;
    try {
      const created = await roomPlannerService.createLayout(activeWorkspaceId, 'New room');
      setLayouts((l) => [created, ...l]);
      setLayoutId(created.id);
    } catch (err) {
      toast({
        title: 'Could not create the plan',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const addProduct = async (productId: string) => {
    if (!activeWorkspaceId || !layoutId || !layout) return;
    try {
      // Drop it in the middle rather than at the origin — the origin is a corner, and a corner is
      // where things get lost under the room outline.
      await roomPlannerService.addItem(
        activeWorkspaceId, layoutId, productId,
        { xM: Number(layout.room_width_m) / 2, yM: Number(layout.room_depth_m) / 2 },
        items.length,
      );
      await loadItems();
    } catch (err) {
      toast({
        title: 'Could not add the product',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  /** Optimistic local move; the write already happened on pointer release. */
  const commitMove = async (id: string, at: { xM: number; yM: number }) => {
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, x_m: at.xM, y_m: at.yM } : i)));
    try {
      await roomPlannerService.moveItem(id, at);
    } catch {
      // The database is the truth; reload rather than leaving the canvas showing a move that
      // did not persist.
      void loadItems();
    }
  };

  const rotate = async (id: string, deg: number) => {
    setItems((cur) => cur.map((i) => (i.id === id ? { ...i, rotation_deg: deg } : i)));
    const item = items.find((i) => i.id === id);
    if (!item) return;
    try {
      await roomPlannerService.moveItem(id, { xM: Number(item.x_m), yM: Number(item.y_m), rotationDeg: deg });
    } catch { void loadItems(); }
  };

  const remove = async (id: string) => {
    setSelectedId(null);
    try {
      await roomPlannerService.removeItem(id);
      await loadItems();
    } catch { void loadItems(); }
  };

  const resize = async (patch: { room_width_m?: number; room_depth_m?: number }) => {
    if (!layout) return;
    setLayouts((ls) => ls.map((l) => (l.id === layout.id ? { ...l, ...patch } : l)));
    try {
      await roomPlannerService.updateLayout(layout.id, patch);
    } catch { void loadLayouts(); }
  };

  const assumedCount = items.filter((i) => i.footprint_source === 'default').length;
  const areaUsed = occupiedAreaM2(items.map((i) => ({
    xM: Number(i.x_m), yM: Number(i.y_m), rotationDeg: Number(i.rotation_deg),
    widthM: Number(i.effective_width_m), depthM: Number(i.effective_depth_m),
  })));
  const roomArea = layout ? Number(layout.room_width_m) * Number(layout.room_depth_m) : 0;

  if (!activeWorkspaceId) {
    return <p className="text-sm text-muted-foreground">Select a workspace to plan a room.</p>;
  }

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <Ruler className="h-4 w-4 text-primary" />
          Room planner
        </CardTitle>
        <CardDescription>
          Arrange products on a floor plan at their real size. Items with an uploaded 3D model use
          its measured dimensions; the rest use a placeholder until one is uploaded.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1">
            <Label className="text-xs">Plan</Label>
            <Select value={layoutId ?? ''} onValueChange={(v) => { setLayoutId(v); setSelectedId(null); }}>
              <SelectTrigger><SelectValue placeholder="No plans yet" /></SelectTrigger>
              <SelectContent>
                {layouts.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" variant="outline" className="rounded-full" onClick={createLayout}>
            <Plus className="mr-1 h-3.5 w-3.5" />New plan
          </Button>

          {layout && (
            <>
              <div className="w-24">
                <Label className="text-xs">Width (m)</Label>
                <Input type="number" step="0.1" min="0.5" value={Number(layout.room_width_m)}
                  onChange={(e) => resize({ room_width_m: Number(e.target.value) || 1 })} />
              </div>
              <div className="w-24">
                <Label className="text-xs">Depth (m)</Label>
                <Input type="number" step="0.1" min="0.5" value={Number(layout.room_depth_m)}
                  onChange={(e) => resize({ room_depth_m: Number(e.target.value) || 1 })} />
              </div>
            </>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />Loading…
          </div>
        ) : !layout ? (
          <p className="py-8 text-sm text-muted-foreground">Create a plan to start arranging.</p>
        ) : (
          <>
            <RoomPlannerCanvas
              room={{ widthM: Number(layout.room_width_m), depthM: Number(layout.room_depth_m) }}
              items={items}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onMoveCommit={commitMove}
              onRotate={rotate}
              onRemove={remove}
            />

            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[14rem] flex-1">
                <Label className="text-xs">Add a product</Label>
                <Select value="" onValueChange={addProduct}>
                  <SelectTrigger>
                    <SelectValue placeholder={products.length ? 'Pick a product' : 'No products in this workspace'} />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              <span>{items.length} item{items.length === 1 ? '' : 's'}</span>
              <span>{areaUsed} m² of {Math.round(roomArea * 100) / 100} m² floor</span>
              {assumedCount > 0 && (
                <span className="text-warning">
                  {assumedCount} item{assumedCount === 1 ? ' uses a' : 's use'} placeholder size — upload a
                  3D model to plan {assumedCount === 1 ? 'it' : 'them'} to scale
                </span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
