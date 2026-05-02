import React, { useState } from 'react';
import { Trash2, Save, Lightbulb, Square } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { AnnotationLayer } from './AnnotationLayer';
import { moodboardSheetsService } from '@/services/moodboardSheetsService';
import { LivePreviewPanel } from './LivePreviewPanel';

/**
 * Lighting Plan canvas.
 *
 * Backdrop is either an uploaded floor plan image OR a plain rectangle drawn
 * from user-typed room dimensions. The user picks a fixture type from the
 * palette, then clicks anywhere on the backdrop to place it. All symbols are
 * stored as normalized [0..1] coords so the PDF builder can re-place them on
 * any canvas size.
 */

type FixtureType = 'recessed' | 'pendant' | 'wall' | 'spot' | 'led_strip' | 'floor' | 'table';

const FIXTURE_DEFS: { type: FixtureType; label: string; glyph: string }[] = [
  { type: 'recessed', label: 'Recessed', glyph: '⊕' },
  { type: 'pendant',  label: 'Pendant',  glyph: '●' },
  { type: 'wall',     label: 'Wall',     glyph: '◐' },
  { type: 'spot',     label: 'Spot',     glyph: '◇' },
  { type: 'led_strip', label: 'LED Strip', glyph: '▬' },
  { type: 'floor',    label: 'Floor',    glyph: '○' },
  { type: 'table',    label: 'Table',    glyph: '○' },
];

export interface FixtureSymbol {
  type: FixtureType;
  x: number;
  y: number;
  label?: string;
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
  onPdfReady?: (pdfUrl: string) => void;
}

export function FixtureSymbolCanvas({
  sheetId,
  backdrop,
  initialSymbols = [],
  initialLegend = [],
  onPdfReady,
}: FixtureSymbolCanvasProps) {
  const [symbols, setSymbols] = useState<FixtureSymbol[]>(initialSymbols);
  const [legend, setLegend] = useState<LegendEntry[]>(initialLegend);
  const [activeType, setActiveType] = useState<FixtureType>('recessed');
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePointerDown = (p: { x: number; y: number }) => {
    if (draggingIdx !== null) return;
    setSymbols((arr) => [...arr, { type: activeType, x: p.x, y: p.y }]);
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
    setDraggingIdx(idx);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerUp = () => {
    setDraggingIdx(null);
  };

  const removeSymbol = (idx: number) => {
    setSymbols((arr) => arr.filter((_, i) => i !== idx));
  };

  const updateLegendLabel = (idx: number, label: string) => {
    setLegend((arr) => arr.map((l, i) => (i === idx ? { ...l, label } : l)));
  };

  const removeLegendEntry = (idx: number) => {
    setLegend((arr) => arr.filter((_, i) => i !== idx));
  };

  const backdropUrl = backdrop.kind === 'upload' ? backdrop.image_url : undefined;
  const ratio = backdrop.width_mm && backdrop.height_mm
    ? `${backdrop.width_mm}/${backdrop.height_mm}`
    : '4/3';

  const handleRender = async () => {
    setRendering(true);
    setError(null);
    try {
      await moodboardSheetsService.update(sheetId, {
        data: { backdrop, symbols, legend },
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
      {/* Fixture palette */}
      <div className="flex items-center gap-1 flex-wrap text-xs">
        <Lightbulb className="h-3.5 w-3.5 mr-1" />
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
              {symbols.map((s, idx) => (
                <SymbolDot
                  key={idx}
                  symbol={s}
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
              {symbols.map((s, idx) => (
                <SymbolDot
                  key={idx}
                  symbol={s}
                  onPointerDown={handleSymbolPointerDown(idx)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Legend + symbol list */}
        <div className="space-y-3 max-h-[460px] overflow-y-auto">
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
        data={{ backdrop, symbols, legend }}
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

function SymbolDot({ symbol, onPointerDown }: { symbol: FixtureSymbol; onPointerDown: (e: React.PointerEvent) => void }) {
  const def = FIXTURE_DEFS.find((d) => d.type === symbol.type);
  return (
    <div
      // 36×36 hit target on mobile, 28×28 on desktop. Visible glyph stays compact.
      className="absolute -translate-x-1/2 -translate-y-1/2 w-9 h-9 sm:w-7 sm:h-7 cursor-move flex items-center justify-center"
      style={{ left: `${symbol.x * 100}%`, top: `${symbol.y * 100}%` }}
      onPointerDown={onPointerDown}
    >
      <span className="w-7 h-7 sm:w-6 sm:h-6 rounded-full bg-white text-black border border-black flex items-center justify-center font-mono text-sm">
        {def?.glyph || '•'}
      </span>
    </div>
  );
}
