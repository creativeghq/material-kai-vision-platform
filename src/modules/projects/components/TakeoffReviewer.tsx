/** Review one drawing's takeoff: the sheet with every proposal on it, and a person's verdict on each (#532). */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  Loader2, MousePointer2, ScanSearch, Plus, Ruler, Pentagon, Scaling, Check, X, Trash2,
  ChevronLeft, ChevronRight, ListPlus, AlertTriangle, RefreshCw,
} from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Badge } from '@/components/core/ui/badge';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/core/ui/dialog';
import { FormField, FormGrid } from '@/components/core/ui/form-layout';
import { HubEmptyState } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { humanizeLabel } from '@/utils/humanize';
import { unitSuffix } from '@/lib/units';
import {
  takeoffService, type RevisionTakeoff, type TakeoffMeasurement,
} from '../services/takeoffService';
import { drawingMarkupsService } from '../services/drawingMarkupsService';
import { schedulesService, type ProjectSchedule, type ScheduleItem } from '../services/schedulesService';
import {
  toNormalised, calibrationFactor, boxRect, lengthInPageWidths, areaInPageWidths, type NormPoint,
} from '../lib/drawingMarkup';
import {
  groupMeasurements, confirmable, billable, roomAreaDisagreement, cellRect, type TakeoffGroup,
} from '../lib/takeoffGroups';
import { TAKEOFF_ELEMENT_TYPES, type TakeoffElementType } from '../takeoffVocabulary';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type Tool = 'select' | 'find' | 'count' | 'length' | 'area' | 'calibrate';

const TOOLS: Array<{ id: Tool; label: string; icon: React.ReactNode; hint: string }> = [
  { id: 'select', label: 'Look', icon: <MousePointer2 className="h-3.5 w-3.5" />, hint: 'Pick rows in the list to highlight them on the sheet.' },
  { id: 'find', label: 'Find all like this', icon: <ScanSearch className="h-3.5 w-3.5" />, hint: 'Drag a box tightly around ONE symbol.' },
  { id: 'count', label: 'Count', icon: <Plus className="h-3.5 w-3.5" />, hint: 'Click each item to count it.' },
  { id: 'length', label: 'Length', icon: <Ruler className="h-3.5 w-3.5" />, hint: 'Click along the run; double-click to finish.' },
  { id: 'area', label: 'Area', icon: <Pentagon className="h-3.5 w-3.5" />, hint: 'Click round the outline; double-click to close.' },
  { id: 'calibrate', label: 'Set scale', icon: <Scaling className="h-3.5 w-3.5" />, hint: 'Click both ends of a dimension you know.' },
];

const SOURCE_LABEL: Record<string, string> = {
  printed: 'Printed', detected: 'Detected', counted: 'Counted', vision: 'Seen on scan', manual: 'By hand',
};

const fmt = (v: number | null, unit: string) =>
  v == null ? null : `${v.toLocaleString(undefined, { maximumFractionDigits: unit === 'pcs' ? 0 : 2 })} ${unitSuffix(unit)}`;

const strokeFor = (m: TakeoffMeasurement) =>
  m.review_status === 'confirmed' ? 'hsl(142 60% 38%)' : m.review_status === 'rejected' ? 'hsl(0 0% 55%)' : 'hsl(35 92% 45%)';

interface Props {
  revisionId: string;
  projectId: string;
  label: string;
  canSendToBill: boolean;
  onChanged: () => void;
}

export const TakeoffReviewer: React.FC<Props> = ({ revisionId, projectId, label, canSendToBill, onChanged }) => {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const docRef = useRef<any>(null);

  const [data, setData] = useState<RevisionTakeoff | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(1);
  const [docLoaded, setDocLoaded] = useState(0);
  const [page, setPage] = useState(1);
  const [aspect, setAspect] = useState(1);
  const [rendering, setRendering] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [draft, setDraft] = useState<NormPoint[]>([]);
  const [drag, setDrag] = useState<{ a: NormPoint; b: NormPoint } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showRejected, setShowRejected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [elementType, setElementType] = useState<TakeoffElementType>('door');
  const [itemLabel, setItemLabel] = useState('');
  const [calibrating, setCalibrating] = useState<{ a: NormPoint; b: NormPoint } | null>(null);
  const [known, setKnown] = useState('');
  const [knownUnit, setKnownUnit] = useState('m');
  const [billOpen, setBillOpen] = useState(false);

  const load = useCallback(async () => {
    try { setData(await takeoffService.revision(revisionId)); }
    catch (e) { toast({ title: 'Could not load the takeoff', description: (e as Error).message, variant: 'destructive' }); }
  }, [revisionId, toast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    setFileUrl(null); setPage(1); setSelected(new Set());
    takeoffService.fileUrl(revisionId).then(setFileUrl)
      .catch((e: Error) => setRenderError(e.message));
  }, [revisionId]);

  const running = data?.revision.takeoff_status === 'running';
  useEffect(() => {
    if (!running) return undefined;
    const t = window.setInterval(() => { void load(); }, 4000);
    return () => window.clearInterval(t);
  }, [running, load]);
  const wasRunning = useRef(false);
  useEffect(() => {
    if (wasRunning.current && !running) onChanged();
    wasRunning.current = running;
  }, [running, onChanged]);

  useEffect(() => {
    if (!fileUrl) return undefined;
    let cancelled = false;
    (async () => {
      try {
        docRef.current?.destroy?.();
        docRef.current = await pdfjsLib.getDocument({ url: fileUrl }).promise;
        if (!cancelled) { setNumPages(docRef.current.numPages); setDocLoaded((n) => n + 1); }
      } catch (e) {
        if (!cancelled) setRenderError((e as Error).message || 'The drawing could not be opened.');
      }
    })();
    return () => { cancelled = true; };
  }, [fileUrl]);

  useEffect(() => {
    const doc = docRef.current;
    if (!doc || !fileUrl) return undefined;
    let cancelled = false;
    let task: any = null;
    (async () => {
      setRendering(true); setRenderError(null);
      try {
        const pg = await doc.getPage(page);
        const base = pg.getViewport({ scale: 1 });
        const width = Math.min(surfaceRef.current?.clientWidth || 900, 1800);
        const viewport = pg.getViewport({ scale: width / base.width });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('This browser cannot render the drawing.');
        task = pg.render({ canvasContext: ctx, viewport, canvas });
        await task.promise;
        if (!cancelled) setAspect(base.width / base.height);
      } catch (e: any) {
        if (!cancelled && e?.name !== 'RenderingCancelledException') setRenderError(e?.message || 'The page could not be rendered.');
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => { cancelled = true; task?.cancel?.(); };
  }, [page, docLoaded, fileUrl]);

  useEffect(() => () => { docRef.current?.destroy?.(); }, []);

  const pageInfo = data?.pages.find((p) => p.page === page) ?? null;
  const scaleM = pageInfo?.effective_scale_m ?? (data?.revision.scale_units_per_unit
    ? Number(data.revision.scale_units_per_unit) * ({ m: 1, cm: 0.01, mm: 0.001, ft: 0.3048, in: 0.0254 }[String(data.revision.scale_unit ?? 'm')] ?? 1)
    : null);
  const all = data?.measurements ?? [];
  const onPage = all.filter((m) => m.page === page && (showRejected || m.review_status !== 'rejected'));
  const groups = useMemo(() => groupMeasurements(all.filter((m) => showRejected || m.review_status !== 'rejected')), [all, showRejected]);
  const selectedRows = all.filter((m) => selected.has(m.id));
  const toBill = billable(selectedRows);

  const pointFromEvent = (e: React.MouseEvent): NormPoint => {
    const box = canvasRef.current?.getBoundingClientRect();
    if (!box) return { x: 0, y: 0 };
    return toNormalised(e.clientX - box.left, e.clientY - box.top, { width: box.width, height: box.height });
  };

  const act = async (title: string, fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await load(); onChanged(); }
    catch (e) { toast({ title, description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const labelOrType = () => itemLabel.trim() || humanizeLabel(elementType);

  const onMouseDown = (e: React.MouseEvent) => {
    if (tool !== 'find' || rendering) return;
    const p = pointFromEvent(e);
    setDrag({ a: p, b: p });
  };
  const onMouseMove = (e: React.MouseEvent) => { if (drag) setDrag({ a: drag.a, b: pointFromEvent(e) }); };
  const onMouseUp = () => {
    if (!drag) return;
    const r = boxRect(drag.a, drag.b);
    setDrag(null);
    if (r.w < 0.002 || r.h < 0.002) return;
    void act('Could not find matches', async () => {
      const res = await takeoffService.findSimilar({
        revisionId, page, bbox: [r.x, r.y, r.x + r.w, r.y + r.h], elementType, label: labelOrType(),
      });
      const why = res.reason === 'not_a_vector_page' ? 'This page is a scan, so symbols cannot be matched — count them by hand.'
        : res.reason === 'not_analysed' ? 'Analyse the drawing first.'
          : res.reason === 'no_vector_content_in_box' ? 'There were no drawn lines inside that box.' : null;
      toast({
        title: why ? 'Nothing matched' : `${res.added} new match${res.added === 1 ? '' : 'es'} to review`,
        description: why ?? `${res.matches} found on the page; ones already counted were skipped.`,
      });
    });
  };

  const onClick = (e: React.MouseEvent) => {
    if (rendering || tool === 'select' || tool === 'find') return;
    const p = pointFromEvent(e);
    if (tool === 'count') {
      const d = 0.004;
      void act('Could not add the count', () => takeoffService.addManual({
        revisionId, page, kind: 'count', elementType, label: labelOrType(),
        points: [{ x: p.x - d, y: p.y - d }, { x: p.x + d, y: p.y + d }], valueNorm: null,
      }));
      return;
    }
    if (tool === 'calibrate') {
      if (!draft.length) { setDraft([p]); return; }
      setCalibrating({ a: draft[0], b: p }); setDraft([]);
      return;
    }
    setDraft((d) => [...d, p]);
  };

  const onDoubleClick = () => {
    if ((tool !== 'length' && tool !== 'area') || draft.length < (tool === 'area' ? 3 : 2)) return;
    const points = draft;
    setDraft([]);
    if (scaleM == null) {
      toast({ title: 'Set the scale first', description: 'A length or area cannot be measured on an uncalibrated sheet.', variant: 'destructive' });
      return;
    }
    void act('Could not save the measurement', () => takeoffService.addManual({
      revisionId, page, kind: tool, elementType, label: labelOrType(), points,
      valueNorm: tool === 'length' ? lengthInPageWidths(points, aspect) : areaInPageWidths(points, aspect),
    }));
  };

  const applyCalibration = () => {
    if (!calibrating) return;
    const f = calibrationFactor(calibrating.a, calibrating.b, Number(known.replace(',', '.')), aspect);
    if (f == null) {
      toast({ title: 'That calibration is not usable', description: 'Give the real length of the line you clicked.', variant: 'destructive' });
      return;
    }
    void act('Could not set the scale', async () => {
      await drawingMarkupsService.setScale(revisionId, f, knownUnit);
      setCalibrating(null); setKnown('');
    });
  };

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const confirmGroup = (g: TakeoffGroup<TakeoffMeasurement>) => {
    const ok = confirmable(g.rows);
    const skipped = g.rows.filter((m) => m.review_status === 'proposed').length - ok.length;
    void act('Could not confirm', async () => {
      await takeoffService.setStatus(ok.map((m) => m.id), 'confirmed');
      if (skipped > 0) toast({ title: `${skipped} left unconfirmed`, description: 'They are measured lengths or areas and the sheet has no scale yet.' });
    });
  };

  if (!data) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const rev = data.revision;
  const changed = pageInfo?.changed_cells;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card className="min-w-0">
        <CardHeader className="flex flex-row flex-wrap items-center gap-2 space-y-0 border-b border-hairline px-4 py-2">
          <CardTitle className="mr-auto text-sm font-medium">{label} · Rev {rev.rev_label}</CardTitle>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-xs tabular-nums text-muted-foreground">Page {page} of {numPages}</span>
            <Button size="sm" variant="ghost" disabled={page >= numPages} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </CardHeader>
        <div className="flex flex-wrap items-center gap-1 border-b border-hairline bg-surface-sunken px-4 py-2">
          {TOOLS.map((t) => (
            <Button key={t.id} size="sm" variant={tool === t.id ? 'secondary' : 'ghost'} title={t.hint}
              onClick={() => { setTool(t.id); setDraft([]); }}>
              {t.icon} {t.label}
            </Button>
          ))}
          {(tool === 'find' || tool === 'count' || tool === 'length' || tool === 'area') && (
            <div className="flex items-center gap-2 pl-2">
              <Select value={elementType} onValueChange={(v) => setElementType(v as TakeoffElementType)}>
                <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TAKEOFF_ELEMENT_TYPES.map((t) => <SelectItem key={t} value={t}>{humanizeLabel(t)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input value={itemLabel} onChange={(e) => setItemLabel(e.target.value)} placeholder="Label, e.g. Door 90" className="h-8 w-40" />
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 text-xs text-muted-foreground">
          {pageInfo ? (
            <>
              <Badge variant={pageInfo.kind === 'vector' ? 'info' : pageInfo.kind === 'scan' ? 'warning' : 'neutral'}>
                {pageInfo.kind === 'vector' ? 'CAD-exported' : pageInfo.kind === 'scan' ? 'Scanned' : 'Empty'}
              </Badge>
              {rev.scale_units_per_unit
                ? <span>Scale set by hand for this file</span>
                : pageInfo.scale_text
                  ? <span>Printed scale {pageInfo.scale_text}{pageInfo.scale_plausible ? '' : ' (implausible — set it by hand)'}</span>
                  : <span className="text-amber-800 dark:text-amber-300">No scale — lengths and areas need one</span>}
              {pageInfo.kind === 'scan' && <span>Scans give counts only, never lengths.</span>}
              {changed && <span className="text-amber-800 dark:text-amber-300">Shaded areas changed since the previous revision</span>}
            </>
          ) : (
            <span>{running ? 'Analysing…' : 'This page has not been analysed.'}</span>
          )}
        </div>
        {(pageInfo?.notes?.length ?? 0) > 0 && (
          <ul className="px-4 pb-2 text-xs text-muted-foreground">
            {pageInfo!.notes.map((n, i) => <li key={i}>· {n}</li>)}
          </ul>
        )}
        <CardContent className="p-0">
          <div ref={surfaceRef} className="relative w-full overflow-auto">
            {renderError ? (
              <p className="p-6 text-sm text-destructive">{renderError}</p>
            ) : (
              <div className="relative inline-block select-none">
                <canvas
                  ref={canvasRef}
                  className="block max-w-full"
                  style={{ cursor: tool === 'select' ? 'default' : 'crosshair' }}
                  onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
                  onClick={onClick} onDoubleClick={onDoubleClick}
                />
                {!rendering && (
                  <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none">
                    {Array.isArray(changed) && changed.map((i) => {
                      const r = cellRect(i);
                      return <rect key={`c${i}`} x={r.x} y={r.y} width={r.w} height={r.h} fill="hsl(0 80% 50% / 0.08)" />;
                    })}
                    {onPage.map((m) => {
                      const stroke = strokeFor(m);
                      const sel = selected.has(m.id);
                      const common = {
                        stroke, fill: 'none', strokeWidth: sel ? 3 : 1.5, vectorEffect: 'non-scaling-stroke' as const,
                        strokeDasharray: m.review_status === 'proposed' ? '4 3' : undefined,
                      };
                      if (m.geometry?.segments?.length) {
                        return (
                          <g key={m.id} {...common}>
                            {m.geometry.segments.map((s, i) => <line key={i} x1={s[0].x} y1={s[0].y} x2={s[1].x} y2={s[1].y} vectorEffect="non-scaling-stroke" />)}
                          </g>
                        );
                      }
                      const pts = m.geometry?.points ?? [];
                      if (m.kind === 'length' && pts.length >= 2) {
                        return <polyline key={m.id} points={pts.map((p) => `${p.x},${p.y}`).join(' ')} {...common} />;
                      }
                      if (pts.length >= 3) return <polygon key={m.id} points={pts.map((p) => `${p.x},${p.y}`).join(' ')} {...common} />;
                      if (m.bbox) {
                        const [x0, y0, x1, y1] = m.bbox;
                        return <rect key={m.id} x={x0} y={y0} width={x1 - x0} height={y1 - y0} {...common} />;
                      }
                      return null;
                    })}
                    {draft.length > 0 && (
                      <polyline points={draft.map((p) => `${p.x},${p.y}`).join(' ')} stroke="hsl(210 90% 50%)" fill="none" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                    )}
                    {drag && (() => {
                      const r = boxRect(drag.a, drag.b);
                      return <rect x={r.x} y={r.y} width={r.w} height={r.h} stroke="hsl(210 90% 50%)" fill="hsl(210 90% 50% / 0.08)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />;
                    })()}
                  </svg>
                )}
                {rendering && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-0 self-start">
        <CardHeader className="space-y-1 border-b border-hairline px-4 py-3">
          <div className="flex items-center gap-2">
            <CardTitle className="mr-auto text-sm font-medium">Quantities</CardTitle>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Checkbox checked={showRejected} onCheckedChange={(v) => setShowRejected(v === true)} /> Show rejected
            </label>
          </div>
          {rev.takeoff_status === 'failed' && <p className="text-xs text-destructive">{rev.takeoff_error}</p>}
          {rev.takeoff_status === 'done' && rev.takeoff_error && <p className="text-xs text-amber-800 dark:text-amber-300">{rev.takeoff_error}</p>}
          {canSendToBill && (
            <Button size="sm" disabled={busy || toBill.length === 0} onClick={() => setBillOpen(true)}
              title={toBill.length === 0 ? 'Tick confirmed rows that are not on the bill yet' : undefined}>
              <ListPlus className="h-3.5 w-3.5" /> Send {toBill.length || ''} to bill
            </Button>
          )}
        </CardHeader>
        <CardContent className="max-h-[70vh] overflow-y-auto p-0">
          {running && all.length === 0 ? (
            <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Reading the drawing…
            </div>
          ) : groups.length === 0 ? (
            <HubEmptyState
              icon={ScanSearch}
              title="Nothing proposed yet"
              description="Analyse the drawing, or use Find all like this, Count, Length and Area on the sheet."
            />
          ) : (
            <div className="divide-y divide-hairline">
              {groups.map((g) => (
                <div key={g.key} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{humanizeLabel(g.element_type)}</span>
                    <span className="text-xs text-muted-foreground">{unitSuffix(g.unit)}</span>
                    <span className="ml-auto text-xs tabular-nums">
                      {g.confirmedTotal != null
                        ? <>{fmt(g.confirmedTotal, g.unit)} confirmed</>
                        : g.confirmed > 0 ? <span className="text-amber-800 dark:text-amber-300">total needs scale</span> : null}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{g.proposed} proposed · {g.confirmed} confirmed{g.rejected ? ` · ${g.rejected} rejected` : ''}</span>
                    {g.needsScale > 0 && <span className="text-amber-800 dark:text-amber-300">{g.needsScale} need a scale</span>}
                    {g.proposed > 0 && (
                      <span className="ml-auto flex gap-1">
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => confirmGroup(g)}><Check className="h-3.5 w-3.5" /> All</Button>
                        <Button size="sm" variant="ghost" disabled={busy}
                          onClick={() => void act('Could not reject', () => takeoffService.setStatus(g.rows.filter((m) => m.review_status === 'proposed').map((m) => m.id), 'rejected'))}>
                          <X className="h-3.5 w-3.5" /> All
                        </Button>
                      </span>
                    )}
                  </div>
                  <ul className="mt-2 space-y-1.5">
                    {g.rows.map((m) => {
                      const outline = roomAreaDisagreement(m, pageScaleFor(data, m.page));
                      return (
                        <li key={m.id} className={`flex items-start gap-2 rounded-sm px-1 py-1 text-xs ${selected.has(m.id) ? 'bg-surface-sunken' : ''}`}>
                          <Checkbox checked={selected.has(m.id)} onCheckedChange={() => toggle(m.id)} aria-label={`Select ${m.label}`} />
                          <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setPage(m.page); toggle(m.id); }}>
                            <span className="block truncate">{m.label}</span>
                            <span className="flex flex-wrap gap-1.5 text-muted-foreground">
                              <span>p.{m.page}</span>
                              <span>{SOURCE_LABEL[m.source] ?? m.source}</span>
                              {m.confidence != null && <span>{Math.round(m.confidence * 100)}%</span>}
                              {m.schedule_item_id && <span className="text-primary">on bill</span>}
                              {m.needs_remeasure && <span className="text-amber-800 dark:text-amber-300">changed in a newer revision</span>}
                            </span>
                            {m.source_ref && <span className="block truncate text-muted-foreground" title={m.source_ref}>{m.source_ref}</span>}
                            {outline != null && (
                              <span className="flex items-center gap-1 text-amber-800 dark:text-amber-300">
                                <AlertTriangle className="h-3 w-3" /> Outline measures {outline} m², printed {m.value} m²
                              </span>
                            )}
                          </button>
                          <span className="shrink-0 text-right tabular-nums">
                            {fmt(m.effective_value, m.unit) ?? <span className="text-amber-800 dark:text-amber-300">needs scale</span>}
                          </span>
                          <span className="flex shrink-0 gap-0.5">
                            {m.review_status !== 'confirmed' && (
                              <button type="button" title="Confirm" disabled={busy} className="text-muted-foreground hover:text-primary"
                                onClick={() => void act('Could not confirm', () => takeoffService.setStatus([m.id], 'confirmed'))}>
                                <Check className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {m.review_status !== 'rejected' && !m.schedule_item_id && (
                              <button type="button" title="Reject" disabled={busy} className="text-muted-foreground hover:text-destructive"
                                onClick={() => void act('Could not reject', () => takeoffService.setStatus([m.id], 'rejected'))}>
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {m.needs_remeasure && (
                              <button type="button" title="Checked against the new revision" disabled={busy} className="text-muted-foreground hover:text-primary"
                                onClick={() => void act('Could not clear', () => takeoffService.clearRemeasure([m.id]))}>
                                <RefreshCw className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {(m.source === 'manual' || m.source === 'counted') && !m.schedule_item_id && (
                              <button type="button" title="Delete" disabled={busy} className="text-muted-foreground hover:text-destructive"
                                onClick={() => void act('Could not delete', () => takeoffService.remove(m.id))}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!calibrating} onOpenChange={(o) => { if (!o) setCalibrating(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Set the scale</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            How long is the line you clicked, in reality? The scale applies to every page of this file and
            re-derives every measured length and area on it, including bill lines.
          </p>
          <FormGrid>
            <FormField label="Real length">
              <Input value={known} onChange={(e) => setKnown(e.target.value)} inputMode="decimal" autoFocus />
            </FormField>
            <FormField label="Unit">
              <Select value={knownUnit} onValueChange={setKnownUnit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{['m', 'cm', 'mm'].map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </FormField>
          </FormGrid>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCalibrating(null)}>Cancel</Button>
            <Button onClick={applyCalibration} disabled={busy || !known.trim()}>Set scale</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {billOpen && (
        <SendToBillDialog
          projectId={projectId}
          rows={toBill}
          onClose={() => setBillOpen(false)}
          onSent={() => { setBillOpen(false); setSelected(new Set()); void load(); onChanged(); }}
        />
      )}
    </div>
  );
};

function pageScaleFor(data: RevisionTakeoff, page: number): number | null {
  return data.pages.find((p) => p.page === page)?.effective_scale_m ?? null;
}

const SendToBillDialog: React.FC<{
  projectId: string;
  rows: TakeoffMeasurement[];
  onClose: () => void;
  onSent: () => void;
}> = ({ projectId, rows, onClose, onSent }) => {
  const { toast } = useToast();
  const { activeWorkspaceId } = useWorkspace();
  const [schedules, setSchedules] = useState<ProjectSchedule[] | null>(null);
  const [scheduleId, setScheduleId] = useState<string>('');
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [target, setTarget] = useState<string>('new');
  const [description, setDescription] = useState(rows.length === 1 ? rows[0].label : humanizeLabel(rows[0]?.element_type ?? 'item'));
  const [itemRef, setItemRef] = useState('');
  const [busy, setBusy] = useState(false);
  const units = [...new Set(rows.map((r) => r.unit))];

  useEffect(() => {
    schedulesService.list(projectId).then((s) => { setSchedules(s); setScheduleId(s[0]?.id ?? ''); })
      .catch((e: Error) => toast({ title: 'Could not load schedules', description: e.message, variant: 'destructive' }));
  }, [projectId, toast]);
  useEffect(() => {
    if (!scheduleId) { setItems([]); return; }
    schedulesService.items(scheduleId).then(setItems).catch(() => setItems([]));
  }, [scheduleId]);

  const takeoffLines = items.filter((i) => i.quantity_source === 'takeoff' && i.unit === units[0]);

  const send = async () => {
    setBusy(true);
    try {
      let sid = scheduleId;
      if (!sid) {
        if (!activeWorkspaceId) throw new Error('No active workspace.');
        sid = (await schedulesService.createSchedule({ workspace_id: activeWorkspaceId, project_id: projectId, name: 'Takeoff BoQ', is_contract: true })).id;
      }
      await takeoffService.sendToBill({
        scheduleId: sid, measurementIds: rows.map((r) => r.id),
        description: target === 'new' ? description : null, itemRef: target === 'new' ? itemRef : null,
        existingItemId: target === 'new' ? null : target,
      });
      toast({ title: 'Sent to the bill', description: 'The line quantity is the sum of these confirmed measurements.' });
      onSent();
    } catch (e) {
      toast({ title: 'Could not send to the bill', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Send {rows.length} measurement{rows.length === 1 ? '' : 's'} to the bill</DialogTitle></DialogHeader>
        {units.length > 1 ? (
          <p className="text-sm text-destructive">A bill line has one unit and these are in {units.map(unitSuffix).join(', ')}. Send each unit separately.</p>
        ) : (
          <FormGrid>
            <FormField label="Schedule">
              {schedules && schedules.length === 0 ? (
                <p className="text-sm text-muted-foreground">A schedule called "Takeoff BoQ" will be created.</p>
              ) : (
                <Select value={scheduleId} onValueChange={(v) => { setScheduleId(v); setTarget('new'); }}>
                  <SelectTrigger><SelectValue placeholder="Choose a schedule" /></SelectTrigger>
                  <SelectContent>{(schedules ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </FormField>
            <FormField label="Line">
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New line</SelectItem>
                  {takeoffLines.map((i) => <SelectItem key={i.id} value={i.id}>Add to: {[i.item_ref, i.description].filter(Boolean).join(' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            {target === 'new' && (
              <>
                <FormField label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} /></FormField>
                <FormField label="Ref (optional)"><Input value={itemRef} onChange={(e) => setItemRef(e.target.value)} /></FormField>
              </>
            )}
          </FormGrid>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || units.length !== 1 || (target === 'new' && !description.trim())} onClick={() => void send()}>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TakeoffReviewer;
