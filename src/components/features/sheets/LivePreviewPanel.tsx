import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Eye } from 'lucide-react';
import { moodboardSheetsService } from '@/services/moodboardSheetsService';

/**
 * Debounced live PDF preview that re-renders on canvas-state change.
 *
 * Strategy: every time `data` changes, schedule a render 1.5s later. If the
 * user is still moving things around, the timer resets. When the timer
 * eventually fires, we update the sheet with the latest data + invoke the
 * PDF function. The preview iframe shows the result.
 *
 * Uses an `<iframe>` rather than rendering pages on a canvas because the
 * server-rendered PDF is the source of truth — what you see is exactly what
 * a Render PDF click would produce. Free of layout drift.
 *
 * Callers MUST gate on `enabled=true` only when they have a backdrop set,
 * otherwise validation will reject the render.
 */
interface LivePreviewPanelProps {
  sheetId: string;
  data: Record<string, any>;
  enabled: boolean;
  /** Minimum content count to trigger a preview render. Avoids burning a render
   *  call on the first dot drop — wait until the user has at least 1 meaningful
   *  annotation. */
  hasMinContent: boolean;
}

export function LivePreviewPanel({ sheetId, data, enabled, hasMinContent }: LivePreviewPanelProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSerialized = useRef<string>('');

  useEffect(() => {
    if (!enabled || !hasMinContent) return;
    const serialized = JSON.stringify(data);
    if (serialized === lastSerialized.current) return;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      lastSerialized.current = serialized;
      setRendering(true);
      setError(null);
      try {
        await moodboardSheetsService.update(sheetId, { data });
        const result = await moodboardSheetsService.generatePdf(sheetId);
        setPreviewUrl(`${result.pdf_url}#toolbar=0&navpanes=0&t=${Date.now()}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Preview failed');
      } finally {
        setRendering(false);
      }
    }, 1500);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [data, enabled, hasMinContent, sheetId]);

  return (
    <div className="rounded-lg border border-white/15 bg-black/20 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/10 text-xs">
        <Eye className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">Live preview</span>
        {rendering && <Loader2 className="h-3 w-3 animate-spin ml-auto text-muted-foreground" />}
        {!rendering && !hasMinContent && (
          <span className="ml-auto text-[10px] text-muted-foreground/70">
            add content to start preview
          </span>
        )}
      </div>
      <div style={{ aspectRatio: '4/3' }} className="relative bg-black/40">
        {previewUrl ? (
          <iframe src={previewUrl} className="absolute inset-0 w-full h-full" title="Sheet preview" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground p-4 text-center">
            {error
              ? <span className="text-red-400">{error}</span>
              : !hasMinContent
                ? 'The preview will appear here once you start adding annotations.'
                : 'Generating first preview…'}
          </div>
        )}
      </div>
    </div>
  );
}
