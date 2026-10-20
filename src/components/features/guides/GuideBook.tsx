import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { cn } from '@/lib/utils';
import type { GuideStep } from '@/lib/installation/guideSchema';

interface Props {
  open: boolean;
  title: string;
  meta: string;
  pageUrls: string[];
  pageAspect: number;
  steps: GuideStep[];
  currentStep: number;
  sourceUrl: string | null;
  footer: React.ReactNode;
  onClose: () => void;
  onPlayStep: (step: number) => void;
}

const STRIPS = 24;
const TURN_MS = 950;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const spreadOf = (page: number) => Math.floor(page / 2);

function buildLeaf(leaf: HTMLDivElement, forward: boolean, front: string | null, back: string | null, pw: number, ph: number) {
  const r = pw / STRIPS;
  leaf.innerHTML = '';
  leaf.style.left = `${pw}px`;
  leaf.style.display = 'block';
  const strips: HTMLDivElement[] = [];
  let parent: HTMLElement = leaf;
  for (let f = 0; f < STRIPS; f++) {
    const strip = document.createElement('div');
    Object.assign(strip.style, {
      position: 'absolute', top: '0', height: '100%', transformStyle: 'preserve-3d',
      width: `${r + 0.8}px`,
      left: `${f ? (forward ? r : -r) : forward ? 0 : -r}px`,
      transformOrigin: forward ? 'left center' : 'right center',
    });
    const frontOffset = forward ? -(f * r) : -(pw - (f + 1) * r);
    const backOffset = forward ? -(pw - (f + 1) * r) : -(f * r);
    for (const [url, offset, isBack] of [[front, frontOffset, false], [back, backOffset, true]] as const) {
      const face = document.createElement('div');
      Object.assign(face.style, {
        position: 'absolute', inset: '0', backgroundColor: '#ffffff', backgroundRepeat: 'no-repeat',
        backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
        transform: isBack ? 'rotateY(180deg)' : '',
      });
      if (url) {
        face.style.backgroundImage = `url("${url}")`;
        face.style.backgroundSize = `${pw}px ${ph}px`;
        face.style.backgroundPosition = `${offset}px 0`;
      }
      const shade = document.createElement('div');
      Object.assign(shade.style, { position: 'absolute', inset: '0', background: '#1a1408', opacity: 'var(--s, 0)' });
      face.appendChild(shade);
      strip.appendChild(face);
    }
    parent.appendChild(strip);
    parent = strip;
    strips.push(strip);
  }
  return strips;
}

export const GuideBook: React.FC<Props> = ({
  open, title, meta, pageUrls, pageAspect, steps, currentStep, sourceUrl, footer, onClose, onPlayStep,
}) => {
  const pages = pageUrls.length;
  const spreads = Math.floor(pages / 2) + 1;
  const stageRef = useRef<HTMLDivElement>(null);
  const leafRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const turning = useRef<{ done: () => void } | null>(null);
  const wheelAt = useRef(0);
  const [size, setSize] = useState({ pw: 300, ph: 300 * pageAspect });
  const [spread, setSpread] = useState(() => spreadOf(steps[currentStep]?.page ?? 1));
  const [visible, setVisible] = useState<[number, number]>(() => [spread * 2, spread * 2 + 1]);
  const [busy, setBusy] = useState(false);

  const url = (page: number) => (page >= 1 && page <= pages ? pageUrls[page - 1] || null : null);
  const pagesOf = (sp: number): [number, number] => [sp * 2, sp * 2 + 1 <= pages ? sp * 2 + 1 : 0];

  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = stageRef.current;
      if (!el) return;
      const h = el.clientHeight - 8;
      const w = el.clientWidth - 8;
      let pw = h / pageAspect;
      if (pw * 2 > w) pw = w / 2;
      setSize({ pw: Math.floor(pw), ph: Math.floor(pw * pageAspect) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (stageRef.current) ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, [open, pageAspect]);

  const finish = () => {
    const t = turning.current;
    turning.current = null;
    t?.done();
  };

  const turnTo = (target: number, animate: boolean) => {
    const next = Math.min(Math.max(target, 0), spreads - 1);
    finish();
    if (next === spread) return;
    const prev = spread;
    setSpread(next);
    const leaf = leafRef.current;
    const shadow = shadowRef.current;
    const [pl, pr] = pagesOf(prev);
    const [nl, nr] = pagesOf(next);
    const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!animate || !open || !leaf || !shadow || reduced) {
      setVisible([nl, nr]);
      return;
    }
    const forward = next > prev;
    const strips = buildLeaf(leaf, forward, url(forward ? pr : pl), url(forward ? nl : nr), size.pw, size.ph);
    shadow.style.left = `${forward ? size.pw : 0}px`;
    shadow.style.width = `${size.pw}px`;
    shadow.style.background = `linear-gradient(${forward ? 90 : 270}deg,#0007,#0000 70%)`;
    setVisible(forward ? [pl, nr] : [nl, pr]);
    setBusy(true);
    const start = performance.now();
    const token = {
      done() {
        leaf.style.display = 'none';
        leaf.innerHTML = '';
        shadow.style.opacity = '0';
        setVisible([nl, nr]);
        setBusy(false);
      },
    };
    turning.current = token;
    const frame = (now: number) => {
      if (turning.current !== token) return;
      const f = Math.min(Math.max((now - start) / TURN_MS, 0), 1);
      const e = f < 0.5 ? 4 * f * f * f : 1 - (-2 * f + 2) ** 3 / 2;
      const tip = 180 * e ** 1.7;
      const spine = 180 * Math.min(1, e ** 0.55);
      let acc = 0;
      for (let i = 0; i < STRIPS; i++) {
        const angle = lerp(tip, spine, i / (STRIPS - 1));
        strips[i].style.transform = `rotateY(${(forward ? -1 : 1) * (angle - acc)}deg)`;
        acc = angle;
        strips[i].style.setProperty('--s', (0.34 * Math.sin((angle * Math.PI) / 180) ** 1.5).toFixed(3));
      }
      shadow.style.opacity = (0.85 * Math.sin(Math.PI * f)).toFixed(3);
      if (f < 1) requestAnimationFrame(frame);
      else finish();
    };
    requestAnimationFrame(frame);
  };
  const turnRef = useRef(turnTo);
  turnRef.current = turnTo;

  useEffect(() => {
    turnRef.current(spreadOf(steps[currentStep]?.page ?? 1), true);
  }, [currentStep, steps]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); turnRef.current(spread + 1, true); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); turnRef.current(spread - 1, true); }
    };
    addEventListener('keydown', onKey, true);
    return () => removeEventListener('keydown', onKey, true);
  }, [open, spread]);

  const onWheel = (e: React.WheelEvent) => {
    const now = performance.now();
    if (now - wheelAt.current < 500) return;
    wheelAt.current = now;
    turnTo(spread + (e.deltaY > 0 || e.deltaX > 0 ? 1 : -1), true);
  };

  const [left, right] = visible;
  const [labelL, labelR] = pagesOf(spread);
  const hotspots = busy ? [] : steps
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.page === left || s.page === right);

  return (
    <section
      aria-label={`${title} manual`}
      className={cn(
        'absolute inset-y-3 left-3 z-30 flex w-[min(100vw-24px,var(--bk-w,980px))] flex-col gap-3 rounded-md border border-hairline bg-card/95 p-3 shadow-overlay transition-[opacity,transform] duration-300 lg:w-[min(62vw,calc(100vw-440px))]',
        open ? 'pointer-events-auto translate-x-0 opacity-100' : 'pointer-events-none -translate-x-4 opacity-0',
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="truncate font-mono text-[11px] text-muted-foreground">{meta}</p>
        </div>
        {sourceUrl && (
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" />PDF</a>
          </Button>
        )}
        <Button variant="outline" size="sm" className="gap-1.5" onClick={onClose} title="Close the manual (⇧B)">
          <X className="h-3.5 w-3.5" />Close
        </Button>
      </div>

      <div ref={stageRef} className="grid min-h-0 flex-1 place-items-center" style={{ perspective: '2600px' }} onWheel={onWheel}>
        <div className="relative flex" style={{ width: size.pw * 2, height: size.ph, transformStyle: 'preserve-3d' }}>
          {[left, right].map((page, side) => (
            <div
              key={side}
              className="relative overflow-hidden"
              style={{
                width: size.pw,
                height: size.ph,
                background: page ? '#ffffff' : 'transparent',
                borderRadius: side ? '0 6px 6px 0' : '6px 0 0 6px',
                boxShadow: page ? `inset ${side ? 18 : -18}px 0 22px -18px #0004` : 'none',
              }}
            >
              {page > 0 && url(page) && (
                <img src={url(page)!} alt={`Page ${page}`} draggable={false} className="pointer-events-none block h-full w-full select-none object-contain" />
              )}
            </div>
          ))}
          <div ref={shadowRef} className="pointer-events-none absolute top-0 h-full opacity-0" />
          <div ref={leafRef} className="pointer-events-none absolute left-0 top-0 hidden h-full w-0" style={{ transformStyle: 'preserve-3d' }} />
          {hotspots.map(({ s, i }) => {
            const offset = s.page === left ? 0 : size.pw;
            const on = i === currentStep;
            return (
              <button
                key={i}
                type="button"
                onClick={() => onPlayStep(i)}
                title={i ? `Build step ${i}` : 'The kit'}
                className={cn('group absolute rounded-md transition-colors', on ? 'bg-amber-400/20' : 'hover:bg-amber-400/15')}
                style={{
                  left: offset + s.box.x0 * size.pw,
                  top: s.box.y0 * size.ph,
                  width: (s.box.x1 - s.box.x0) * size.pw,
                  height: (s.box.y1 - s.box.y0) * size.ph,
                  mixBlendMode: 'multiply',
                }}
              >
                <b
                  className={cn(
                    'absolute right-1.5 top-1.5 rounded-sm bg-amber-200 px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-900 transition-opacity',
                    on ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                  )}
                  style={{ mixBlendMode: 'normal' }}
                >
                  {i ? `Step ${i}` : 'The kit'}
                </b>
              </button>
            );
          })}
          <div className="pointer-events-none absolute inset-0 rounded-md" style={{ boxShadow: '0 26px 60px -24px #000d' }} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => turnTo(spread - 1, true)} disabled={spread === 0} aria-label="Previous pages" title="Turn back (←)">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="w-20 text-center font-mono text-xs tabular-nums text-muted-foreground">
          {labelL && labelR ? `pages ${labelL}–${labelR}` : `page ${labelL || labelR}`}
        </span>
        <Button variant="outline" size="sm" onClick={() => turnTo(spread + 1, true)} disabled={spread >= spreads - 1} aria-label="Next pages" title="Turn the page (→)">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1 text-sm">{footer}</div>
      </div>
    </section>
  );
};
