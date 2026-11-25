import React, { useEffect, useMemo, useState } from 'react';
import { Image as ImageIcon, X } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import type { PlanRoom } from '@/lib/scene/sceneGeometry';
import type { RoomWorld, SceneCanvasHandle } from '@/components/features/scenestudio/SceneCanvas';

export interface Explore {
  on: boolean;
  roomId: string | undefined;
  roomName: string | undefined;
  shot: string | undefined;
  finished: boolean;
  start(): void;
  close(): void;
  overview(): void;
  go(roomId: string): void;
  toggleFinished(): void;
}

/** Walking freely through the home the page is already showing: same canvas, so nothing is loaded twice. */
export function useExplore(rooms: PlanRoom[], worlds: RoomWorld[], shots: Record<string, string>, canvas: React.RefObject<SceneCanvasHandle>): Explore {
  const [on, setOn] = useState(false);
  const [roomId, setRoomId] = useState<string | undefined>(undefined);
  const [finished, setFinished] = useState(false);
  const real = !!roomId && worlds.some((w) => w.roomId === roomId);

  useEffect(() => {
    if (!on) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [on]);

  useEffect(() => {
    if (!on || roomId !== undefined) return;
    const t = setTimeout(() => canvas.current?.resetView(), 0);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOn(false); };
    window.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); window.removeEventListener('keydown', onKey); };
  }, [on, roomId, canvas]);

  return {
    on, roomId, finished,
    roomName: rooms.find((r) => r.id === roomId)?.name,
    shot: roomId && !real ? shots[roomId] : undefined,
    start: () => { setFinished(false); setRoomId(rooms[0]?.id); setOn(true); },
    close: () => setOn(false),
    overview: () => { setRoomId(undefined); setFinished(false); },
    go: (id) => { setRoomId(id); setFinished(false); },
    toggleFinished: () => setFinished((v) => !v),
  };
}

const touch = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

export function exploreHint({ roomId }: Explore): string {
  if (roomId === undefined) return touch() ? 'Drag to turn, pinch to zoom, or pick a room to walk in it.' : 'Drag to turn, scroll to zoom, or pick a room to walk in it.';
  return touch() ? 'Drag to look around. Tap the floor to walk there.' : 'Drag to look. W A S D or the arrows to walk, or click the floor to go there. Esc for the overview.';
}

export const ExploreBar: React.FC<{ name: string; rooms: PlanRoom[]; explore: Explore }> = ({ name, rooms, explore }) => {
  const list = useMemo(() => rooms.map((r) => ({ id: r.id, name: r.name })), [rooms]);
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-hairline bg-card px-4 py-2">
      <p className="mr-2 text-sm font-semibold">{name}</p>
      <div className="flex flex-1 flex-wrap gap-1.5">
        <Button size="sm" variant={explore.roomId === undefined ? 'secondary' : 'outline'} onClick={explore.overview}>Whole Home</Button>
        {list.map((r) => (
          <Button key={r.id} size="sm" variant={explore.roomId === r.id ? 'secondary' : 'outline'} onClick={() => explore.go(r.id)}>{r.name}</Button>
        ))}
      </div>
      {explore.shot && (
        <Button size="sm" variant="outline" className="gap-1.5" aria-pressed={explore.finished} onClick={explore.toggleFinished}>
          <ImageIcon className="h-4 w-4" />{explore.finished ? 'Back to 3D' : 'See it finished'}
        </Button>
      )}
      <Button size="sm" variant="ghost" aria-label="Close" onClick={explore.close}><X className="h-4 w-4" /></Button>
    </div>
  );
};

export const ExploreShot: React.FC<{ explore: Explore }> = ({ explore }) => (explore.finished && explore.shot ? (
  <button type="button" className="absolute inset-0 bg-background" onClick={explore.toggleFinished} aria-label="Back to 3D">
    <img src={explore.shot} alt={`The finished ${explore.roomName ?? 'room'}`} className="h-full w-full object-contain" />
  </button>
) : null);
