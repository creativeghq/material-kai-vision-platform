import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { publicUrl, sceneStudioService, type SceneWorld, type WorldQuality } from '@/services/sceneStudioService';

export interface RoomWorldState { ready: SceneWorld | null; stale: boolean; running: SceneWorld | null; failed: SceneWorld | null }

const running = (w: SceneWorld) => w.status === 'views' || w.status === 'building';

/** The photoreal versions of a scene's rooms, kept up to date while any of them is being made. */
export function useSceneWorlds(sceneId: string, signatureOf: (roomId: string) => string) {
  const [worlds, setWorlds] = useState<SceneWorld[]>([]);
  const reload = useCallback(async () => { setWorlds(await sceneStudioService.listWorlds(sceneId)); }, [sceneId]);
  useEffect(() => { void reload().catch(() => setWorlds([])); }, [reload]);

  const active = worlds.find(running)?.id ?? null;
  useEffect(() => {
    if (!active) return;
    const t = setInterval(async () => {
      try {
        const now = await sceneStudioService.worldStatus(active);
        if (now) setWorlds((list) => list.map((w) => (w.id === now.id ? { ...w, ...now } : w)));
      } catch { /* the next tick tries again */ }
    }, 10_000);
    return () => clearInterval(t);
  }, [active]);

  const stateOf = (roomId: string): RoomWorldState => {
    const mine = worlds.filter((w) => w.room_id === roomId);
    const ready = mine.find((w) => w.status === 'ready' && w.splat_path) ?? null;
    return { ready, stale: !!ready && ready.layout_snapshot?.sig !== signatureOf(roomId), running: mine.find(running) ?? null, failed: mine[0]?.status === 'failed' ? mine[0] : null };
  };
  const shown = useMemo(() => {
    const out = new Map<string, string>();
    for (const w of worlds) if (w.status === 'ready' && w.splat_path && !out.has(w.room_id)) out.set(w.room_id, publicUrl(w.splat_path));
    return [...out].map(([roomId, url]) => ({ roomId, url }));
  }, [worlds]);
  return { stateOf, shown, reload };
}

const QUALITIES: Array<{ id: WorldQuality; label: string; note: string }> = [
  { id: 'draft', label: 'Preview', note: 'Ready in about 3 minutes' },
  { id: 'refined', label: 'Final', note: 'Sharper, ready in about 25 minutes' },
];

export const PhotorealDialog: React.FC<{
  roomName: string | null; hasRender: boolean; state: RoomWorldState | null; busy: boolean; onClose(): void; onStart(quality: WorldQuality): void;
}> = ({ roomName, hasRender, state, busy, onClose, onStart }) => {
  const [quality, setQuality] = useState<WorldQuality>('draft');
  const [prices, setPrices] = useState<Record<WorldQuality, number | null> | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const open = roomName !== null;
  useEffect(() => {
    if (!open || prices) return;
    sceneStudioService.worldPrices().then(setPrices).catch((e) => setPriceError(e instanceof Error ? e.message : String(e)));
  }, [open, prices]);
  const price = prices?.[quality] ?? null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Photoreal {roomName ?? 'Room'}</DialogTitle>
          <DialogDescription>
            The room is rebuilt photoreal from this plan: same walls, same furniture, same sizes. You and the client can walk around in it.
            {hasRender ? ' It takes its look from the latest render of this room.' : ' Render this room first if you want it to match an approved look.'}
          </DialogDescription>
        </DialogHeader>
        {state?.failed && <p className="text-sm text-destructive">The last try failed and the credits were returned{state.failed.error ? `: ${state.failed.error}` : '.'}</p>}
        <div className="grid grid-cols-2 gap-2">
          {QUALITIES.map((q) => (
            <button
              key={q.id}
              type="button"
              onClick={() => setQuality(q.id)}
              aria-pressed={quality === q.id}
              className={`rounded-sm border p-3 text-left ${quality === q.id ? 'border-primary ring-1 ring-primary' : 'border-hairline hover:bg-surface-sunken'}`}
            >
              <span className="block text-sm font-medium">{q.label}</span>
              <span className="block text-xs text-muted-foreground">{q.note}</span>
              <span className="mt-1 block text-xs tabular-nums">{prices ? (prices[q.id] == null ? 'Price not set' : `${prices[q.id]} credits`) : priceError ? 'Price unknown' : '…'}</span>
            </button>
          ))}
        </div>
        {priceError && <p className="text-xs text-destructive">The price could not be read: {priceError}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="gap-1.5" disabled={busy || price === null} onClick={() => onStart(quality)}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {busy ? 'Preparing' : `Make it photoreal${price === null ? '' : ` (${price} credits)`}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
