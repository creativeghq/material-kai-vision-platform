import React, { useState } from 'react';
import { Trash2, Save, Ruler, Tag } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { AnnotationLayer } from './AnnotationLayer';
import { moodboardSheetsService } from '@/services/moodboardSheetsService';

/**
 * Elevation + Render Pair canvas.
 *
 * Two annotation modes share the same backdrop:
 *   - Dimension lines: two-click placement (first click = start, second = end),
 *     then user types the value (e.g. "2725"). Stored normalized [0..1].
 *   - Tile callouts: single click + label (e.g. "Porcelain 600×1200 mm").
 *
 * The render image (bottom half of the PDF) is uploaded separately above the
 * canvas and not annotated.
 */

export interface Dimension {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  value: string;
  unit: string;
}

export interface TileCallout {
  x: number;
  y: number;
  label: string;
}

interface DimensionCanvasProps {
  sheetId: string;
  elevationImageUrl: string;
  renderImageUrl?: string;
  initialDimensions?: Dimension[];
  initialTileCallouts?: TileCallout[];
  onPdfReady?: (pdfUrl: string) => void;
}

type Mode = 'dimension' | 'tile';

export function DimensionCanvas({
  sheetId,
  elevationImageUrl,
  renderImageUrl,
  initialDimensions = [],
  initialTileCallouts = [],
  onPdfReady,
}: DimensionCanvasProps) {
  const [dimensions, setDimensions] = useState<Dimension[]>(initialDimensions);
  const [tileCallouts, setTileCallouts] = useState<TileCallout[]>(initialTileCallouts);
  const [mode, setMode] = useState<Mode>('dimension');
  const [pendingStart, setPendingStart] = useState<{ x: number; y: number } | null>(null);
  const [defaultUnit, setDefaultUnit] = useState('mm');
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePointerDown = (p: { x: number; y: number }) => {
    if (mode === 'tile') {
      const label = window.prompt('Label for this callout (e.g. "Porcelain 600×1200 mm")') || '';
      if (label.trim()) {
        setTileCallouts((arr) => [...arr, { x: p.x, y: p.y, label: label.trim() }]);
      }
      return;
    }

    if (!pendingStart) {
      setPendingStart(p);
    } else {
      const value = window.prompt('Dimension value (e.g. "2725")') || '';
      if (value.trim()) {
        setDimensions((arr) => [
          ...arr,
          { x1: pendingStart.x, y1: pendingStart.y, x2: p.x, y2: p.y, value: value.trim(), unit: defaultUnit },
        ]);
      }
      setPendingStart(null);
    }
  };

  const removeDimension = (idx: number) => {
    setDimensions((arr) => arr.filter((_, i) => i !== idx));
  };
  const removeTile = (idx: number) => {
    setTileCallouts((arr) => arr.filter((_, i) => i !== idx));
  };

  const handleRender = async () => {
    setRendering(true);
    setError(null);
    try {
      await moodboardSheetsService.update(sheetId, {
        data: {
          elevation_image_url: elevationImageUrl,
          render_image_url: renderImageUrl,
          dimensions,
          tile_callouts: tileCallouts,
        },
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
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <div className="bg-white/5 rounded-full p-1 flex">
          <button
            onClick={() => { setMode('dimension'); setPendingStart(null); }}
            className={`px-3 py-1 rounded-full flex items-center gap-1 ${
              mode === 'dimension' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
            }`}
          >
            <Ruler className="h-3.5 w-3.5" />
            Dimension
          </button>
          <button
            onClick={() => { setMode('tile'); setPendingStart(null); }}
            className={`px-3 py-1 rounded-full flex items-center gap-1 ${
              mode === 'tile' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
            }`}
          >
            <Tag className="h-3.5 w-3.5" />
            Tile callout
          </button>
        </div>
        {mode === 'dimension' && (
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground">Default unit:</span>
            <select
              value={defaultUnit}
              onChange={(e) => setDefaultUnit(e.target.value)}
              className="bg-white/5 rounded px-2 py-1 border border-white/10"
            >
              <option value="mm">mm</option>
              <option value="cm">cm</option>
              <option value="m">m</option>
              <option value="in">in</option>
            </select>
          </div>
        )}
        <span className="ml-auto text-muted-foreground">
          {mode === 'dimension'
            ? pendingStart ? 'Click second point to set the dimension end' : 'Click first point on the elevation'
            : 'Click anywhere to drop a tile callout'}
        </span>
      </div>

      <AnnotationLayer
        imageUrl={elevationImageUrl}
        aspectRatio="16/9"
        onPointerDownPoint={handlePointerDown}
      >
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {dimensions.map((d, idx) => (
            <g key={`dim-${idx}`}>
              <line
                x1={`${d.x1 * 100}%`} y1={`${d.y1 * 100}%`}
                x2={`${d.x2 * 100}%`} y2={`${d.y2 * 100}%`}
                stroke="#ff3030" strokeWidth={1.2}
              />
              <text
                x={`${((d.x1 + d.x2) / 2) * 100}%`}
                y={`${((d.y1 + d.y2) / 2) * 100}%`}
                fill="#000"
                stroke="#fff"
                strokeWidth={3}
                paintOrder="stroke"
                fontSize={11}
                fontWeight="bold"
                dx={4} dy={-4}
              >
                {d.value} {d.unit}
              </text>
            </g>
          ))}
        </svg>
        {pendingStart && (
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-red-500 ring-2 ring-white pointer-events-none"
            style={{ left: `${pendingStart.x * 100}%`, top: `${pendingStart.y * 100}%` }}
          />
        )}
        {tileCallouts.map((t, idx) => (
          <div
            key={`tile-${idx}`}
            className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%` }}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white" />
            <div className="absolute left-3 top-0 px-1.5 py-0.5 rounded bg-white text-black text-[10px] whitespace-nowrap shadow border border-black/30">
              {t.label}
            </div>
          </div>
        ))}
      </AnnotationLayer>

      {/* Lists */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">Dimensions ({dimensions.length})</div>
          {dimensions.map((d, idx) => (
            <div key={idx} className="flex items-center gap-2 text-xs p-2 rounded border border-white/10">
              <span className="font-mono">{d.value} {d.unit}</span>
              <Button variant="ghost" size="icon" className="ml-auto h-6 w-6" onClick={() => removeDimension(idx)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">Tile callouts ({tileCallouts.length})</div>
          {tileCallouts.map((t, idx) => (
            <div key={idx} className="flex items-center gap-2 text-xs p-2 rounded border border-white/10">
              <span className="truncate">{t.label}</span>
              <Button variant="ghost" size="icon" className="ml-auto h-6 w-6" onClick={() => removeTile(idx)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </div>

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
