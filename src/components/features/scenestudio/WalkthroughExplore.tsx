import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, X } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import type { PlanRoom } from '@/lib/scene/sceneGeometry';
import type { SceneCanvasHandle } from '@/components/features/scenestudio/SceneCanvas';
import { currentWorlds, type WalkthroughPayload } from '@/components/features/scenestudio/ScrollWalkthrough';

const SceneCanvas = lazy(() => import('@/components/features/scenestudio/SceneCanvas').then((m) => ({ default: m.SceneCanvas })));

const noop = () => undefined;

interface Props {
  data: WalkthroughPayload;
  rooms: PlanRoom[];
  modelUrls: Record<string, string>;
  shots: Record<string, string>;
  onClose(): void;
}

export const WalkthroughExplore: React.FC<Props> = ({ data, rooms, modelUrls, shots, onClose }) => {
  const canvas = useRef<SceneCanvasHandle>(null);
  const touch = useMemo(() => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches, []);
  const [roomId, setRoomId] = useState<string | undefined>(rooms[0]?.id);
  const [finished, setFinished] = useState(false);
  const worlds = useMemo(() => currentWorlds(data), [data]);
  const shot = roomId && !worlds.some((w) => w.roomId === roomId) ? shots[roomId] : undefined;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    if (roomId !== undefined) return;
    const t = setTimeout(() => canvas.current?.resetView(), 0);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); };
  }, [roomId, onClose]);

  const hint = roomId === undefined
    ? (touch ? 'Drag to turn, pinch to zoom, or pick a room to walk in it.' : 'Drag to turn, scroll to zoom, or pick a room to walk in it.')
    : (touch ? 'Drag to look around. Tap the floor to walk there.' : 'Drag to look. W A S D or the arrows to walk, or click the floor to go there. Esc for the overview.');

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background" role="dialog" aria-modal="true" aria-label={`Walk around ${data.name}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-hairline bg-card px-4 py-2">
        <p className="mr-2 text-sm font-semibold">{data.name}</p>
        <div className="flex flex-1 flex-wrap gap-1.5">
          <Button size="sm" variant={roomId === undefined ? 'secondary' : 'outline'} onClick={() => { setRoomId(undefined); setFinished(false); }}>Whole Home</Button>
          {rooms.map((r) => (
            <Button key={r.id} size="sm" variant={roomId === r.id ? 'secondary' : 'outline'} onClick={() => { setRoomId(r.id); setFinished(false); }}>{r.name}</Button>
          ))}
        </div>
        {shot && (
          <Button size="sm" variant="outline" className="gap-1.5" aria-pressed={finished} onClick={() => setFinished((v) => !v)}>
            <ImageIcon className="h-4 w-4" />{finished ? 'Back to 3D' : 'See it finished'}
          </Button>
        )}
        <Button size="sm" variant="ghost" aria-label="Close" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>
      <div className="relative flex-1">
        <Suspense fallback={null}>
          <SceneCanvas
            ref={canvas}
            rooms={data.rooms}
            walls={data.walls}
            openings={data.openings}
            surfaces={data.surfaces}
            finishes={data.finishes}
            objects={data.objects}
            products={data.products}
            defaultWallHeightMm={data.default_wall_height_mm}
            viewCamera={null}
            tool="view"
            wireframe={false}
            selectedId={null}
            onSelect={noop}
            onMoveObject={noop}
            onRemoveObject={noop}
            onPaint={noop}
            cabinetHardware={data.cabinet_hardware}
            modelUrls={modelUrls}
            worlds={worlds}
            walkRoomId={roomId}
            onWalkEnd={() => setRoomId(undefined)}
          />
        </Suspense>
        <p className="pointer-events-none absolute bottom-4 left-4 max-w-[80%] rounded-sm bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-overlay">{hint}</p>
        {finished && shot && (
          <button type="button" className="absolute inset-0 bg-background" onClick={() => setFinished(false)} aria-label="Back to 3D">
            <img src={shot} alt={`The finished ${rooms.find((r) => r.id === roomId)?.name ?? 'room'}`} className="h-full w-full object-contain" />
          </button>
        )}
      </div>
    </div>
  );
};

export default WalkthroughExplore;
