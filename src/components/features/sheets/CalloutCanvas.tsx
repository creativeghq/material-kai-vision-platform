import React, { useState, useEffect, useRef } from 'react';
import { Trash2, Plus, Sparkles, Save } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { AnnotationLayer } from './AnnotationLayer';
import { moodboardSheetsService } from '@/services/moodboardSheetsService';

/**
 * Annotated Render Sheet canvas.
 *
 * Workflow:
 *   1. Receives a backdrop render and an initial set of AI-detected annotations.
 *   2. Each annotation has TWO points: the anchor on the image (red dot) and the
 *      label endpoint (where the leader line terminates and the text sits).
 *      Both are normalized [0..1] over the image area.
 *   3. User can click anywhere on the render to add a new callout (which will
 *      start with anchor=click, endpoint=click+offset, blank label).
 *   4. User can edit any label inline and remove any callout via the side list.
 *   5. "Render PDF" persists the annotations on the sheet row and triggers
 *      generate-moodboard-sheet-pdf.
 */

export interface CalloutAnnotation {
  x: number;
  y: number;
  line_endpoint_x: number;
  line_endpoint_y: number;
  label: string;
  product_id?: string;
  source: 'ai' | 'manual' | 'auto';
  match_kind?: 'matched' | 'generic';
}

interface CalloutCanvasProps {
  sheetId: string;
  backdropImageUrl: string;
  initialAnnotations?: CalloutAnnotation[];
  onPdfReady?: (pdfUrl: string) => void;
}

export function CalloutCanvas({
  sheetId,
  backdropImageUrl,
  initialAnnotations = [],
  onPdfReady,
}: CalloutCanvasProps) {
  const [annotations, setAnnotations] = useState<CalloutAnnotation[]>(initialAnnotations);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [draggingHandle, setDraggingHandle] = useState<'anchor' | 'endpoint' | null>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const layerRef = useRef<React.ElementRef<typeof AnnotationLayer>>(null);

  useEffect(() => {
    setAnnotations(initialAnnotations);
  }, [initialAnnotations]);

  const addAnnotationAt = (x: number, y: number) => {
    const next: CalloutAnnotation = {
      x,
      y,
      line_endpoint_x: Math.min(0.95, x + 0.18),
      line_endpoint_y: Math.max(0.05, y - 0.12),
      label: 'New callout',
      source: 'manual',
    };
    setAnnotations((arr) => [...arr, next]);
    setSelectedIdx(annotations.length);
  };

  const handleBackdropPointerDown = (p: { x: number; y: number }) => {
    if (draggingIdx !== null) return;
    addAnnotationAt(p.x, p.y);
  };

  const handleHandlePointerDown = (idx: number, kind: 'anchor' | 'endpoint') => (e: React.PointerEvent) => {
    e.stopPropagation();
    setDraggingIdx(idx);
    setDraggingHandle(kind);
    setSelectedIdx(idx);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleLayerMove = (p: { x: number; y: number }) => {
    if (draggingIdx === null || draggingHandle === null) return;
    setAnnotations((arr) =>
      arr.map((a, i) =>
        i === draggingIdx
          ? draggingHandle === 'anchor'
            ? { ...a, x: p.x, y: p.y }
            : { ...a, line_endpoint_x: p.x, line_endpoint_y: p.y }
          : a,
      ),
    );
  };

  const handleLayerUp = () => {
    setDraggingIdx(null);
    setDraggingHandle(null);
  };

  const updateLabel = (idx: number, label: string) => {
    setAnnotations((arr) => arr.map((a, i) => (i === idx ? { ...a, label } : a)));
  };

  const removeAnnotation = (idx: number) => {
    setAnnotations((arr) => arr.filter((_, i) => i !== idx));
    setSelectedIdx(null);
  };

  const handleRender = async () => {
    setRendering(true);
    setError(null);
    try {
      await moodboardSheetsService.update(sheetId, {
        data: {
          backdrop_image_url: backdropImageUrl,
          annotations,
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
      <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
        <Sparkles className="h-3.5 w-3.5" />
        <span>{annotations.length} callout{annotations.length === 1 ? '' : 's'}</span>
        <span className="text-muted-foreground/60">•</span>
        <span>Click image to add. Drag dots to move. Edit labels on the right.</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Canvas */}
        <div className="lg:col-span-2">
          <AnnotationLayer
            ref={layerRef}
            imageUrl={backdropImageUrl}
            aspectRatio="16/10"
            onPointerDownPoint={handleBackdropPointerDown}
            onPointerMovePoint={handleLayerMove}
            onPointerUpPoint={handleLayerUp}
          >
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              {annotations.map((a, idx) => (
                <line
                  key={idx}
                  x1={`${a.x * 100}%`}
                  y1={`${a.y * 100}%`}
                  x2={`${a.line_endpoint_x * 100}%`}
                  y2={`${a.line_endpoint_y * 100}%`}
                  stroke={selectedIdx === idx ? '#ff3030' : '#000'}
                  strokeWidth={selectedIdx === idx ? 1.5 : 1}
                />
              ))}
            </svg>
            {annotations.map((a, idx) => (
              <React.Fragment key={idx}>
                {/* Anchor dot */}
                <div
                  className={`absolute -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full cursor-move ${
                    selectedIdx === idx ? 'bg-red-500 ring-2 ring-white' : 'bg-red-500'
                  }`}
                  style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%` }}
                  onPointerDown={handleHandlePointerDown(idx, 'anchor')}
                />
                {/* Label box (endpoint) */}
                <div
                  className={`absolute -translate-y-1/2 px-2 py-1 rounded text-xs font-medium bg-white text-black shadow cursor-move max-w-[180px] truncate ${
                    selectedIdx === idx ? 'ring-2 ring-primary' : 'border border-black/40'
                  }`}
                  style={{ left: `${a.line_endpoint_x * 100}%`, top: `${a.line_endpoint_y * 100}%` }}
                  onPointerDown={handleHandlePointerDown(idx, 'endpoint')}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedIdx(idx);
                  }}
                >
                  {a.label || 'Untitled'}
                </div>
              </React.Fragment>
            ))}
          </AnnotationLayer>
        </div>

        {/* Side list */}
        <div className="space-y-2 max-h-[460px] overflow-y-auto">
          {annotations.length === 0 && (
            <div className="text-xs text-muted-foreground p-3 border border-dashed rounded-lg">
              No callouts yet. Click on the render to add one.
            </div>
          )}
          {annotations.map((a, idx) => (
            <div
              key={idx}
              className={`p-2 rounded-lg border space-y-1 ${
                selectedIdx === idx ? 'border-primary bg-primary/5' : 'border-white/15'
              }`}
              onClick={() => setSelectedIdx(idx)}
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase text-muted-foreground bg-white/10 px-1.5 py-0.5 rounded">
                  {a.source}
                </span>
                {a.product_id && (
                  <span className="text-[10px] text-primary">linked</span>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeAnnotation(idx);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Input
                value={a.label}
                onChange={(e) => updateLabel(idx, e.target.value)}
                placeholder="Label"
                className="h-7 text-xs"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          className="gap-2"
          onClick={() => addAnnotationAt(0.5, 0.5)}
        >
          <Plus className="h-4 w-4" />
          Add callout
        </Button>
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
