/** The client's scroll walkthrough (#539, #604 phase 8): the real plan, its rooms and units, ending on the render from its own camera. */
import React, { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Footprints } from 'lucide-react';

import { Button } from '@/components/core/ui/button';

import { planBounds, planFrame, pointInPolygon, polygonCentroid, toScene, type PlanOpening, type PlanRoom, type PlanWall } from '@/lib/scene/sceneGeometry';
import { fitFov, walkthroughStage, type Pose, type WalkRoom } from '@/lib/scene/walkthroughTimeline';
import { roomSignature } from '@/lib/scene/roomSignature';
import type { SceneObject, SceneObjectFinish, SceneProduct, SceneSurface } from '@/services/sceneStudioService';
import { ExploreBar, ExploreShot, exploreHint, useExplore } from '@/components/features/scenestudio/WalkthroughExplore';
import type { SceneCanvasHandle, ScriptFrame } from '@/components/features/scenestudio/SceneCanvas';

const SceneCanvas = lazy(() => import('@/components/features/scenestudio/SceneCanvas').then((m) => ({ default: m.SceneCanvas })));

export interface WalkthroughPayload {
  name: string;
  default_wall_height_mm: number;
  cabinet_hardware: string | null;
  rooms: Array<PlanRoom & { walk_order?: number | null }>;
  walls: PlanWall[];
  openings: PlanOpening[];
  objects: Array<SceneObject & { model_url?: string | null }>;
  surfaces: SceneSurface[];
  finishes: SceneObjectFinish[];
  products: Record<string, SceneProduct>;
  render: { image_url: string; camera: Pose | null } | null;
  renders?: Array<{ image_url: string; camera: Pose | null; source?: string | null; sig?: string | null }>;
}

/** Pictures a room can end on: a Photo Mode picture of a room that has changed since is left out. */
export function currentRenders(d: WalkthroughPayload): NonNullable<WalkthroughPayload['renders']> {
  const f = planFrame(planBounds(d.rooms, d.walls));
  return (d.renders ?? []).filter((r) => {
    if (r.source !== 'photo_mode') return true;
    const p = r.camera?.position;
    const room = p && d.rooms.find((q) => pointInPolygon(p[0] * 1000 + f.cx, p[2] * 1000 + f.cy, q.outline));
    return !!room && r.sig === roomSignature(room.id, d.objects, d.surfaces, d.finishes);
  });
}

type Shot = { image_url: string; camera: Pose };

const noop = () => undefined;

export function walkPlanOf(
  ordered: PlanRoom[], walls: PlanWall[], objects: SceneObject[], renders: Shot[] = [],
): { span: number; walk: WalkRoom[]; shots: Array<Shot | null> } {
  const b = planBounds(ordered, walls);
  const f = planFrame(b);
  const shots: Array<Shot | null> = [];
  const walk: WalkRoom[] = ordered.filter((r) => r.outline.length >= 3).map((r) => {
    const shot = renders.find((x) => pointInPolygon(x.camera.position[0] * 1000 + f.cx, x.camera.position[2] * 1000 + f.cy, r.outline)) ?? null;
    shots.push(shot);
    const [cx, cy] = polygonCentroid(r.outline);
    const far = r.outline.reduce((best, p) => (Math.hypot(p[0] - cx, p[1] - cy) > Math.hypot(best[0] - cx, best[1] - cy) ? p : best), r.outline[0]);
    const inside = objects.filter((o) => !o.removed_at && (o.room_id === r.id || (!o.room_id && pointInPolygon(o.x_mm, o.y_mm, r.outline))));
    const focus = inside.length
      ? toScene(inside.reduce((s, o) => s + o.x_mm, 0) / inside.length, inside.reduce((s, o) => s + o.y_mm, 0) / inside.length, f)
      : null;
    return { centre: toScene(cx, cy, f), far: toScene(far[0], far[1], f), focus, corners: r.outline.map((p) => toScene(p[0], p[1], f)), shot: shot?.camera ?? null };
  });
  return { span: Math.max((b.maxX - b.minX) / 1000, (b.maxY - b.minY) / 1000, 2), walk, shots };
}

/** Everything a walkthrough of this plan shows; the scroll page, the explorer and the recorder all read this one answer. */
export function useWalkthrough(data: WalkthroughPayload) {
  return useMemo(() => {
    const ordered = [...data.rooms].sort((a, b) => (a.walk_order ?? 0) - (b.walk_order ?? 0)).filter((r) => r.outline.length >= 3);
    const current = currentRenders(data);
    const { span, walk, shots } = walkPlanOf(
      ordered, data.walls, data.objects, current.filter((r): r is Shot => !!r.camera?.position),
    );
    const hero = data.render && (!data.renders || current.some((r) => r.image_url === data.render!.image_url)) ? data.render : null;
    const heroInRoom = !!hero && shots.some((x) => x?.image_url === hero.image_url);
    return {
      ordered, span, walk, shots, hero, heroInRoom,
      finalPose: heroInRoom ? null : hero?.camera ?? null,
      names: ordered.map((r) => r.name),
      shotByRoom: Object.fromEntries(ordered.flatMap((r, i) => (shots[i] ? [[r.id, shots[i]!.image_url]] : []))) as Record<string, string>,
      modelUrls: Object.fromEntries(data.objects.filter((o) => o.model_url).map((o) => [o.id, o.model_url as string])) as Record<string, string>,
    };
  }, [data]);
}

const webgl2 = () => {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
};

export const ScrollWalkthrough: React.FC<{ data: WalkthroughPayload }> = ({ data }) => {
  const section = useRef<HTMLDivElement>(null);
  const dip = useRef<HTMLDivElement>(null);
  const photo = useRef<HTMLImageElement>(null);
  const caption = useRef<HTMLParagraphElement>(null);
  const shotImgs = useRef<Array<HTMLImageElement | null>>([]);
  const canvas = useRef<SceneCanvasHandle>(null);
  const script = useRef<ScriptFrame | null>(null);
  const reduced = useMemo(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, []);
  const canRender = useMemo(() => typeof document !== 'undefined' && webgl2(), []);

  const plan = useWalkthrough(data);
  const { ordered, walk, shots, hero, heroInRoom, names, shotByRoom, modelUrls } = plan;
  const explore = useExplore(ordered, shotByRoom, canvas);
  const exploring = explore.on;

  useLayoutEffect(() => {
    const el = section.current;
    if (!el?.parentElement) return;
    const fit = () => {
      el.style.width = `${document.documentElement.clientWidth}px`;
      el.style.marginLeft = `${-el.parentElement!.getBoundingClientRect().left}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [reduced, canRender]);

  useEffect(() => {
    if (reduced || !canRender || exploring) return;
    let raf = 0;
    const tick = () => {
      raf = 0;
      const el = section.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, -rect.top / Math.max(1, rect.height - window.innerHeight)));
      const st = walkthroughStage(p, plan);
      const f = st.frame;
      const aspect = window.innerWidth / Math.max(1, window.innerHeight);
      script.current = { pose: { ...f.pose, fov: fitFov(f.pose.fov, aspect) }, walls: f.walls, objects: f.objects };
      if (dip.current) dip.current.style.opacity = String(st.dip);
      const fit = aspect < 1.5 ? 'contain' : 'cover';
      if (photo.current) { photo.current.style.opacity = String(st.hero); photo.current.style.objectFit = fit; }
      shotImgs.current.forEach((img, i) => { if (img) { img.style.opacity = String(i === st.shotRoom ? st.shotOpacity : 0); img.style.objectFit = fit; } });
      if (caption.current) caption.current.textContent = st.caption;
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(tick); };
    tick();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [reduced, canRender, plan, exploring]);

  if (reduced || !canRender) {
    return hero
      ? <img src={hero.image_url} alt={`The design of ${data.name}`} className="w-full rounded-sm border border-hairline" />
      : <p className="text-sm text-muted-foreground">{canRender ? '' : 'This device cannot show the 3D walkthrough.'} Rooms: {names.join(', ')}.</p>;
  }

  return (
    <div ref={section} style={{ height: `${(walk.length + 3) * 100}vh` }} className="relative">
      <div
        className={exploring ? 'fixed inset-0 z-50 flex flex-col bg-background' : 'sticky top-0 flex h-screen w-full flex-col overflow-hidden bg-surface-sunken'}
        {...(exploring ? { role: 'dialog', 'aria-modal': true, 'aria-label': `Walk around ${data.name}` } : {})}
      >
        {exploring && <ExploreBar name={data.name} rooms={ordered} explore={explore} />}
        <div key="stage" className="relative min-h-0 flex-1">
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
              script={exploring ? undefined : script}
              walkRoomId={exploring ? explore.roomId : undefined}
              onWalkEnd={explore.overview}
              adaptive
            />
          </Suspense>
          {exploring ? (
            <>
              <p className="pointer-events-none absolute bottom-4 left-4 max-w-[80%] rounded-sm bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-overlay">{exploreHint(explore)}</p>
              <ExploreShot explore={explore} />
            </>
          ) : (
            <>
              {shots.map((x, i) => x && (
                <img key={i} ref={(el) => { shotImgs.current[i] = el; }} src={x.image_url} alt="" className="pointer-events-none absolute inset-0 h-full w-full bg-background object-cover" style={{ opacity: 0 }} />
              ))}
              <div ref={dip} className="pointer-events-none absolute inset-0 bg-background" style={{ opacity: 0 }} />
              {hero && !heroInRoom && (
                <img ref={photo} src={hero.image_url} alt="" className="pointer-events-none absolute inset-0 h-full w-full bg-background object-cover" style={{ opacity: 0 }} />
              )}
              <p ref={caption} className="pointer-events-none absolute bottom-6 left-6 rounded-sm bg-card px-3 py-1.5 text-sm shadow-overlay" />
              <Button size="sm" variant="secondary" className="absolute right-4 top-4 gap-1.5 bg-card shadow-overlay" onClick={explore.start}>
                <Footprints className="h-4 w-4" />Walk around
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ScrollWalkthrough;
