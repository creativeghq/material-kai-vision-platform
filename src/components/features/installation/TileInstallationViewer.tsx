import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Box, ChevronLeft, ChevronRight, Clock, Image as ImageIcon, Layers, Pause, Play, RotateCcw, TriangleAlert, Wrench } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent } from '@/components/core/ui/card';
import { CanvasLoader, ThreeErrorBoundary } from '@/components/features/ar/CanvasChrome';
import { cn } from '@/lib/utils';
import {
  cameraPose,
  progressCounts,
  sceneStateAt,
  type TileFloorPlan,
  type TileStepKey,
} from '@/lib/installation/tileFloorTemplate';
import type { PhotoCamera } from '@/lib/installation/photoCamera';
import { TileInstallationScene, type TileSceneColors } from './TileInstallationScene';

export interface RoomPhoto {
  url: string;
  width: number;
  height: number;
  camera: PhotoCamera;
  maskUrl?: string | null;
}

interface Props {
  plan: TileFloorPlan;
  colors: TileSceneColors;
  tileImageUrl?: string | null;
  photo?: RoomPhoto | null;
  autoPlay?: boolean;
}

function useOccluderMask(maskUrl: string | null | undefined): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    setDataUrl(null);
    if (!maskUrl) return;
    let live = true;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!live) return;
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      try {
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < data.data.length; i += 4) {
          const a = data.data[i + 3];
          const lum = 0.299 * data.data[i] + 0.587 * data.data[i + 1] + 0.114 * data.data[i + 2];
          const paint = a < 255 ? a > 127 : lum > 127;
          data.data[i] = 0;
          data.data[i + 1] = 0;
          data.data[i + 2] = 0;
          data.data[i + 3] = paint ? 0 : 255;
        }
        ctx.putImageData(data, 0, 0);
        setDataUrl(canvas.toDataURL('image/png'));
      } catch {
        setDataUrl(null);
      }
    };
    img.src = maskUrl;
    return () => { live = false; };
  }, [maskUrl]);
  return dataUrl;
}

export const TileInstallationViewer: React.FC<Props> = ({ plan, colors, tileImageUrl, photo, autoPlay }) => {
  const steps = plan.steps;
  const [inRoom, setInRoom] = useState(!!photo);
  const occluder = useOccluderMask(inRoom ? photo?.maskUrl : null);
  useEffect(() => { setInRoom(!!photo); }, [photo]);
  const [stepKey, setStepKey] = useState<TileStepKey>(steps[0]?.key ?? 'prepare');
  const [progress, setProgress] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [playAll, setPlayAll] = useState(false);
  const [exploded, setExploded] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  const last = steps.length - 1;
  const lastIndexRef = useRef(0);
  const found = steps.findIndex((s) => s.key === stepKey);
  const safeIndex = found >= 0 ? found : Math.min(lastIndexRef.current, Math.max(last, 0));
  lastIndexRef.current = safeIndex;
  const step = steps[safeIndex];

  useEffect(() => {
    setSelected(null);
  }, [plan]);

  const goTo = useCallback((i: number, animate: boolean) => {
    const target = steps[Math.min(Math.max(i, 0), Math.max(last, 0))];
    if (!target) return;
    setStepKey(target.key);
    setProgress(animate ? 0 : 1);
    setPlaying(animate);
    setPlayAll(false);
  }, [steps, last]);

  const progressRef = useRef(progress);
  progressRef.current = progress;
  const stepRef = useRef({ index: safeIndex, playAll, steps });
  stepRef.current = { index: safeIndex, playAll, steps };

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let prev = performance.now();
    const tick = (now: number) => {
      const dt = (now - prev) / 1000;
      prev = now;
      const { index, playAll: all, steps: list } = stepRef.current;
      const next = progressRef.current + dt / (list[index]?.durationS ?? 4);
      if (next < 1) {
        progressRef.current = next;
        setProgress(next);
      } else if (all && index < list.length - 1) {
        progressRef.current = 0;
        setStepKey(list[index + 1].key);
        setProgress(0);
      } else {
        setProgress(1);
        setPlaying(false);
        setPlayAll(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const state = useMemo(() => sceneStateAt(plan, safeIndex, progress), [plan, safeIndex, progress]);
  const counts = useMemo(() => progressCounts(plan, state), [plan, state]);
  const initialPose = useMemo(
    () => cameraPose('overview', plan.params.areaWidthM, plan.params.areaDepthM),
    [plan.params.areaWidthM, plan.params.areaDepthM],
  );

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (progress >= 1) setProgress(0);
    setPlaying(true);
  };

  const autoPlayed = useRef(false);
  useEffect(() => {
    if (!autoPlay || autoPlayed.current || !steps[0]) return;
    autoPlayed.current = true;
    setStepKey(steps[0].key);
    setProgress(0);
    setPlayAll(true);
    setPlaying(true);
  }, [autoPlay, steps]);

  const playWhole = () => {
    if (!steps[0]) return;
    setStepKey(steps[0].key);
    setProgress(0);
    setPlayAll(true);
    setPlaying(true);
  };

  const rootRef = useRef<HTMLDivElement>(null);
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    const onButton = e.target instanceof HTMLButtonElement;
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(safeIndex + 1, true); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(safeIndex - 1, false); }
    else if (e.key === ' ' && !onButton) { e.preventDefault(); togglePlay(); }
  };
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const handler = (e: KeyboardEvent) => keyRef.current(e);
    el.addEventListener('keydown', handler);
    return () => el.removeEventListener('keydown', handler);
  }, []);

  if (!step) return null;
  const q = plan.quantities;

  return (
    <section ref={rootRef} className="space-y-3" tabIndex={-1} aria-label="Installation steps">
      <Card className="overflow-hidden">
        <div
          className={cn('relative w-full bg-surface-sunken', !(inRoom && photo) && 'aspect-[4/3] sm:aspect-[16/10]')}
          style={inRoom && photo ? {
            aspectRatio: `${photo.width} / ${photo.height}`,
            backgroundImage: `url("${photo.url}")`,
            backgroundSize: '100% 100%',
          } : undefined}
        >
          <ThreeErrorBoundary>
            <Suspense fallback={<CanvasLoader label="Building the floor…" />}>
              <Canvas
                camera={{ position: initialPose.position, fov: 45, near: 0.01, far: 100 }}
                gl={{ antialias: true, alpha: true }}
                onPointerMissed={() => setSelected(null)}
                onPointerDown={() => rootRef.current?.focus({ preventScroll: true })}
              >
                <TileInstallationScene
                  plan={plan}
                  state={state}
                  shot={step.camera}
                  exploded={exploded}
                  colors={colors}
                  selected={selected}
                  onSelect={setSelected}
                  tileImageUrl={tileImageUrl}
                  photoCamera={inRoom && photo ? photo.camera : null}
                />
              </Canvas>
            </Suspense>
          </ThreeErrorBoundary>
          {inRoom && photo && occluder && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage: `url("${photo.url}")`,
                backgroundSize: '100% 100%',
                maskImage: `url(${occluder})`,
                maskSize: '100% 100%',
                WebkitMaskImage: `url(${occluder})`,
                WebkitMaskSize: '100% 100%',
              }}
            />
          )}
          <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-1.5">
            <Badge variant="neutral" className="bg-card tabular-nums">Full tiles {counts.tilesPlaced} / {q.fullTiles}</Badge>
            <Badge variant="neutral" className="bg-card tabular-nums">Edge pieces {counts.cutsPlaced} / {q.cutTiles}</Badge>
            <Badge variant="neutral" className="bg-card tabular-nums">Spacers {counts.spacersPlaced} / {q.spacers}</Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-hairline bg-surface-sunken px-3 py-2">
          <Button variant="outline" size="sm" onClick={() => goTo(safeIndex - 1, false)} disabled={safeIndex === 0} aria-label="Previous step">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play this step'}>
            {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="sm" onClick={() => goTo(safeIndex + 1, true)} disabled={safeIndex === last} aria-label="Next step">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground">Step {safeIndex + 1} of {steps.length}</span>
          <div className="h-1.5 min-w-[6rem] flex-1 overflow-hidden rounded-sm bg-muted">
            <div className="h-full bg-primary" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <Button variant="ghost" size="sm" onClick={playWhole} className="gap-1.5">
            <RotateCcw className="h-4 w-4" />
            Play whole build
          </Button>
          {photo && (
            <div className="flex rounded-sm border border-hairline p-0.5" role="group" aria-label="View">
              <Button variant={inRoom ? 'secondary' : 'ghost'} size="sm" className="h-7 gap-1.5 px-2" aria-pressed={inRoom} onClick={() => setInRoom(true)}>
                <ImageIcon className="h-3.5 w-3.5" />In the room
              </Button>
              <Button variant={!inRoom ? 'secondary' : 'ghost'} size="sm" className="h-7 gap-1.5 px-2" aria-pressed={!inRoom} onClick={() => setInRoom(false)}>
                <Box className="h-3.5 w-3.5" />3D
              </Button>
            </div>
          )}
          <Button
            disabled={inRoom && !!photo}
            variant={exploded ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setExploded((v) => !v)}
            aria-pressed={exploded}
            className="gap-1.5"
          >
            <Layers className="h-4 w-4" />
            Layers
          </Button>
        </div>
      </Card>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <Card>
          <CardContent className="space-y-3 p-4">
            <div>
              <p className="text-xs text-muted-foreground">Step {safeIndex + 1}</p>
              <h3 className="text-base font-semibold">{step.title}</h3>
            </div>
            <p className="text-sm">{step.instruction}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <Wrench className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              {step.tools.map((t) => <Badge key={t} variant="neutral">{t}</Badge>)}
            </div>
            {step.warning && (
              <p className="flex gap-2 text-sm text-amber-800 dark:text-amber-300">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {step.warning}
              </p>
            )}
            {step.wait && (
              <p className="flex gap-2 text-sm text-muted-foreground">
                <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {step.wait}
              </p>
            )}
            <p className="text-xs text-muted-foreground">Click a tile to see its size. Drag to orbit, scroll to zoom.</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-2">
            <ol className="space-y-0.5">
              {steps.map((s, i) => (
                <li key={s.key}>
                  <button
                    type="button"
                    onClick={() => goTo(i, true)}
                    className={cn(
                      'flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted',
                      i === safeIndex && 'bg-primary/10 text-foreground',
                      i !== safeIndex && 'text-muted-foreground',
                    )}
                    aria-current={i === safeIndex ? 'step' : undefined}
                  >
                    <span className="w-4 shrink-0 text-right text-xs tabular-nums">{i + 1}</span>
                    <span className="min-w-0">{s.title}</span>
                  </button>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </section>
  );
};
