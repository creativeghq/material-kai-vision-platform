import React, { useEffect, useRef, useState } from 'react';
import { Trash2, Save, Lightbulb, X, Package, Spline } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { AnnotationLayer } from './AnnotationLayer';
import { moodboardSheetsService } from '@/services/moodboardSheetsService';
import { supabase } from '@/integrations/supabase/client';
import {
  newRunId,
  runLengthMm,
  totalRunLengthMm,
  pruneOrphanRuns,
  LIGHTING_RUN_DEFS,
  type FixtureRun,
  type RunDef,
} from '@/utils/fixtureRuns';
import { LivePreviewPanel } from './LivePreviewPanel';

// Re-exported so consumers keep importing run types and palettes from the canvas
// they belong to; the maths itself lives in @/utils/fixtureRuns so it can be
// unit-tested without dragging in the Supabase client.
export {
  ELECTRICAL_RUN_DEFS,
  PLUMBING_RUN_DEFS,
  LIGHTING_RUN_DEFS,
  newRunId,
  runLengthMm,
  totalRunLengthMm,
  pruneOrphanRuns,
} from '@/utils/fixtureRuns';
export type { FixtureRun, RunDef } from '@/utils/fixtureRuns';

/**
 * Symbol-plan canvas — drives lighting_plan, plumbing_plan and electrical_plan.
 *
 * Backdrop is either an uploaded floor plan image OR a plain rectangle drawn
 * from user-typed room dimensions. The user picks a symbol type from the
 * palette, then clicks anywhere on the backdrop to place it. All symbols are
 * stored as normalized [0..1] coords so the PDF builder can re-place them on
 * any canvas size. The symbol palette is injected via `fixtureDefs` so the
 * same widget renders lighting fixtures or plumbing fixtures — the glyph set
 * mirrors the PDF builder's drawFixtureSymbol / drawPlumbingSymbol.
 */

export interface FixtureDef {
  type: string;
  label: string;
  glyph: string;
}

export const LIGHTING_FIXTURE_DEFS: FixtureDef[] = [
  { type: 'recessed', label: 'Recessed', glyph: '⊕' },
  { type: 'pendant',  label: 'Pendant',  glyph: '●' },
  { type: 'wall',     label: 'Wall',     glyph: '◐' },
  { type: 'spot',     label: 'Spot',     glyph: '◇' },
  { type: 'led_strip', label: 'LED Strip', glyph: '▬' },
  { type: 'floor',    label: 'Floor',    glyph: '○' },
  { type: 'table',    label: 'Table',    glyph: '○' },
];

export const PLUMBING_FIXTURE_DEFS: FixtureDef[] = [
  { type: 'wc',           label: 'WC',          glyph: '🚽' },
  { type: 'basin',        label: 'Basin',       glyph: '◎' },
  { type: 'bath',         label: 'Bath',        glyph: '▭' },
  { type: 'shower',       label: 'Shower',      glyph: '▣' },
  { type: 'floor_drain',  label: 'Floor Drain', glyph: '⊞' },
  { type: 'water_supply', label: 'Supply',      glyph: '●' },
  { type: 'waste',        label: 'Waste',       glyph: 'W' },
  { type: 'water_heater', label: 'Water Heater', glyph: 'H' },
  { type: 'mixer',        label: 'Tap / Mixer', glyph: '◉' },
];

// Electrical symbols follow IEC 60617 conventions closely enough to read as a
// real installation plan: a socket is a semicircle on a baseline, a switch is a
// dot with a lever, earth is the three-bar stem. Types must stay in sync with
// drawElectricalSymbol in the PDF builder.
export const ELECTRICAL_FIXTURE_DEFS: FixtureDef[] = [
  { type: 'socket',             label: 'Socket',        glyph: '◗' },
  { type: 'socket_double',      label: 'Double Socket', glyph: '◖◗' },
  { type: 'switch_1way',        label: 'Switch',        glyph: '⌁' },
  { type: 'switch_2way',        label: '2-Way Switch',  glyph: '⌥' },
  { type: 'dimmer',             label: 'Dimmer',        glyph: '◑' },
  { type: 'distribution_board', label: 'Board (DB)',    glyph: '▤' },
  { type: 'data_outlet',        label: 'Data / RJ45',   glyph: '⊟' },
  { type: 'tv_outlet',          label: 'TV / SAT',      glyph: '⊡' },
  { type: 'dedicated_point',    label: 'Dedicated',     glyph: '⊗' },
  { type: 'junction_box',       label: 'Junction Box',  glyph: '⊞' },
  { type: 'earth_point',        label: 'Earth',         glyph: '⏚' },
];

export interface FixtureSymbol {
  /**
   * Stable identity. Symbols used to be addressed by array index, which breaks
   * the moment one is deleted — and a run/circuit in Phase 3 has to reference
   * WHICH symbols it connects. Legacy sheets have no id; ensureSymbolIds()
   * assigns one on load so old plans keep working.
   */
  id?: string;
  type: string;
  x: number;
  y: number;
  label?: string;
  /**
   * Linked catalog product. This is what turns a plan into a bill of materials:
   * the symbol stops being an anonymous glyph and becomes a real product with a
   * price, a supplier and a lead time.
   */
  product_id?: string;
}

let symbolSeq = 0;
/** Collision-resistant enough for ids that only need to be unique within one sheet. */
export function newSymbolId(): string {
  symbolSeq += 1;
  return `s${Date.now().toString(36)}${symbolSeq.toString(36)}`;
}

/** Backfill ids for symbols saved before they had one. */
export function ensureSymbolIds(symbols: FixtureSymbol[]): FixtureSymbol[] {
  return symbols.map((s) => (s.id ? s : { ...s, id: newSymbolId() }));
}

export interface LegendEntry {
  symbol_type: string;
  label: string;
}

interface FixtureSymbolCanvasProps {
  sheetId: string;
  backdrop: { kind: 'upload' | 'rect'; image_url?: string; width_mm?: number; height_mm?: number };
  initialSymbols?: FixtureSymbol[];
  initialLegend?: LegendEntry[];
  initialRuns?: FixtureRun[];
  /** Symbol palette. Defaults to lighting; pass PLUMBING_/ELECTRICAL_FIXTURE_DEFS for those plans. */
  fixtureDefs?: FixtureDef[];
  /** Run palette. Defaults to lighting circuits. */
  runDefs?: RunDef[];
  /** Palette header icon. Defaults to a lightbulb. */
  paletteIcon?: React.ComponentType<{ className?: string }>;
  onPdfReady?: (pdfUrl: string) => void;
}

export function FixtureSymbolCanvas({
  sheetId,
  backdrop,
  initialSymbols = [],
  initialLegend = [],
  initialRuns = [],
  fixtureDefs = LIGHTING_FIXTURE_DEFS,
  runDefs = LIGHTING_RUN_DEFS,
  paletteIcon: PaletteIcon = Lightbulb,
  onPdfReady,
}: FixtureSymbolCanvasProps) {
  const FIXTURE_DEFS = fixtureDefs;
  const [symbols, setSymbols] = useState<FixtureSymbol[]>(() => ensureSymbolIds(initialSymbols));
  const [legend, setLegend] = useState<LegendEntry[]>(initialLegend);
  const [runs, setRuns] = useState<FixtureRun[]>(initialRuns);
  const [activeType, setActiveType] = useState<string>(fixtureDefs[0]?.type ?? 'recessed');
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Click means "drop a symbol" in place mode, "pick one" in select mode, and
  // "join two" in connect mode — it cannot mean all three, so the mode is
  // explicit rather than inferred from what happens to be under the cursor.
  const [mode, setMode] = useState<'place' | 'select' | 'connect'>('place');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeRunKind, setActiveRunKind] = useState<string>(runDefs[0]?.kind ?? 'lighting_circuit');
  /** The run being drawn: its origin symbol plus any corners dropped so far. */
  const [pending, setPending] = useState<{ from: string; vertices: Array<{ x: number; y: number }> } | null>(null);

  // Escape abandons a half-drawn run. Without it the only way out is to finish
  // a connection the user no longer wants.
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPending(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending]);

  const selected = symbols.find((s) => s.id === selectedId) ?? null;

  const patchSelected = (patch: Partial<FixtureSymbol>) => {
    setSymbols((arr) => arr.map((s) => (s.id === selectedId ? { ...s, ...patch } : s)));
  };

  const handlePointerDown = (p: { x: number; y: number }) => {
    if (draggingIdx !== null) return;
    // In select mode a click on empty canvas clears the selection rather than
    // silently adding a symbol the user did not ask for.
    if (mode === 'select') { setSelectedId(null); return; }
    // In connect mode an empty-canvas click drops a corner on the run in
    // progress, so a cable can follow a wall instead of cutting through it.
    if (mode === 'connect') {
      if (pending) setPending({ ...pending, vertices: [...pending.vertices, p] });
      return;
    }
    setSymbols((arr) => [...arr, { id: newSymbolId(), type: activeType, x: p.x, y: p.y }]);
    // Auto-add legend entry for new types
    if (!legend.find((l) => l.symbol_type === activeType)) {
      const def = FIXTURE_DEFS.find((d) => d.type === activeType);
      setLegend((arr) => [...arr, { symbol_type: activeType, label: def?.label || activeType }]);
    }
  };

  const handleSymbolMove = (p: { x: number; y: number }) => {
    if (draggingIdx === null) return;
    setSymbols((arr) => arr.map((s, i) => (i === draggingIdx ? { ...s, x: p.x, y: p.y } : s)));
  };

  const handleSymbolPointerDown = (idx: number) => (e: React.PointerEvent) => {
    e.stopPropagation();
    const sym = symbols[idx];
    if (mode === 'connect') {
      if (!sym?.id) return;
      if (!pending) { setPending({ from: sym.id, vertices: [] }); return; }
      // A run from a symbol to itself is meaningless; treat the second click as
      // cancelling rather than creating a zero-length circuit.
      if (pending.from === sym.id) { setPending(null); return; }
      setRuns((arr) => [...arr, {
        id: newRunId(),
        kind: activeRunKind,
        from: pending.from,
        to: sym.id!,
        ...(pending.vertices.length ? { vertices: pending.vertices } : {}),
      }]);
      setPending(null);
      return;
    }
    setSelectedId(sym?.id ?? null);
    if (mode === 'select') return; // select-mode clicks pick, they don't drag
    setDraggingIdx(idx);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerUp = () => {
    setDraggingIdx(null);
  };

  const removeSymbol = (idx: number) => {
    setSymbols((arr) => {
      if (arr[idx]?.id === selectedId) setSelectedId(null);
      const next = arr.filter((_, i) => i !== idx);
      // Deleting an endpoint orphans its runs. Drop them here rather than let a
      // circuit dangle to a symbol that no longer exists — the PDF would skip it
      // silently and the plan would quietly lose a connection.
      setRuns((rs) => pruneOrphanRuns(rs, next));
      return next;
    });
  };

  const removeRun = (id: string) => setRuns((arr) => arr.filter((r) => r.id !== id));

  const updateLegendLabel = (idx: number, label: string) => {
    setLegend((arr) => arr.map((l, i) => (i === idx ? { ...l, label } : l)));
  };

  const removeLegendEntry = (idx: number) => {
    setLegend((arr) => arr.filter((_, i) => i !== idx));
  };

  // Null (not 0) when the backdrop has no scale, so the UI can say "unknown"
  // instead of reporting a total that would read as "no cable needed".
  const totalRunM = React.useMemo(() => {
    const mm = totalRunLengthMm(runs, symbols, backdrop);
    return mm === null ? null : mm / 1000;
  }, [runs, symbols, backdrop]);

  const backdropUrl = backdrop.kind === 'upload' ? backdrop.image_url : undefined;
  const ratio = backdrop.width_mm && backdrop.height_mm
    ? `${backdrop.width_mm}/${backdrop.height_mm}`
    : '4/3';

  const handleRender = async () => {
    setRendering(true);
    setError(null);
    try {
      await moodboardSheetsService.update(sheetId, {
        data: { backdrop, symbols, legend, runs },
      });
      const result = await moodboardSheetsService.generatePdf(sheetId);
      onPdfReady?.(result.pdf_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Render failed');
    } finally {
      setRendering(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Mode: click places, or click selects. Never both. */}
      <div className="flex items-center gap-1 text-xs">
        <div className="flex rounded-full border border-white/15 overflow-hidden">
          {(['place', 'select', 'connect'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setPending(null); if (m !== 'select') setSelectedId(null); }}
              className={`px-3 py-1 capitalize ${mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
            >
              {m}
            </button>
          ))}
        </div>
        <span className="text-muted-foreground ml-1">
          {mode === 'place' ? 'Click the plan to drop a symbol; drag to move.'
            : mode === 'select' ? 'Click a symbol to link a product.'
            : pending ? 'Click empty space to add a corner, or another symbol to finish. Esc cancels.'
            : 'Click the first symbol of the run.'}
        </span>
      </div>

      {/* Run palette — only meaningful while connecting */}
      {mode === 'connect' && (
        <div className="flex items-center gap-1 flex-wrap text-xs">
          <Spline className="h-3.5 w-3.5 mr-1" />
          {runDefs.map((def) => (
            <button
              key={def.kind}
              onClick={() => setActiveRunKind(def.kind)}
              className={`px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${
                activeRunKind === def.kind ? 'border-primary text-foreground' : 'border-white/15 text-muted-foreground'
              }`}
            >
              <span className="w-3 h-0.5 rounded" style={{ backgroundColor: def.color }} />
              <span>{def.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Fixture palette */}
      <div className={`flex items-center gap-1 flex-wrap text-xs ${mode !== 'place' ? 'opacity-40 pointer-events-none' : ''}`}>
        <PaletteIcon className="h-3.5 w-3.5 mr-1" />
        {FIXTURE_DEFS.map((def) => (
          <button
            key={def.type}
            onClick={() => setActiveType(def.type)}
            className={`px-2.5 py-1 rounded-full border flex items-center gap-1 ${
              activeType === def.type
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-white/15 text-muted-foreground'
            }`}
          >
            <span className="font-mono">{def.glyph}</span>
            <span>{def.label}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Canvas */}
        <div className="lg:col-span-2">
          {backdropUrl ? (
            <AnnotationLayer
              imageUrl={backdropUrl}
              aspectRatio={ratio}
              onPointerDownPoint={handlePointerDown}
              onPointerMovePoint={handleSymbolMove}
              onPointerUpPoint={handlePointerUp}
            >
              <RunLayer runs={runs} symbols={symbols} defs={runDefs} pending={pending} />
              {symbols.map((s, idx) => (
                <SymbolDot
                  key={s.id ?? idx}
                  symbol={s}
                  defs={FIXTURE_DEFS}
                  selected={s.id === selectedId}
                  onPointerDown={handleSymbolPointerDown(idx)}
                />
              ))}
            </AnnotationLayer>
          ) : (
            // Plain-rectangle backdrop for typed room dimensions
            <div
              className="relative w-full bg-white/5 border border-white/15 rounded-lg select-none touch-none"
              style={{ aspectRatio: ratio }}
              onPointerDown={(e) => {
                if (draggingIdx !== null) return;
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const x = (e.clientX - rect.left) / rect.width;
                const y = (e.clientY - rect.top) / rect.height;
                handlePointerDown({ x, y });
              }}
              onPointerMove={(e) => {
                if (draggingIdx === null) return;
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
                handleSymbolMove({ x, y });
              }}
              onPointerUp={handlePointerUp}
            >
              <div className="absolute inset-2 border-2 border-foreground/40 rounded-sm" />
              {backdrop.width_mm && backdrop.height_mm && (
                <div className="absolute bottom-1 right-2 text-[10px] text-muted-foreground">
                  {backdrop.width_mm} × {backdrop.height_mm} mm
                </div>
              )}
              <RunLayer runs={runs} symbols={symbols} defs={runDefs} pending={pending} />
              {symbols.map((s, idx) => (
                <SymbolDot
                  key={s.id ?? idx}
                  symbol={s}
                  defs={FIXTURE_DEFS}
                  selected={s.id === selectedId}
                  onPointerDown={handleSymbolPointerDown(idx)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Legend + symbol list */}
        <div className="space-y-3 max-h-[460px] overflow-y-auto">
          {selected && (
            <SymbolProperties
              symbol={selected}
              def={FIXTURE_DEFS.find((d) => d.type === selected.type)}
              onChange={patchSelected}
              onClose={() => setSelectedId(null)}
            />
          )}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Legend</div>
            {legend.length === 0 && (
              <div className="text-xs text-muted-foreground p-2 border border-dashed rounded">
                Place symbols to populate the legend.
              </div>
            )}
            {legend.map((l, idx) => (
              <div key={idx} className="flex items-center gap-2 mb-1">
                <span className="font-mono text-xs w-6 text-center">
                  {FIXTURE_DEFS.find((d) => d.type === l.symbol_type)?.glyph || '•'}
                </span>
                <Input
                  value={l.label}
                  onChange={(e) => updateLegendLabel(idx, e.target.value)}
                  className="h-7 text-xs"
                />
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeLegendEntry(idx)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
          {runs.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Runs ({runs.length})</div>
              {runs.map((r) => {
                const def = runDefs.find((d) => d.kind === r.kind);
                const mm = runLengthMm(r, symbols, backdrop);
                return (
                  <div key={r.id} className="flex items-center gap-2 text-xs p-1.5 rounded border border-white/10 mb-1">
                    <span className="w-3 h-0.5 rounded shrink-0" style={{ backgroundColor: def?.color ?? '#94a3b8' }} />
                    <span className="truncate">{def?.label ?? r.kind}</span>
                    {/* Length only where the backdrop actually carries a scale. An
                        uploaded image has none, and a guessed metre figure would be
                        a confident wrong number in front of someone buying cable. */}
                    <span className="text-muted-foreground ml-auto shrink-0">
                      {mm !== null ? `${(mm / 1000).toFixed(2)} m` : '—'}
                    </span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => removeRun(r.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
              {totalRunM !== null ? (
                <div className="text-[11px] text-muted-foreground px-1 pt-0.5">
                  Total {totalRunM.toFixed(2)} m
                </div>
              ) : (
                <div className="text-[11px] text-muted-foreground px-1 pt-0.5">
                  Lengths need a scale — use room dimensions rather than an uploaded plan.
                </div>
              )}
            </div>
          )}

          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Placed symbols ({symbols.length})</div>
            {symbols.map((s, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs p-1.5 rounded border border-white/10 mb-1">
                <span className="font-mono w-5 text-center">
                  {FIXTURE_DEFS.find((d) => d.type === s.type)?.glyph || '•'}
                </span>
                <span className="text-muted-foreground">
                  {(s.x * 100).toFixed(0)}, {(s.y * 100).toFixed(0)}
                </span>
                <Button variant="ghost" size="icon" className="ml-auto h-6 w-6" onClick={() => removeSymbol(idx)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <LivePreviewPanel
        sheetId={sheetId}
        data={{ backdrop, symbols, legend, runs }}
        enabled={
          backdrop.kind === 'upload' ? !!backdrop.image_url : !!backdrop.width_mm && !!backdrop.height_mm
        }
        hasMinContent={symbols.length > 0}
      />

      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          variant="default"
          className="gap-2 ml-auto"
          onClick={handleRender}
          disabled={rendering}
        >
          <Save className="h-4 w-4" />
          {rendering ? 'Rendering…' : 'Render PDF'}
        </Button>
      </div>

      {error && (
        <div className="text-xs text-red-400 p-2 rounded border border-red-500/30 bg-red-500/10">
          {error}
        </div>
      )}
    </div>
  );
}

/**
 * Runs drawn beneath the symbols, in a 0..100 viewBox so the same normalized
 * coordinates the data uses map straight onto the SVG. `vectorEffect` keeps the
 * stroke a constant width regardless of how the box is stretched — without it a
 * non-square backdrop renders visibly thicker lines on one axis.
 */
function RunLayer({ runs, symbols, defs, pending }: {
  runs: FixtureRun[];
  symbols: FixtureSymbol[];
  defs: RunDef[];
  pending: { from: string; vertices: Array<{ x: number; y: number }> } | null;
}) {
  const at = (id: string) => symbols.find((s) => s.id === id);
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      {runs.map((r) => {
        const a = at(r.from);
        const b = at(r.to);
        if (!a || !b) return null; // orphan; pruneOrphanRuns clears these on edit
        const def = defs.find((d) => d.kind === r.kind);
        const pts = [a, ...(r.vertices ?? []), b]
          .map((p) => `${p.x * 100},${p.y * 100}`)
          .join(' ');
        return (
          <polyline
            key={r.id}
            points={pts}
            fill="none"
            stroke={def?.color ?? '#94a3b8'}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            {...(def?.dash ? { strokeDasharray: def.dash.join(' ') } : {})}
          />
        );
      })}
      {/* The run in progress, so the user can see what they are drawing. */}
      {pending && (() => {
        const a = at(pending.from);
        if (!a) return null;
        const pts = [a, ...pending.vertices].map((p) => `${p.x * 100},${p.y * 100}`).join(' ');
        return (
          <polyline
            points={pts}
            fill="none"
            stroke="currentColor"
            className="text-primary"
            strokeWidth={1.5}
            strokeDasharray="3 2"
            vectorEffect="non-scaling-stroke"
          />
        );
      })()}
    </svg>
  );
}

function SymbolDot({ symbol, defs, selected, onPointerDown }: {
  symbol: FixtureSymbol;
  defs: FixtureDef[];
  selected?: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const def = defs.find((d) => d.type === symbol.type);
  return (
    <div
      // 36×36 hit target on mobile, 28×28 on desktop. Visible glyph stays compact.
      className="absolute -translate-x-1/2 -translate-y-1/2 w-9 h-9 sm:w-7 sm:h-7 cursor-move flex items-center justify-center"
      style={{ left: `${symbol.x * 100}%`, top: `${symbol.y * 100}%` }}
      onPointerDown={onPointerDown}
    >
      <span
        className={`w-7 h-7 sm:w-6 sm:h-6 rounded-full bg-white text-black flex items-center justify-center font-mono text-sm ${
          selected ? 'ring-2 ring-primary border border-primary' : 'border border-black'
        }`}
      >
        {def?.glyph || '•'}
      </span>
      {/* A linked symbol is visibly different — otherwise "which of these 40
          sockets still needs a product?" means clicking every one of them. */}
      {symbol.product_id && (
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border border-black/40" />
      )}
    </div>
  );
}

/**
 * Properties for the selected symbol: a label, and the catalog product it
 * represents. Linking a product is what lets the sheet produce a bill of
 * materials rather than a picture of some circles.
 */
function SymbolProperties({ symbol, def, onChange, onClose }: {
  symbol: FixtureSymbol;
  def?: FixtureDef;
  onChange: (patch: Partial<FixtureSymbol>) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ id: string; name: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [linkedName, setLinkedName] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout>>();

  // Resolve the linked product's name so the panel shows what it is, not a UUID.
  useEffect(() => {
    let cancelled = false;
    if (!symbol.product_id) { setLinkedName(null); return; }
    void (async () => {
      const { data } = await supabase.from('products').select('id, name').eq('id', symbol.product_id!).maybeSingle();
      if (!cancelled) setLinkedName((data as any)?.name ?? 'Unknown product');
    })();
    return () => { cancelled = true; };
  }, [symbol.product_id]);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const term = query.trim();
    if (!term) { setResults([]); return; }
    debounce.current = setTimeout(() => {
      void (async () => {
        try {
          setSearching(true);
          // Escape LIKE wildcards so a product name containing % or _ searches literally.
          const escaped = term.replace(/[%_]/g, (m) => `\\${m}`);
          const { data } = await supabase
            .from('products')
            .select('id, name')
            .ilike('name', `%${escaped}%`)
            .limit(8);
          setResults(((data ?? []) as any[]).map((p) => ({ id: p.id, name: p.name ?? 'Untitled' })));
        } finally {
          setSearching(false);
        }
      })();
    }, 250);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query]);

  return (
    <div className="p-2 rounded border border-primary/40 bg-primary/5 space-y-2">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs">{def?.glyph || '•'}</span>
        <span className="text-xs font-medium">{def?.label || symbol.type}</span>
        <Button variant="ghost" size="icon" className="ml-auto h-6 w-6" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <Input
        value={symbol.label ?? ''}
        onChange={(e) => onChange({ label: e.target.value })}
        placeholder="Label (e.g. above worktop)"
        className="h-7 text-xs"
      />

      {symbol.product_id ? (
        <div className="flex items-center gap-2 text-xs">
          <Package className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          <span className="truncate">{linkedName ?? 'Loading…'}</span>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-6 w-6"
            onClick={() => { onChange({ product_id: undefined }); setQuery(''); }}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <div className="space-y-1">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Link a product…"
            className="h-7 text-xs"
          />
          {searching && <div className="text-[11px] text-muted-foreground px-1">Searching…</div>}
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => { onChange({ product_id: r.id }); setQuery(''); setResults([]); }}
              className="w-full text-left text-xs px-2 py-1 rounded hover:bg-white/10 truncate"
            >
              {r.name}
            </button>
          ))}
          {!searching && query.trim() && results.length === 0 && (
            <div className="text-[11px] text-muted-foreground px-1">No products match.</div>
          )}
        </div>
      )}
    </div>
  );
}
