import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import {
  ArrowLeft, BookOpen, ChevronLeft, ChevronRight, CircleHelp, Clapperboard, Expand, Pause, Play, Share2, Tags, TriangleAlert, Users,
} from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { CanvasLoader, ThreeErrorBoundary } from '@/components/features/ar/CanvasChrome';
import { GuideScene, type GuideView } from '@/components/features/guides/GuideScene';
import { GuideBook } from '@/components/features/guides/GuideBook';
import { usePageAspects } from '@/components/features/guides/usePageAspects';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { buildGuide, countsAt, partCountAt, partUsedTotal, stepAt, type GuideBuild } from '@/lib/installation/guideBuild';
import type { GuideStep, InstallationGuideData } from '@/lib/installation/guideSchema';
import { GUIDE_BUCKET, installationGuideService, type InstallationGuideRow } from '@/services/installationGuideService';
import { supabase } from '@/integrations/supabase/client';

const stepSeconds = (build: GuideBuild, s: number) => build.stepSeconds[s] ?? 4;

function StepWords({ guide, build, index, x }: { guide: InstallationGuideData; build: GuideBuild; index: number; x: number }) {
  const step = guide.steps[index];
  if (!step) return null;
  const codes = guide.parts.filter((p) => p.code).map((p) => p.code);
  const pattern = codes.length ? new RegExp(`(${codes.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g') : null;
  const chunks = pattern ? step.instruction.split(pattern) : [step.instruction];
  const hardware = [...new Set(step.parts_used.map((u) => u.part_id))]
    .map((id) => guide.parts.find((p) => p.id === id))
    .filter((p) => p && p.kind === 'hardware');
  return (
    <>
      {chunks.map((c, i) => (codes.includes(c) ? <span key={i} className="font-mono text-amber-700 dark:text-amber-300">{c}</span> : <React.Fragment key={i}>{c}</React.Fragment>))}
      {hardware.slice(0, 2).map((p) => (
        <span key={p!.id}> <b className="tabular-nums">{partCountAt(build, p!.id, x)}</b> of {partUsedTotal(build, p!.id)} {p!.name.toLowerCase()} in.</span>
      ))}
    </>
  );
}

function ManualCrop({ url, step, aspect, onOpen }: { url: string | null; step: GuideStep | undefined; aspect: number; onOpen: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [box, setBox] = useState({ w: 300, h: 210 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  if (!step) return null;
  const { x0, y0, x1, y1 } = step.box;
  const u = x1 - x0;
  const d = (y1 - y0) * aspect;
  const p = Math.min(box.w / u, box.h / d);
  const style: React.CSSProperties = url ? {
    backgroundImage: `url("${url}")`,
    backgroundSize: `${p}px ${p * aspect}px`,
    backgroundPosition: `${(box.w - u * p) / 2 - x0 * p}px ${(box.h - d * p) / 2 - y0 * p * aspect}px`,
    backgroundRepeat: 'no-repeat',
  } : {};
  return (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      aria-label="The current step's drawing from the manual"
      className="relative block h-[clamp(110px,calc(100vh-520px),210px)] w-full cursor-zoom-in overflow-hidden rounded-sm bg-white"
    >
      <i key={`${step.page}-${x0}-${y0}`} className="absolute inset-0 animate-in fade-in duration-300" style={style} />
    </button>
  );
}

export default function GuidePlayerPage() {
  const { id = '' } = useParams();
  const { toast } = useToast();
  const [row, setRow] = useState<InstallationGuideRow | null>(null);
  const [pageUrls, setPageUrls] = useState<string[]>([]);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const g = await installationGuideService.get(id);
        if (!live) return;
        if (!g) { setLoadError('This guide does not exist or you cannot open it.'); return; }
        setRow(g);
        const urls = await installationGuideService.pageUrls(g);
        if (live) setPageUrls(urls);
        const { data } = await supabase.storage.from(GUIDE_BUCKET).createSignedUrl(`installation-guides/${g.workspace_id}/${g.id}/source.pdf`, 60 * 60 * 6);
        if (live) setSourceUrl(data?.signedUrl ?? null);
      } catch (e) {
        if (live) setLoadError(e instanceof Error ? e.message : 'The guide could not be loaded.');
      }
    })();
    return () => { live = false; };
  }, [id]);

  if (loadError) return <PlayerMessage text={loadError} id={id} />;
  if (!row) return <div className="flex h-screen items-center justify-center bg-background"><CanvasLoader label="Opening the guide…" /></div>;
  if (!row.guide || row.guide.steps.length === 0) return <PlayerMessage text="This manual has not been read into steps yet." id={id} />;
  return <GuidePlayerView row={row} guide={row.guide} pageUrls={pageUrls} sourceUrl={sourceUrl} toast={toast} />;
}

function PlayerMessage({ text, id }: { text: string; id: string }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
      <Button asChild variant="outline" size="sm"><Link to={id ? `/guides/${id}` : '/guides'}>Back to the guide</Link></Button>
    </div>
  );
}

export function GuidePlayerView({ row, guide, pageUrls, sourceUrl, toast }: {
  row: InstallationGuideRow;
  guide: InstallationGuideData;
  pageUrls: string[];
  sourceUrl: string | null;
  toast: ReturnType<typeof useToast>['toast'];
}) {
  const build = useMemo(() => buildGuide(guide), [guide]);
  const pageAspects = usePageAspects(pageUrls, row.page_aspect);
  const K = build.steps;
  const xRef = useRef(0);
  const explodeRef = useRef(0);
  const anim = useRef<{ from: number; to: number; t0: number; dur: number } | null>(null);
  const cineRef = useRef(true);
  const phase = useRef<{ name: 'start' | 'run' | 'ex' | 'unex'; wait: number }>({ name: 'start', wait: 0 });
  const explodeTarget = useRef(0);
  const [x, setX] = useState(0);
  const [cine, setCine] = useState(true);
  const [exploded, setExploded] = useState(false);
  const [view, setView] = useState<GuideView>('room');
  const [bookOpen, setBookOpen] = useState(false);
  const [labels, setLabels] = useState(true);
  const [howOpen, setHowOpen] = useState(false);
  const [shotVersion, setShotVersion] = useState(0);
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const step = stepAt(x, K);
  const counts = countsAt(build, x);
  const current = guide.steps[Math.min(step, guide.steps.length - 1)];
  const pageUrl = current ? pageUrls[current.page - 1] ?? null : null;
  const shot = exploded ? build.explodedCamera : x >= K - 1e-6 ? build.finalCamera : build.cameras[Math.min(step, build.cameras.length - 1)];

  const setCinematic = useCallback((on: boolean) => {
    cineRef.current = on;
    setCine(on);
    if (on) phase.current = { name: 'run', wait: performance.now() / 1000 + 0.2 };
  }, []);
  const halt = useCallback(() => { if (cineRef.current) setCinematic(false); }, [setCinematic]);

  const animateTo = useCallback((target: number) => {
    const e = Math.min(Math.max(target, 1), K);
    if (xRef.current < e - 1 - 1e-6 || xRef.current > e - 1e-6) xRef.current = e - 1;
    anim.current = { from: xRef.current, to: e, t0: performance.now() / 1000, dur: stepSeconds(build, e) * (e - xRef.current) };
    explodeTarget.current = 0;
    setExploded(false);
  }, [K, build]);

  const playStep = useCallback((s: number) => {
    halt();
    anim.current = null;
    explodeTarget.current = 0;
    setExploded(false);
    if (s <= 0) { xRef.current = 0; setX(0); return; }
    xRef.current = s - 1;
    animateTo(s);
  }, [halt, animateTo]);

  const next = useCallback(() => {
    halt();
    if (anim.current) { xRef.current = anim.current.to; anim.current = null; }
    explodeTarget.current = 0;
    setExploded(false);
    const e = Math.floor(xRef.current + 1e-6) + 1;
    if (e > K) { toast({ title: 'That was the last step' }); return; }
    animateTo(e);
  }, [halt, animateTo, K, toast]);

  const prev = useCallback(() => {
    halt();
    anim.current = null;
    explodeTarget.current = 0;
    setExploded(false);
    xRef.current = Math.max(0, Math.ceil(xRef.current - 1e-6) - 1);
  }, [halt]);

  const toggleExploded = useCallback(() => {
    halt();
    const on = explodeTarget.current < 0.5;
    if (on && xRef.current < K) { anim.current = null; xRef.current = K; }
    explodeTarget.current = on ? 1 : 0;
    setExploded(on);
  }, [halt, K]);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let lastUi = 0;
    const tick = (nowMs: number) => {
      const dt = Math.min((nowMs - last) / 1000, 0.1);
      last = nowMs;
      const now = nowMs / 1000;
      const a = anim.current;
      if (a) {
        const t = Math.min(Math.max((now - a.t0) / Math.max(a.dur, 0.01), 0), 1);
        xRef.current = a.from + (a.to - a.from) * t;
        if (t >= 1) { anim.current = null; phase.current.wait = now + 1.3; }
      }
      explodeRef.current += (explodeTarget.current - explodeRef.current) * (1 - Math.exp(-dt * 2.6));
      if (cineRef.current && !anim.current && now >= phase.current.wait) {
        const p = phase.current;
        if (p.name === 'start') { p.name = 'run'; p.wait = now + 3.2; }
        else if (xRef.current < K - 1e-6) animateTo(Math.floor(xRef.current + 1e-6) + 1);
        else if (p.name === 'run') { p.name = 'ex'; explodeTarget.current = 1; setExploded(true); p.wait = now + 5; }
        else if (p.name === 'ex') { p.name = 'unex'; explodeTarget.current = 0; setExploded(false); p.wait = now + 3.5; }
        else { xRef.current = 0; explodeRef.current = 0; p.name = 'start'; p.wait = now + 0.1; setShotVersion((v) => v + 1); }
      }
      if (nowMs - lastUi > 80) {
        lastUi = nowMs;
        setX((old) => (Math.abs(old - xRef.current) > 1e-4 ? xRef.current : old));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [K, animateTo]);

  const prevStep = useRef(step);
  useEffect(() => {
    if (prevStep.current !== step) {
      prevStep.current = step;
      setShotVersion((v) => v + 1);
    }
  }, [step]);

  const scrub = useCallback((clientX: number) => {
    const el = timelineRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let v = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1) * K;
    const r = Math.round(v);
    if (Math.abs(v - r) < 0.08) v = r;
    halt();
    anim.current = null;
    explodeTarget.current = 0;
    setExploded(false);
    xRef.current = v;
    setX(v);
  }, [K, halt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || howOpen) return;
      const k = e.key;
      if (k === '[') { e.preventDefault(); prev(); }
      else if (k === ']') { e.preventDefault(); next(); }
      else if (k === ' ') { e.preventDefault(); setCinematic(!cineRef.current); }
      else if (/^[0-9]$/.test(k) && !e.shiftKey) { e.preventDefault(); playStep(Math.min(Number(k), K)); }
      else if (e.shiftKey && k.toLowerCase() === 'b') { e.preventDefault(); setBookOpen((o) => !o); }
      else if (e.shiftKey && k.toLowerCase() === 'v') { e.preventDefault(); setView((v) => (v === 'room' ? 'drawing' : 'room')); }
      else if (e.shiftKey && k.toLowerCase() === 'x') { e.preventDefault(); toggleExploded(); }
      else if (e.shiftKey && k.toLowerCase() === 'n') { e.preventDefault(); setLabels((l) => !l); }
      else if (!e.shiftKey && k.toLowerCase() === 'c') { e.preventDefault(); setCinematic(!cineRef.current); }
      else if (!e.shiftKey && k.toLowerCase() === 'r') { e.preventDefault(); setShotVersion((v) => v + 1); }
      else if (k === 'Escape' && bookOpen) setBookOpen(false);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [prev, next, playStep, toggleExploded, setCinematic, K, bookOpen, howOpen]);

  const onHover = useCallback((key: string | null, cx: number, cy: number) => {
    setHover(key ? { key, x: cx, y: cy } : null);
  }, []);
  const onPick = useCallback((key: string) => {
    const it = build.items.find((i) => i.key === key);
    if (!it) return;
    if (xRef.current < it.ta - 1e-6 && Number.isFinite(it.ta)) {
      playStep(it.step);
      toast({ title: `Step ${it.step}: ${guide.steps[it.step]?.title ?? ''}` });
    } else {
      const part = guide.parts[it.partIndex];
      toast({ title: part?.name ?? 'Part', description: [part?.code, part?.quantity ? `${part.quantity} in the kit` : ''].filter(Boolean).join(' · ') });
    }
  }, [build.items, guide, playStep, toast]);

  const hoverItem = hover ? build.items.find((i) => i.key === hover.key) : null;
  const hoverText = hoverItem
    ? `${guide.parts[hoverItem.partIndex]?.name ?? ''}${x < hoverItem.ta - 1e-6 && Number.isFinite(hoverItem.ta) ? ` · goes in at step ${hoverItem.step}` : ''}`
    : '';

  const share = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      toast({ title: 'Link copied', description: 'Anyone in this workspace can open it.' });
    } catch {
      toast({ title: 'Copy the address bar to share this guide.' });
    }
  };

  const metaLine = `${row.page_count} pages · ${guide.parts.length} parts · ${K} steps`;
  const words = current ? (
    <p className="text-sm leading-snug">
      <span className="mr-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
        {step ? `Step ${step} · ` : ''}{current.title}
      </span>
      <StepWords guide={guide} build={build} index={step} x={x} />
    </p>
  ) : null;

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <main className="absolute inset-0" aria-label={`${guide.title} being put together, beside its manual`}>
        <ThreeErrorBoundary>
          <Suspense fallback={<CanvasLoader label="Opening the flat pack…" />}>
            <Canvas shadows camera={{ position: [2.5, 2.2, 3.2], fov: 42, near: 0.02, far: 200 }} gl={{ antialias: true }} dpr={[1, 2]}>
              <GuideScene
                guide={guide}
                build={build}
                xRef={xRef}
                explodeRef={explodeRef}
                view={view}
                shot={shot}
                shotVersion={shotVersion}
                stepIndex={step}
                pageUrl={pageUrl}
                hovered={hover?.key ?? null}
                onHover={onHover}
                onPick={onPick}
                labels={labels}
                atStart={x < 0.02}
                follow={!exploded}
              />
            </Canvas>
          </Suspense>
        </ThreeErrorBoundary>
      </main>

      <aside className={cn('pointer-events-none absolute left-3 top-3 z-20 flex w-[min(340px,calc(100vw-24px))] flex-col gap-2.5 transition-opacity', bookOpen && 'lg:opacity-0')}>
        <div className="pointer-events-auto">
          <Link to={`/guides/${row.id}`} className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />Guide
          </Link>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Step by step</p>
          <h1 className="font-sans text-2xl font-bold leading-tight text-amber-700 dark:text-amber-300">{guide.title}</h1>
          {guide.summary && <p className="mt-1 hidden text-sm text-muted-foreground sm:block">{guide.summary}</p>}
        </div>
        <div className="pointer-events-auto grid grid-cols-3 gap-1.5">
          {[
            ['Step', step, K],
            ['Hardware in', counts.hardware, build.hardwareTotal],
            ['Parts in', counts.panels, build.panelTotal],
          ].map(([label, a, b]) => (
            <div key={label as string} className="rounded-sm border border-hairline bg-card/90 px-2.5 py-1.5">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
              <p className="text-lg font-semibold tabular-nums">{a}<small className="text-xs font-normal text-muted-foreground">/{b}</small></p>
            </div>
          ))}
        </div>
        <div className="pointer-events-auto rounded-sm border border-hairline bg-card/90 p-3" aria-live="polite">
          {words}
          {current?.warning && (
            <p className="mt-2 flex gap-1.5 text-xs text-amber-800 dark:text-amber-300"><TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" />{current.warning}</p>
          )}
          {current && current.people > 1 && (
            <p className="mt-1.5 flex gap-1.5 text-xs text-muted-foreground"><Users className="mt-px h-3.5 w-3.5 shrink-0" />{current.people} people for this step</p>
          )}
        </div>
        <div className="pointer-events-auto hidden rounded-sm border border-hairline bg-card/90 p-2 sm:block">
          <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Manual · page <b className="text-foreground">{current?.page ?? '—'}</b></span>
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => setBookOpen(true)} title="Open the manual (⇧B)">
              <BookOpen className="h-3.5 w-3.5" />Open the manual
            </Button>
          </div>
          <ManualCrop url={pageUrl} step={current} aspect={current ? pageAspects[current.page - 1] ?? row.page_aspect : row.page_aspect} onOpen={() => setBookOpen(true)} />
        </div>
      </aside>

      <section aria-label="Controls" className="absolute bottom-3 left-3 right-3 z-20 rounded-md border border-hairline bg-card/95 p-3 shadow-overlay sm:left-auto sm:top-3 sm:bottom-auto sm:w-[370px]">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={prev} aria-label="Previous step" title="Previous step ([)"><ChevronLeft className="h-4 w-4" /></Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{current?.title}</p>
            <p className="font-mono text-[11px] text-muted-foreground">{step ? `step ${step} of ${K}` : 'before step 1'} · page {current?.page}</p>
          </div>
          <Button size="sm" onClick={() => setCinematic(!cine)} aria-label={cine ? 'Pause' : 'Play the build'} title={cine ? 'Pause (space)' : 'Play the build (space)'}>
            {cine ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button variant="outline" size="sm" onClick={next} aria-label="Next step" title="Next step (])"><ChevronRight className="h-4 w-4" /></Button>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>The build</span><span>[ ] · 0–9 · space</span>
          </div>
          <div
            ref={timelineRef}
            role="slider"
            tabIndex={0}
            aria-label="Assembly timeline"
            aria-valuemin={0}
            aria-valuemax={K}
            aria-valuenow={Number(x.toFixed(2))}
            className="relative mt-1 h-9 cursor-pointer touch-none select-none"
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); scrub(e.clientX); }}
            onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) scrub(e.clientX); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); prev(); }
              if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); next(); }
            }}
          >
            {Array.from({ length: K + 1 }, (_, t) => (
              <React.Fragment key={t}>
                <span
                  className={cn('absolute top-0 -translate-x-1/2 font-mono text-[10px] tabular-nums', t === step ? 'font-bold text-foreground' : 'text-muted-foreground')}
                  style={{ left: `${(t / K) * 100}%` }}
                >
                  {K <= 30 || t % 5 === 0 ? t : ''}
                </span>
                <span className="absolute bottom-0.5 h-1.5 w-px bg-hairline" style={{ left: `${(t / K) * 100}%` }} />
              </React.Fragment>
            ))}
            <div className="absolute left-0 right-0 top-[22px] h-1 rounded-full bg-muted" />
            <div className="absolute left-0 top-[22px] h-1 rounded-full bg-amber-500" style={{ width: `${(x / K) * 100}%` }} />
            <div className="absolute top-[17px] h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-amber-500 bg-card shadow-overlay" style={{ left: `${(x / K) * 100}%` }} />
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="flex rounded-sm border border-hairline p-0.5" role="group" aria-label="View">
            {(['room', 'drawing'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={cn('rounded-sm px-2.5 py-1 text-xs font-medium capitalize', view === v ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-1">
            <ToolButton on={bookOpen} onClick={() => setBookOpen((o) => !o)} label="Open the manual (⇧B)"><BookOpen className="h-4 w-4" /></ToolButton>
            <ToolButton on={exploded} onClick={toggleExploded} label="Exploded (⇧X)"><Expand className="h-4 w-4" /></ToolButton>
            <ToolButton on={cine} onClick={() => setCinematic(!cine)} label="Play the whole build, with a camera for each step (C)"><Clapperboard className="h-4 w-4" /></ToolButton>
            <ToolButton on={labels} onClick={() => setLabels((l) => !l)} label="Labels (⇧N)"><Tags className="h-4 w-4" /></ToolButton>
            <ToolButton on={false} onClick={share} label="Share"><Share2 className="h-4 w-4" /></ToolButton>
            <ToolButton on={false} onClick={() => setHowOpen(true)} label="How it works"><CircleHelp className="h-4 w-4" /></ToolButton>
          </div>
        </div>
      </section>

      <GuideBook
        open={bookOpen}
        title={guide.title}
        meta={metaLine}
        pageUrls={pageUrls}
        pageAspect={row.page_aspect}
        pageAspects={pageAspects}
        steps={guide.steps}
        currentStep={step}
        sourceUrl={sourceUrl}
        footer={words}
        onClose={() => setBookOpen(false)}
        onPlayStep={(s) => playStep(s)}
      />

      {hover && hoverText && (
        <div
          className="pointer-events-none fixed z-40 -translate-x-1/2 -translate-y-[140%] whitespace-nowrap rounded-sm border border-hairline bg-card px-2 py-1 text-xs text-foreground shadow-overlay"
          style={{ left: hover.x, top: hover.y }}
        >
          {hoverText}
        </div>
      )}

      <HowItWorks open={howOpen} onOpenChange={setHowOpen} guide={guide} build={build} />
    </div>
  );
}

function ToolButton({ on, onClick, label, children }: { on: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <Button variant={on ? 'secondary' : 'ghost'} size="sm" className="h-8 w-8 p-0" onClick={onClick} title={label} aria-label={label} aria-pressed={on}>
      {children}
    </Button>
  );
}

function HowItWorks({ open, onOpenChange, guide, build }: { open: boolean; onOpenChange: (o: boolean) => void; guide: InstallationGuideData; build: GuideBuild }) {
  const panels = guide.parts.filter((p) => p.kind === 'panel' || p.kind === 'fitting');
  const hardware = guide.parts.filter((p) => p.kind === 'hardware' || p.kind === 'accessory');
  const dims = guide.overall_cm;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>How {guide.title} goes together</DialogTitle></DialogHeader>
        <div className="space-y-4 text-sm">
          {guide.summary && <p>{guide.summary}{dims.stated ? ` It measures ${dims.x} × ${dims.z} × ${dims.y} cm.` : ''}</p>}
          <section className="space-y-1.5">
            <h3 className="font-semibold">What is in the box</h3>
            <p className="text-muted-foreground">{panels.map((p) => `${p.quantity > 1 ? `${p.quantity} × ` : ''}${p.name}`).join(', ') || 'No large parts were listed.'}</p>
            {hardware.length > 0 && (
              <ul className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
                {hardware.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2">
                    <span>{p.name}{p.code && <span className="ml-1 font-mono text-xs text-muted-foreground">{p.code}</span>}</span>
                    <span className="tabular-nums text-muted-foreground">{p.quantity}x</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {guide.tools.length > 0 && (
            <section className="space-y-1">
              <h3 className="font-semibold">Tools</h3>
              <p className="text-muted-foreground">{guide.tools.join(', ')}</p>
            </section>
          )}
          {guide.warnings.length > 0 && (
            <section className="space-y-1">
              <h3 className="font-semibold">Safety</h3>
              <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">{guide.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </section>
          )}
          <section className="space-y-1">
            <h3 className="font-semibold">Doing it</h3>
            <p className="text-muted-foreground">
              Step through with the arrows or the timeline, or press play to watch the whole build. <b className="text-foreground">Open the manual</b> to read it as a book beside the build, and click any drawing on a page to jump to that step. <b className="text-foreground">Drawing</b> shows the build in the manual's own line style. Hover a part to see what it is and when it goes in; click one that is still in the kit to jump to its step.
            </p>
          </section>
          <section className="space-y-1">
            <h3 className="font-semibold">What is exact and what is not</h3>
            <p className="text-muted-foreground">
              The parts, part numbers, counts and order are read from the manual. {build.hasAssembly
                ? 'Where each panel ends up is read off the drawings, so positions and sizes are close, not measured.'
                : 'This manual\'s finished shape was not read into 3D, so the parts are shown going in, in order, beside the kit rather than assembled.'} The 3D runs much faster than real hands do.
            </p>
          </section>
          <section className="space-y-1">
            <h3 className="font-semibold">Keys</h3>
            <p className="text-muted-foreground">
              <kbd>[</kbd> <kbd>]</kbd> previous and next step · <kbd>0</kbd>–<kbd>9</kbd> jump to a step · <kbd>space</kbd> or <kbd>C</kbd> play · <kbd>⇧B</kbd> the manual · <kbd>⇧V</kbd> room or drawing · <kbd>⇧X</kbd> exploded · <kbd>⇧N</kbd> labels · <kbd>R</kbd> reset the view · drag to orbit · right-drag to pan · scroll to zoom · <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to move, <kbd>Q</kbd> <kbd>E</kbd> to turn.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
