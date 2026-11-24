import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/core/ui/button';
import { Progress } from '@/components/core/ui/progress';
import { walkthroughFrame } from '@/lib/scene/walkthroughTimeline';
import { walkPlanOf, type WalkthroughPayload } from '@/components/features/scenestudio/ScrollWalkthrough';
import type { ScriptFrame } from '@/components/features/scenestudio/SceneCanvas';

const SceneCanvas = lazy(() => import('@/components/features/scenestudio/SceneCanvas').then((m) => ({ default: m.SceneCanvas })));

const W = 1280;
const H = 720;
const SECONDS_PER_STOP = 4;
const noop = () => undefined;

const pickMime = (): string => {
  const options = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  return options.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ?? '';
};

export const WalkthroughRecorder: React.FC<{
  data: WalkthroughPayload;
  autoStart?: boolean;
  onRecorded(video: Blob): void;
  onCancel(): void;
}> = ({ data, autoStart = false, onRecorded, onCancel }) => {
  const host = useRef<HTMLDivElement>(null);
  const out = useRef<HTMLCanvasElement>(null);
  const script = useRef<ScriptFrame | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ordered = useMemo(() => [...data.rooms].sort((a, b) => (a.walk_order ?? 0) - (b.walk_order ?? 0)), [data.rooms]);
  const { span, walk } = useMemo(() => walkPlanOf(ordered, data.walls, data.objects), [ordered, data.walls, data.objects]);
  const seconds = Math.min(60, Math.max(12, (walk.length + 3) * SECONDS_PER_STOP));
  const mime = useMemo(pickMime, []);

  useEffect(() => { script.current = walkthroughFrame(0, span, walk, data.render?.camera ?? null); }, [span, walk, data.render]);

  const record = async () => {
    const canvas = out.current;
    const gl = host.current?.querySelector('canvas');
    const ctx = canvas?.getContext('2d');
    if (!canvas || !gl || !ctx) { setError('The 3D room is not ready yet; try again in a moment.'); return; }
    if (!mime) { setError('This browser cannot record video.'); return; }
    setError(null);
    let photo: HTMLImageElement | null = null;
    if (data.render?.image_url) {
      photo = new Image();
      photo.crossOrigin = 'anonymous';
      photo.src = data.render.image_url;
      await photo.decode().catch(() => { photo = null; });
    }
    const names = ordered.map((r) => r.name);
    const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: mime, videoBitsPerSecond: 6_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const finished = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: mime.split(';')[0] })); });
    recorder.start(500);
    const t0 = performance.now();
    setProgress(0);
    await new Promise<void>((resolve) => {
      const tick = () => {
        const p = Math.min(1, (performance.now() - t0) / (seconds * 1000));
        const f = walkthroughFrame(p, span, walk, data.render?.camera ?? null);
        script.current = { pose: f.pose, walls: f.walls, objects: f.objects };
        ctx.drawImage(gl, 0, 0, W, H);
        if (f.dip > 0) { ctx.fillStyle = `rgba(245,243,238,${f.dip})`; ctx.fillRect(0, 0, W, H); }
        if (photo && f.render > 0) { ctx.globalAlpha = f.render; ctx.drawImage(photo, 0, 0, W, H); ctx.globalAlpha = 1; }
        const label = f.room < 0 ? (p < 0.12 ? 'The plan' : 'Your rooms, to scale') : f.room < names.length ? names[f.room] : 'The finished design';
        ctx.font = '600 26px Arial, sans-serif';
        const w = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillRect(32, H - 78, w + 32, 46);
        ctx.fillStyle = '#1d1d1b';
        ctx.fillText(label, 48, H - 46);
        setProgress(Math.round(p * 100));
        if (p < 1) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });
    recorder.stop();
    onRecorded(await finished);
  };

  useEffect(() => {
    if (!autoStart) return;
    const t = setTimeout(() => void record(), 2500);
    return () => clearTimeout(t);
  }, [autoStart]);

  return (
    <div className="space-y-3">
      <div ref={host} className="relative aspect-video w-full overflow-hidden rounded-sm border border-hairline bg-surface-sunken">
        <Suspense fallback={null}>
          <SceneCanvas
            rooms={data.rooms} walls={data.walls} openings={data.openings} surfaces={data.surfaces} finishes={data.finishes}
            objects={data.objects} products={data.products} defaultWallHeightMm={data.default_wall_height_mm} viewCamera={null}
            tool="view" wireframe={false} selectedId={null} onSelect={noop} onMoveObject={noop} onRemoveObject={noop} onPaint={noop}
            cabinetHardware={data.cabinet_hardware} script={script}
          />
        </Suspense>
      </div>
      <canvas ref={out} width={W} height={H} className="hidden" />
      {progress != null && <Progress value={progress} />}
      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        {walk.length} {walk.length === 1 ? 'room' : 'rooms'}, {seconds} seconds, recorded from the real plan{data.render ? ' and ending on the latest render' : ''}. Keep this tab in front while it records. No credits.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={progress != null && progress < 100}>Cancel</Button>
        <Button onClick={() => void record()} disabled={progress != null || !walk.length}>Record</Button>
      </div>
    </div>
  );
};

export default WalkthroughRecorder;
