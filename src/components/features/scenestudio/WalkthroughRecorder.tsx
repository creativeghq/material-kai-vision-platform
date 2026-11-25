import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/core/ui/button';
import { Progress } from '@/components/core/ui/progress';
import { canEncodeVideo, encodeVideo } from '@/lib/scene/encodeVideo';
import { walkthroughStage } from '@/lib/scene/walkthroughTimeline';
import { useWalkthrough, type WalkthroughPayload } from '@/components/features/scenestudio/ScrollWalkthrough';
import type { SceneCanvasHandle, ScriptFrame } from '@/components/features/scenestudio/SceneCanvas';

const SceneCanvas = lazy(() => import('@/components/features/scenestudio/SceneCanvas').then((m) => ({ default: m.SceneCanvas })));

const W = 1280;
const H = 720;
const FPS = 24;
const SECONDS_PER_STOP = 4;
const SETTLE_ROOM_MS = 12_000;
const SETTLE_FRAME_MS = 200;
const noop = () => undefined;

const loadPicture = async (url: string): Promise<HTMLImageElement | null> => {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  try { await img.decode(); return img; } catch { return null; }
};

const drawCover = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, opacity: number) => {
  const k = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  const w = img.naturalWidth * k;
  const h = img.naturalHeight * k;
  ctx.globalAlpha = opacity;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  ctx.globalAlpha = 1;
};

const painted = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

/** Encodes frame by frame, waiting for the splats whenever the room changes, so a slow graphics card makes it slower, never choppier. */
export const WalkthroughRecorder: React.FC<{
  data: WalkthroughPayload;
  autoStart?: boolean;
  onRecorded(video: Blob): void;
  onCancel(): void;
}> = ({ data, autoStart = false, onRecorded, onCancel }) => {
  const frame = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<SceneCanvasHandle>(null);
  const out = useRef<HTMLCanvasElement>(null);
  const script = useRef<ScriptFrame | null>(null);
  const stopped = useRef(false);
  const [scale, setScale] = useState(0.5);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const plan = useWalkthrough(data);
  const { walk, shots, modelUrls, hero: heroShot, heroInRoom } = plan;
  const assets = Object.keys(modelUrls).length;
  const [pending, setPending] = useState<number | null>(assets ? null : 0);
  const ready = pending === 0;
  const seconds = Math.min(60, Math.max(12, (walk.length + 3) * SECONDS_PER_STOP));
  const canEncode = useMemo(canEncodeVideo, []);

  useEffect(() => {
    const f = walkthroughStage(0, plan).frame;
    script.current = { pose: f.pose, walls: f.walls, objects: f.objects };
  }, [plan]);

  useEffect(() => () => { stopped.current = true; }, []);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / W);
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    fit();
    return () => ro.disconnect();
  }, []);

  const record = async () => {
    const canvas = out.current;
    const gl = host.current?.querySelector('canvas');
    const ctx = canvas?.getContext('2d');
    if (!canvas || !gl || !ctx) { setError('The 3D room is not ready yet; try again in a moment.'); return; }
    setError(null);
    setProgress(0);
    try {
      const hero = heroShot && !heroInRoom ? await loadPicture(heroShot.image_url) : null;
      const shotPictures = await Promise.all(shots.map((x) => (x ? loadPicture(x.image_url) : null)));
      const total = seconds * FPS;
      let room: number | null = null;
      const video = await encodeVideo(canvas, FPS, total, async (i) => {
        if (stopped.current) return false;
        const st = walkthroughStage(i / (total - 1), plan);
        script.current = { pose: st.frame.pose, walls: st.frame.walls, objects: st.frame.objects };
        await painted();
        const limit = st.frame.room === room && scene.current?.lit() ? SETTLE_FRAME_MS : SETTLE_ROOM_MS;
        room = st.frame.room;
        for (const until = performance.now() + limit; !(scene.current?.settled() && scene.current.lit()) && performance.now() < until;) await painted();
        ctx.drawImage(gl, 0, 0, W, H);
        const shot = st.shotRoom >= 0 ? shotPictures[st.shotRoom] : null;
        if (shot && st.shotOpacity > 0) drawCover(ctx, shot, st.shotOpacity);
        if (st.dip > 0) { ctx.fillStyle = `rgba(245,243,238,${st.dip})`; ctx.fillRect(0, 0, W, H); }
        if (hero && st.hero > 0) drawCover(ctx, hero, st.hero);
        ctx.font = '600 26px Arial, sans-serif';
        const w = ctx.measureText(st.caption).width;
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillRect(32, H - 78, w + 32, 46);
        ctx.fillStyle = '#1d1d1b';
        ctx.fillText(st.caption, 48, H - 46);
        if (i % 6 === 0) setProgress(Math.round((i / total) * 100));
        return true;
      });
      if (!video) return;
      setProgress(100);
      onRecorded(video);
    } catch (e) {
      setProgress(null);
      setError(`The video could not be made: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  useEffect(() => {
    if (autoStart && ready && canEncode) void record();
  }, [autoStart, ready, canEncode]);

  return (
    <div className="space-y-3">
      <div ref={frame} className="relative aspect-video w-full overflow-hidden rounded-sm border border-hairline bg-surface-sunken">
        <div ref={host} className="absolute left-0 top-0 origin-top-left" style={{ width: W, height: H, transform: `scale(${scale})` }}>
          <Suspense fallback={null}>
            <SceneCanvas
              ref={scene}
              rooms={data.rooms} walls={data.walls} openings={data.openings} surfaces={data.surfaces} finishes={data.finishes}
              objects={data.objects} products={data.products} defaultWallHeightMm={data.default_wall_height_mm} viewCamera={null}
              tool="view" wireframe={false} selectedId={null} onSelect={noop} onMoveObject={noop} onRemoveObject={noop} onPaint={noop}
              cabinetHardware={data.cabinet_hardware} modelUrls={modelUrls} script={script} onAssets={setPending}
            />
          </Suspense>
        </div>
      </div>
      <canvas ref={out} width={W} height={H} className="hidden" />
      {progress != null && <Progress value={progress} />}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        {canEncode
          ? `${walk.length} ${walk.length === 1 ? 'room' : 'rooms'}, a ${seconds}-second video of the real plan with the same furniture and pictures the client sees. It is made frame by frame, so it takes a minute or more. Keep this tab in front. No credits.`
          : 'This browser cannot make video. Use a current Chrome, Edge, Firefox or Safari.'}
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => void record()} disabled={progress != null || !walk.length || !ready || !canEncode}>{ready ? 'Record' : pending ? `Loading ${pending} of ${assets}` : 'Loading the room'}</Button>
      </div>
    </div>
  );
};

export default WalkthroughRecorder;
