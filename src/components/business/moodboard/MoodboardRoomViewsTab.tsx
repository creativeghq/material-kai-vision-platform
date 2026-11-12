/** Moodboard → Room Views (#560): the moodboard's products laid on rooms, saved as `room_view` sheets. */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Eye, FileText, Grid3x3, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { HubEmptyState } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { staleProductIds } from '@/lib/surfaceRenderer';
import { roomViewService, type SavedRoomView } from '@/services/roomViewService';
import { moodboardSheetsService } from '@/services/moodboardSheetsService';
import { RoomViewEditor } from '@/components/features/visualizer/RoomViewEditor';
import { RoomViewHotspots } from '@/components/features/visualizer/RoomViewHotspots';
import { formatDate } from '@/utils/datetime';

interface Props {
  workspaceId: string;
  moodboardId: string;
  moodboardRoomId: string | null;
  productIds: string[];
  canEdit: boolean;
  /** Open a view for editing on arrival (`?view=`), or start one with a product (`?product=`). */
  initialViewId?: string | null;
  initialProductId?: string | null;
  /** Open an empty editor on arrival (`?new=1`, from a project room). */
  startNew?: boolean;
  onOpenProduct: (productId: string) => void;
}

type Mode = { kind: 'list' } | { kind: 'new'; productId: string | null } | { kind: 'edit'; view: SavedRoomView };

export const MoodboardRoomViewsTab: React.FC<Props> = ({
  workspaceId, moodboardId, moodboardRoomId, productIds, canEdit, initialViewId, initialProductId, startNew, onOpenProduct,
}) => {
  const { toast } = useToast();
  const [views, setViews] = useState<SavedRoomView[]>([]);
  const [stale, setStale] = useState<Map<string, string[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>(() =>
    (initialProductId || startNew) && canEdit ? { kind: 'new', productId: initialProductId ?? null } : { kind: 'list' });
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await roomViewService.list(moodboardId);
      setViews(list);
      const updated = await roomViewService.productsUpdatedAt(list.flatMap((v) => (v.data.layers ?? []).map((l) => l.product_id)));
      setStale(new Map(list.map((v) => [v.id, staleProductIds(v.data.rendered_at, updated.filter((u) => (v.data.layers ?? []).some((l) => l.product_id === u.id)))])));
      if (initialViewId && canEdit) {
        const target = list.find((v) => v.id === initialViewId);
        if (target) setMode((cur) => (cur.kind === 'list' ? { kind: 'edit', view: target } : cur));
      }
    } catch (e) {
      toast({ title: 'Could not load room views', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [moodboardId, initialViewId, canEdit, toast]);

  useEffect(() => { void load(); }, [load]);

  const remove = useCallback(async (v: SavedRoomView) => {
    if (!confirm(`Delete "${v.title}"? Any deck or client view that includes it will lose this page.`)) return;
    setBusyId(v.id);
    try {
      await moodboardSheetsService.remove(v.id);
      setViews((cur) => cur.filter((x) => x.id !== v.id));
    } catch (e) {
      toast({ title: 'Could not delete', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  }, [toast]);

  const openPdf = useCallback(async (v: SavedRoomView) => {
    setBusyId(v.id);
    try {
      const url = await moodboardSheetsService.refreshPdfUrl(v.id);
      if (url) window.open(url, '_blank', 'noopener');
      else toast({ title: 'The PDF is not ready yet', description: 'Save the view again to render it.' });
    } finally {
      setBusyId(null);
    }
  }, [toast]);

  const header = useMemo(() => (
    <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
      <div>
        <CardTitle className="text-base">Room Views</CardTitle>
        <CardDescription>This moodboard's products laid on a room at their real size, with a numbered pin on each surface. Each view is a sheet, so it goes into decks and client views.</CardDescription>
      </div>
      {canEdit && mode.kind === 'list' && (
        <Button size="sm" onClick={() => setMode({ kind: 'new', productId: null })}><Plus className="mr-1.5 h-3.5 w-3.5" />New room view</Button>
      )}
    </CardHeader>
  ), [canEdit, mode.kind]);

  if (mode.kind !== 'list') {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">{mode.kind === 'edit' ? `Edit ${mode.view.title}` : 'New Room View'}</CardTitle></CardHeader>
        <CardContent>
          <RoomViewEditor
            workspaceId={workspaceId}
            moodboardId={moodboardId}
            moodboardRoomId={moodboardRoomId}
            moodboardProductIds={productIds}
            existing={mode.kind === 'edit' ? mode.view : null}
            initialProductId={mode.kind === 'new' ? mode.productId : null}
            onCancel={() => setMode({ kind: 'list' })}
            onSaved={() => { setMode({ kind: 'list' }); void load(); }}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      {header}
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading room views…</div>
        ) : views.length === 0 ? (
          <HubEmptyState
            variant="empty"
            icon={Grid3x3}
            title="No room views yet"
            description="Lay this moodboard's tiles and stone on a room, floor and walls, at their real format."
            action={canEdit ? <Button size="sm" onClick={() => setMode({ kind: 'new', productId: null })}><Plus className="mr-1.5 h-3.5 w-3.5" />New room view</Button> : undefined}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {views.map((v) => {
              const changed = stale.get(v.id) ?? [];
              const layers = v.data.layers ?? [];
              return (
                <div key={v.id} className="grid gap-2">
                  <RoomViewHotspots
                    imageUrl={v.data.render_image_url ?? null}
                    alt={v.title}
                    layers={layers}
                    pins={v.data.pins ?? []}
                    actions={(layer) => (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onOpenProduct(layer.product_id)}>
                        <Eye className="mr-1 h-3 w-3" />View product
                      </Button>
                    )}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{v.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {v.data.scene_name} · {layers.length} surface{layers.length === 1 ? '' : 's'} · rendered {formatDate(v.data.rendered_at)}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openPdf(v)} disabled={busyId === v.id} aria-label="Open the PDF">
                        <FileText className="h-3.5 w-3.5" />
                      </Button>
                      {canEdit && (
                        <>
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setMode({ kind: 'edit', view: v })} aria-label="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => remove(v)} disabled={busyId === v.id} aria-label="Delete">
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  {changed.length > 0 && (
                    <p className="flex items-start gap-1.5 text-[11px] text-amber-800 dark:text-amber-300">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {changed.length === 1 ? 'A product here was' : `${changed.length} products here were`} changed after this render. Open it and save again to show {changed.length === 1 ? 'it' : 'them'} as {changed.length === 1 ? 'it is' : 'they are'} now.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
