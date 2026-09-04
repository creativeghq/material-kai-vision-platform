/**
 * Mark up a drawing: cloud the bit that is wrong, say why, measure it, raise it as an RFI.
 *
 * THE ONE STRUCTURAL DECISION is that every coordinate stored here is normalised 0–1 against the
 * page, never a pixel. A pixel coordinate is meaningless the moment somebody opens the same sheet
 * at a different zoom, on a phone, or at a different render DPI — the cloud lands elsewhere on the
 * drawing, still looking like a perfectly good markup, and the reader queries the wrong detail.
 * The arithmetic lives in `lib/drawingMarkup.ts` so it can be tested without a canvas.
 *
 * THE SCALE IS SET BY DRAWING A KNOWN LINE, never read off the title block. A sheet printed "1:50"
 * survives being photocopied at 90%; the drawing does not. Until somebody calibrates it, every
 * measure line reads "not measured" — never zero, because a zero in a takeoff is a quantity
 * somebody orders.
 *
 * The markup layer is SVG rather than a second canvas: it hit-tests, it scales with the page for
 * free, and it stays selectable text where it should be. The PDF page underneath is a canvas
 * because that is what pdf.js renders to.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import jsPDF from 'jspdf';
import {
  Loader2, Square, Cloud, MoveUpRight, Type, Ruler, Trash2, Download, MessageSquarePlus, X,
} from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  drawingMarkupsService, type DrawingMarkup, type DrawingScale,
} from '../services/drawingMarkupsService';
import {
  toNormalised, calibrationFactor, measuredLength, isCompleteGeometry, boxRect,
  type MarkupKind, type NormPoint,
} from '../lib/drawingMarkup';

// Vite resolves the worker to a real URL at build time. Without this pdf.js falls back to running
// the parser on the main thread, which locks the tab solid on a large A1 sheet.
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type Tool = MarkupKind | 'calibrate' | 'select';

const TOOLS: Array<{ id: Tool; label: string; icon: React.ReactNode }> = [
  { id: 'select', label: 'Select', icon: <MoveUpRight className="h-3.5 w-3.5 rotate-180" /> },
  { id: 'box', label: 'Box', icon: <Square className="h-3.5 w-3.5" /> },
  { id: 'cloud', label: 'Cloud', icon: <Cloud className="h-3.5 w-3.5" /> },
  { id: 'arrow', label: 'Arrow', icon: <MoveUpRight className="h-3.5 w-3.5" /> },
  { id: 'text', label: 'Note', icon: <Type className="h-3.5 w-3.5" /> },
  { id: 'measure', label: 'Measure', icon: <Ruler className="h-3.5 w-3.5" /> },
];

interface Props {
  revisionId: string;
  /** Signed URL for the revision's PDF. Re-signed on every open — never persisted. */
  fileUrl: string;
  drawingLabel: string;
  revLabel: string;
  isOwner: boolean;
  onClose: () => void;
  /** Fired after an RFI is raised, so the register behind can reload. */
  onRfiRaised?: (requestId: string) => void;
}

export const DrawingMarkupDialog: React.FC<Props> = ({
  revisionId, fileUrl, drawingLabel, revLabel, isOwner, onClose, onRfiRaised,
}) => {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [pageAspect, setPageAspect] = useState<number>(1);
  const [markups, setMarkups] = useState<DrawingMarkup[]>([]);
  const [scale, setScale] = useState<DrawingScale | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [draft, setDraft] = useState<NormPoint[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [calibrating, setCalibrating] = useState<{ a: NormPoint; b: NormPoint } | null>(null);
  const [knownLength, setKnownLength] = useState('');
  const [knownUnit, setKnownUnit] = useState('m');

  const loadMarkups = useCallback(async () => {
    try {
      const [m, s] = await Promise.all([
        drawingMarkupsService.list(revisionId),
        drawingMarkupsService.scale(revisionId),
      ]);
      setMarkups(m);
      setScale(s);
    } catch (err: any) {
      toast({ title: 'Could not load the markup', description: err?.message, variant: 'destructive' });
    }
  }, [revisionId, toast]);

  // ── render the sheet ──────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let doc: any = null;
    (async () => {
      setLoading(true);
      setRenderError(null);
      try {
        doc = await pdfjsLib.getDocument({ url: fileUrl }).promise;
        if (cancelled) return;
        const page = await doc.getPage(1);
        const base = page.getViewport({ scale: 1 });
        // Fit the width of the dialog, and cap the raster so an A0 sheet does not allocate a
        // 200-megapixel canvas and take the tab down with it.
        const targetWidth = Math.min(surfaceRef.current?.clientWidth || 900, 1600);
        const viewport = page.getViewport({ scale: targetWidth / base.width });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('This browser cannot render the drawing.');
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        if (cancelled) return;
        setPageAspect(base.width / base.height);
      } catch (err: any) {
        if (!cancelled) {
          // Named rather than left as an empty frame: a blank sheet reads as "this drawing has
          // nothing on it", which is the wrong conclusion to hand somebody.
          setRenderError(err?.message || 'The drawing could not be rendered.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      try { doc?.destroy?.(); } catch { /* already gone */ }
    };
  }, [fileUrl]);

  useEffect(() => { void loadMarkups(); }, [loadMarkups]);

  const rect = () => {
    const c = canvasRef.current;
    return { width: c?.clientWidth ?? 0, height: c?.clientHeight ?? 0 };
  };

  const pointFromEvent = (e: React.MouseEvent): NormPoint => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const box = c.getBoundingClientRect();
    return toNormalised(e.clientX - box.left, e.clientY - box.top, {
      width: box.width, height: box.height,
    });
  };

  // ── drawing ───────────────────────────────────────────────────────────────────────────────
  const onSurfaceClick = (e: React.MouseEvent) => {
    if (!isOwner || tool === 'select' || loading || renderError) return;
    const p = pointFromEvent(e);

    if (tool === 'calibrate') {
      if (draft.length === 0) { setDraft([p]); return; }
      setCalibrating({ a: draft[0], b: p });
      setDraft([]);
      return;
    }

    const next = [...draft, p];
    // A cloud keeps collecting points until double-click; everything else completes at its
    // minimum. `isCompleteGeometry` owns that rule so the canvas and the store agree.
    if (tool !== 'cloud' && isCompleteGeometry(tool, { points: next })) {
      void save(tool, next);
      setDraft([]);
      return;
    }
    setDraft(next);
  };

  const onSurfaceDoubleClick = () => {
    if (tool === 'cloud' && isCompleteGeometry('cloud', { points: draft })) {
      void save('cloud', draft);
      setDraft([]);
    }
  };

  const factor = scale?.scale_units_per_unit ?? null;

  const save = async (kind: MarkupKind, points: NormPoint[]) => {
    setBusy(true);
    try {
      const measured = kind === 'measure' ? measuredLength(points, factor, pageAspect) : null;
      await drawingMarkupsService.create({
        revision_id: revisionId,
        kind,
        geometry: { points },
        page_aspect: pageAspect,
        // Null when the sheet is uncalibrated: the line exists and its length is UNKNOWN, which is
        // a different fact from zero and is what the label says.
        measured_value: measured,
        measured_unit: measured == null ? null : (scale?.scale_unit ?? null),
      });
      await loadMarkups();
    } catch (err: any) {
      toast({ title: 'Could not save the markup', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const applyCalibration = async () => {
    if (!calibrating) return;
    const known = Number(knownLength.replace(',', '.'));
    const f = calibrationFactor(calibrating.a, calibrating.b, known, pageAspect);
    if (f == null) {
      // Refused rather than stored: a factor from a zero drag or a zero length makes every
      // measurement on the sheet nonsense while the drawing still looks calibrated.
      toast({
        title: 'That cannot set a scale',
        description: 'Drag along something with a real length, and type what that length is.',
        variant: 'destructive',
      });
      return;
    }
    setBusy(true);
    try {
      await drawingMarkupsService.setScale(revisionId, f, knownUnit.trim() || 'm');
      setCalibrating(null);
      setKnownLength('');
      await loadMarkups();
      toast({ title: 'Scale set', description: `Measurements on this sheet are now in ${knownUnit}.` });
    } catch (err: any) {
      toast({ title: 'Could not set the scale', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const clearScale = async () => {
    setBusy(true);
    try {
      await drawingMarkupsService.clearScale(revisionId);
      await loadMarkups();
      toast({
        title: 'Scale cleared',
        // Said plainly: the lines are still there and their lengths are now unknown. Anything that
        // implied they had gone back to zero would be the defect this whole file guards against.
        description: 'Existing measure lines now read as not measured until you set it again.',
      });
    } catch (err: any) {
      toast({ title: 'Could not clear the scale', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const removeMarkup = async (id: string) => {
    setBusy(true);
    try { await drawingMarkupsService.remove(id); setSelected(null); await loadMarkups(); }
    catch (err: any) { toast({ title: 'Could not delete', description: err?.message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const raiseRfi = async (m: DrawingMarkup) => {
    const title = (m.note || '').trim() || `Query on ${drawingLabel} rev ${revLabel}`;
    setBusy(true);
    try {
      // Idempotent in the database: a second press returns the same RFI rather than putting a
      // second numbered question to the architect about one detail.
      const id = await drawingMarkupsService.raiseRfi(m.id, title);
      await loadMarkups();
      onRfiRaised?.(id);
      toast({ title: 'RFI raised', description: title });
    } catch (err: any) {
      toast({ title: 'Could not raise the RFI', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  // ── export ────────────────────────────────────────────────────────────────────────────────
  const exportPdf = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBusy(true);
    try {
      // Draw the markup ONTO a copy of the rendered page, so the exported sheet carries the clouds
      // rather than a clean drawing with the notes lost. Compositing on a copy leaves the live
      // canvas alone — otherwise the on-screen page picks up a second set of clouds every export.
      const out = document.createElement('canvas');
      out.width = canvas.width;
      out.height = canvas.height;
      const ctx = out.getContext('2d');
      if (!ctx) throw new Error('This browser cannot export the drawing.');
      ctx.drawImage(canvas, 0, 0);
      paintMarkups(ctx, markups, out.width, out.height);

      const landscape = out.width >= out.height;
      const pdf = new jsPDF({
        orientation: landscape ? 'landscape' : 'portrait',
        unit: 'pt',
        format: [out.width, out.height],
      });
      pdf.addImage(out.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, out.width, out.height);
      pdf.save(`${drawingLabel} rev ${revLabel} - marked up.pdf`);
    } catch (err: any) {
      toast({ title: 'Could not export', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const selectedMarkup = useMemo(
    () => markups.find((m) => m.id === selected) ?? null,
    [markups, selected],
  );

  const r = rect();

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {drawingLabel}
            <span className="text-sm font-normal text-muted-foreground">rev {revLabel}</span>
            {/* The calibration state is said out loud, because it decides whether every number on
                this sheet means anything. */}
            {factor == null ? (
              <Badge variant="warning">Not to scale — measurements unavailable</Badge>
            ) : (
              <Badge variant="success">Scale set ({scale?.scale_unit})</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {isOwner && (
          <div className="flex flex-wrap items-center gap-1 border-b border-hairline pb-2">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={busy || loading || !!renderError}
                onClick={() => { setTool(t.id); setDraft([]); }}
                className={`flex items-center gap-1 rounded-sm px-2 py-1 text-xs transition-colors ${
                  tool === t.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
            <button
              type="button"
              disabled={busy || loading || !!renderError}
              onClick={() => { setTool('calibrate'); setDraft([]); }}
              className={`flex items-center gap-1 rounded-sm px-2 py-1 text-xs transition-colors ${
                tool === 'calibrate' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Ruler className="h-3.5 w-3.5" /> Set scale
            </button>
            <div className="ml-auto flex items-center gap-2">
              {/* A MIS-calibrated sheet is worse than an uncalibrated one: every measurement on it
                  is confidently wrong, and a wrong length is a valid length. Undoing it has to be
                  one press, and it takes every measurement back to "not measured" rather than to
                  some other number. */}
              {factor != null && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void clearScale()}>
                  Clear scale
                </Button>
              )}
              <Button size="sm" variant="outline" disabled={busy || loading} onClick={() => void exportPdf()}>
                <Download className="h-3.5 w-3.5 mr-1" /> Export
              </Button>
            </div>
          </div>
        )}

        {tool === 'calibrate' && !calibrating && (
          <p className="text-xs text-muted-foreground">
            Click each end of something you know the length of — a grid line, a door opening. The
            printed scale on the title block is not used: a sheet photocopied at 90% still says 1:50.
          </p>
        )}
        {tool === 'cloud' && draft.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {draft.length} point{draft.length === 1 ? '' : 's'} — double-click to close the cloud.
          </p>
        )}

        <div ref={surfaceRef} className="relative max-h-[60vh] overflow-auto rounded-sm border border-hairline">
          {loading && (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
          {renderError && (
            <div className="flex h-64 flex-col items-center justify-center gap-2 p-6 text-center">
              <p className="text-sm font-medium">This drawing could not be rendered.</p>
              <p className="text-xs text-muted-foreground">{renderError}</p>
            </div>
          )}
          <div className={`relative ${loading || renderError ? 'hidden' : ''}`}>
            <canvas
              ref={canvasRef}
              className="block w-full"
              onClick={onSurfaceClick}
              onDoubleClick={onSurfaceDoubleClick}
            />
            {/* The markup layer. Coordinates come out of the store normalised, so this renders
                correctly at whatever size the canvas happens to be. */}
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox={`0 0 ${r.width || 1} ${r.height || 1}`}
              preserveAspectRatio="none"
            >
              {markups.map((m) => (
                <MarkupShape
                  key={m.id}
                  markup={m}
                  width={r.width}
                  height={r.height}
                  selected={selected === m.id}
                  onSelect={() => setSelected(m.id)}
                />
              ))}
              {draft.length > 0 && (
                <polyline
                  points={draft.map((p) => `${p.x * r.width},${p.y * r.height}`).join(' ')}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  className="text-primary"
                />
              )}
            </svg>
          </div>
        </div>

        {calibrating && (
          <div className="flex flex-wrap items-end gap-2 rounded-sm border border-hairline bg-surface-sunken p-3">
            <div className="space-y-1">
              <Label className="text-xs">How long is that line, really?</Label>
              <Input
                className="h-8 w-32" inputMode="decimal" placeholder="10"
                value={knownLength} onChange={(e) => setKnownLength(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Unit</Label>
              <Input
                className="h-8 w-20" placeholder="m"
                value={knownUnit} onChange={(e) => setKnownUnit(e.target.value)}
              />
            </div>
            <Button size="sm" disabled={busy} onClick={() => void applyCalibration()}>Set scale</Button>
            <Button size="sm" variant="ghost" onClick={() => setCalibrating(null)}>Cancel</Button>
          </div>
        )}

        {selectedMarkup && isOwner && (
          <div className="space-y-2 rounded-sm border border-hairline bg-surface-sunken p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium capitalize">{selectedMarkup.kind}</span>
              {selectedMarkup.kind === 'measure' && (
                <span className="text-xs text-muted-foreground">
                  {/* "Not measured" rather than a zero: a zero in a takeoff is a quantity
                      somebody orders. */}
                  {selectedMarkup.measured_value == null
                    ? 'Not measured — set the scale first'
                    : `${selectedMarkup.measured_value} ${selectedMarkup.measured_unit ?? ''}`}
                </span>
              )}
              {selectedMarkup.request_id && <Badge variant="info">RFI raised</Badge>}
              <button
                type="button"
                className="ml-auto text-muted-foreground hover:text-foreground"
                onClick={() => setSelected(null)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <Input
              placeholder="What is wrong with this?"
              defaultValue={selectedMarkup.note ?? ''}
              onBlur={(e) => void drawingMarkupsService
                .setNote(selectedMarkup.id, e.target.value)
                .then(loadMarkups)
                .catch((err) => toast({
                  title: 'Could not save the note', description: err?.message, variant: 'destructive',
                }))}
            />
            <div className="flex flex-wrap gap-2">
              {!selectedMarkup.request_id && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void raiseRfi(selectedMarkup)}>
                  <MessageSquarePlus className="h-3.5 w-3.5 mr-1" /> Raise as RFI
                </Button>
              )}
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void removeMarkup(selectedMarkup.id)}>
                <Trash2 className="h-3.5 w-3.5 mr-1 text-destructive" /> Delete
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------

const MarkupShape: React.FC<{
  markup: DrawingMarkup; width: number; height: number; selected: boolean; onSelect: () => void;
}> = ({ markup, width, height, selected, onSelect }) => {
  const pts = (markup.geometry?.points ?? []).map((p) => ({ x: p.x * width, y: p.y * height }));
  if (pts.length === 0) return null;
  const stroke = selected ? 'rgb(239 68 68)' : 'rgb(234 88 12)';
  const common = {
    stroke, strokeWidth: 2, fill: 'none',
    className: 'pointer-events-auto cursor-pointer',
    onClick: onSelect,
  } as const;

  if (markup.kind === 'box' && pts.length >= 2) {
    const b = boxRect(markup.geometry.points[0], markup.geometry.points[1]);
    return <rect x={b.x * width} y={b.y * height} width={b.w * width} height={b.h * height} {...common} />;
  }
  if (markup.kind === 'arrow' && pts.length >= 2) {
    return (
      <g {...common}>
        <line x1={pts[0].x} y1={pts[0].y} x2={pts[1].x} y2={pts[1].y} stroke={stroke} strokeWidth={2} />
        <circle cx={pts[1].x} cy={pts[1].y} r={4} fill={stroke} />
      </g>
    );
  }
  if (markup.kind === 'measure' && pts.length >= 2) {
    const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    return (
      <g {...common}>
        <line x1={pts[0].x} y1={pts[0].y} x2={pts[1].x} y2={pts[1].y} stroke={stroke} strokeWidth={2} />
        <text x={mid.x} y={mid.y - 4} fill={stroke} fontSize={11} textAnchor="middle">
          {markup.measured_value == null
            ? 'not measured'
            : `${markup.measured_value} ${markup.measured_unit ?? ''}`}
        </text>
      </g>
    );
  }
  if (markup.kind === 'text') {
    return (
      <g {...common}>
        <circle cx={pts[0].x} cy={pts[0].y} r={6} fill={stroke} />
        {markup.note && (
          <text x={pts[0].x + 10} y={pts[0].y + 4} fill={stroke} fontSize={11}>{markup.note}</text>
        )}
      </g>
    );
  }
  return <polygon points={pts.map((p) => `${p.x},${p.y}`).join(' ')} {...common} />;
};

/**
 * Paint the markups onto a 2D context for export.
 *
 * Deliberately mirrors `MarkupShape` rather than sharing with it: SVG and canvas do not draw the
 * same primitives, and the alternative — an off-screen SVG serialised into an image — silently
 * loses fonts and taints the canvas in several browsers, which turns the export into a blank page
 * with no error.
 */
function paintMarkups(
  ctx: CanvasRenderingContext2D, markups: DrawingMarkup[], width: number, height: number,
): void {
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgb(234, 88, 12)';
  ctx.fillStyle = 'rgb(234, 88, 12)';
  ctx.font = '12px sans-serif';

  for (const m of markups) {
    const pts = (m.geometry?.points ?? []).map((p) => ({ x: p.x * width, y: p.y * height }));
    if (pts.length === 0) continue;

    if (m.kind === 'box' && pts.length >= 2) {
      const b = boxRect(m.geometry.points[0], m.geometry.points[1]);
      ctx.strokeRect(b.x * width, b.y * height, b.w * width, b.h * height);
    } else if (m.kind === 'text') {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, 6, 0, Math.PI * 2);
      ctx.fill();
      if (m.note) ctx.fillText(m.note, pts[0].x + 10, pts[0].y + 4);
    } else if (pts.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
      if (m.kind === 'cloud') ctx.closePath();
      ctx.stroke();
      if (m.kind === 'measure') {
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        // The export says "not measured" too. A printed sheet with a bare line on it is where an
        // unmeasured length quietly becomes whatever the reader assumes.
        ctx.fillText(
          m.measured_value == null ? 'not measured' : `${m.measured_value} ${m.measured_unit ?? ''}`,
          mid.x, mid.y - 4,
        );
      }
    }

    // The note goes on the sheet next to the markup it belongs to, not in a legend somebody has to
    // cross-reference back.
    if (m.note && m.kind !== 'text') {
      ctx.fillText(m.note, pts[0].x + 8, pts[0].y - 6);
    }
  }
  ctx.restore();
}

export default DrawingMarkupDialog;
