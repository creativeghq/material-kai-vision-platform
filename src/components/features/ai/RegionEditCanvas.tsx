/**
 * RegionEditCanvas
 *
 * Full-screen canvas overlay that lets the user paint a mask over a room image,
 * then describe what to change in the masked area.
 *
 * Drawing tools:
 *   - Brush  — freehand paint (default)
 *   - Eraser — remove mask strokes
 *   - Clear  — wipe entire mask
 *
 * How it works:
 *   1. The room image is shown as background.
 *   2. User paints over the area they want to change — shown as a semi-transparent amber overlay.
 *   3. User types what to change in the selected area.
 *   4. On Apply, we export:
 *        - maskData: PNG data URL (white = change, black = keep)
 *        - prompt: the change instruction + auto-appended spatial lock
 *        - modelTier: 'grok' (only Grok supports masking)
 *   5. Parent calls onApply({ imageUrl, maskDataUrl, prompt }) → generates via generate-region-edit.
 *
 * Result flow: result appears in a before/after viewer (Accept / Refine / Discard).
 */

import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  type MouseEvent,
  type TouchEvent,
} from 'react';
import { Button } from '@/components/core/ui/button';
import { Brush, Eraser, Trash2, Sparkles, X, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
type Tool = 'brush' | 'eraser';

export interface RegionEditResult {
  /** Original room image URL */
  imageUrl: string;
  /** PNG data URL — white=change black=keep */
  maskDataUrl: string;
  /** Change instruction */
  prompt: string;
}

interface RegionEditCanvasProps {
  imageUrl: string;
  /** Must return a Promise — canvas stays in loading state until it resolves/rejects */
  onApply: (result: RegionEditResult) => Promise<void>;
  onClose: () => void;
}

const BRUSH_SIZES = [12, 24, 40, 64] as const;
const MASK_FILL = 'rgba(245, 158, 11, 0.55)'; // amber-500 semi-transparent

export const RegionEditCanvas: React.FC<RegionEditCanvasProps> = ({
  imageUrl,
  onApply,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [tool, setTool] = useState<Tool>('brush');
  const [brushSize, setBrushSize] = useState<number>(40);
  const [drawing, setDrawing] = useState(false);
  const [hasMask, setHasMask] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [applying, setApplying] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);

  // Load image and size canvas to match
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imgRef.current = img;
      sizeCanvas(img);
      setCanvasReady(true);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  const sizeCanvas = (img: HTMLImageElement) => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const maxW = container.clientWidth;
    const maxH = container.clientHeight - 160; // leave room for controls
    const ratio = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
    canvas.width = Math.round(img.naturalWidth * ratio);
    canvas.height = Math.round(img.naturalHeight * ratio);
  };

  // Resize on window change
  useEffect(() => {
    const onResize = () => {
      if (imgRef.current) sizeCanvas(imgRef.current);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Paint one stroke
  const paint = useCallback((x: number, y: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.fillStyle = MASK_FILL;
    ctx.beginPath();
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
    setHasMask(true);
  }, [tool, brushSize]);

  const getCanvasPos = (e: { clientX: number; clientY: number }): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const onMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
    setDrawing(true);
    const { x, y } = getCanvasPos(e);
    paint(x, y);
  };

  const onMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const { x, y } = getCanvasPos(e);
    paint(x, y);
  };

  const onMouseUp = () => setDrawing(false);

  const onTouchStart = (e: TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setDrawing(true);
    const { x, y } = getCanvasPos(e.touches[0]);
    paint(x, y);
  };

  const onTouchMove = (e: TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!drawing) return;
    const { x, y } = getCanvasPos(e.touches[0]);
    paint(x, y);
  };

  const clearMask = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasMask(false);
  };

  // Export binary mask PNG: white = painted areas, black = everything else
  const exportMaskDataUrl = (): string => {
    const canvas = canvasRef.current!;
    const w = canvas.width;
    const h = canvas.height;

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = w;
    maskCanvas.height = h;
    const mCtx = maskCanvas.getContext('2d')!;

    // Fill black (keep)
    mCtx.fillStyle = 'black';
    mCtx.fillRect(0, 0, w, h);

    // Get painted alpha channel from overlay canvas
    const overlayCtx = canvas.getContext('2d')!;
    const overlayData = overlayCtx.getImageData(0, 0, w, h);
    const maskData = mCtx.getImageData(0, 0, w, h);

    for (let i = 0; i < overlayData.data.length; i += 4) {
      // Any pixel with alpha > 0 is painted → set to white in mask
      if (overlayData.data[i + 3] > 0) {
        maskData.data[i]     = 255; // R
        maskData.data[i + 1] = 255; // G
        maskData.data[i + 2] = 255; // B
        maskData.data[i + 3] = 255; // A
      }
    }

    mCtx.putImageData(maskData, 0, 0);
    return maskCanvas.toDataURL('image/png');
  };

  const handleApply = async () => {
    if (!prompt.trim() || !hasMask) return;
    setApplying(true);

    try {
      const maskDataUrl = exportMaskDataUrl();
      const finalPrompt = `${prompt.trim()}\n\nEverything OUTSIDE the marked area must remain completely unchanged: same colors, materials, lighting, furniture, camera angle, and architecture. Zero changes outside the mask.`;

      await onApply({ imageUrl, maskDataUrl, prompt: finalPrompt });
    } finally {
      setApplying(false);
    }
  };

  const canApply = hasMask && prompt.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/80">
        <div className="flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-semibold">Region Edit</span>
          <span className="text-xs text-muted-foreground">Paint the area you want to change</span>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Canvas area ── */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center p-4 overflow-hidden relative"
      >
        {/* Background image */}
        {canvasReady && imgRef.current && (
          <img
            src={imageUrl}
            alt="Room to edit"
            className="absolute object-contain pointer-events-none"
            style={{
              width: canvasRef.current?.width,
              height: canvasRef.current?.height,
            }}
          />
        )}

        {/* Mask overlay canvas */}
        <canvas
          ref={canvasRef}
          className={cn(
            'relative cursor-crosshair touch-none',
            tool === 'eraser' && 'cursor-cell',
          )}
          style={{ background: 'transparent' }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={() => setDrawing(false)}
        />

        {/* Hint when no mask yet */}
        {!hasMask && canvasReady && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-black/60 text-white text-sm rounded-xl px-4 py-2">
              Paint over the area you want to change
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom controls ── */}
      <div className="border-t border-border bg-background px-4 py-3 space-y-3">
        {/* Tool + brush size row */}
        <div className="flex items-center gap-3">
          {/* Tool toggle */}
          <div className="flex items-center border border-border rounded-full overflow-hidden">
            <button
              onClick={() => setTool('brush')}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
                tool === 'brush' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
            >
              <Brush className="w-3.5 h-3.5" /> Brush
            </button>
            <button
              onClick={() => setTool('eraser')}
              className={cn('flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
                tool === 'eraser' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
            >
              <Eraser className="w-3.5 h-3.5" /> Eraser
            </button>
          </div>

          {/* Brush size */}
          <div className="flex items-center gap-1.5">
            {BRUSH_SIZES.map((size) => (
              <button
                key={size}
                onClick={() => setBrushSize(size)}
                aria-label={`Brush size ${size}`}
                className={cn('rounded-full border-2 transition-all flex items-center justify-center',
                  brushSize === size ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40')}
                style={{ width: 28, height: 28 }}
              >
                <div
                  className={cn('rounded-full', brushSize === size ? 'bg-primary' : 'bg-muted-foreground')}
                  style={{ width: Math.max(4, size / 5), height: Math.max(4, size / 5) }}
                />
              </button>
            ))}
          </div>

          {/* Clear */}
          <button
            onClick={clearMask}
            disabled={!hasMask}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full border border-border text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:border-destructive/40 hover:text-destructive disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Trash2 className="w-3 h-3" /> Clear
          </button>
        </div>

        {/* Prompt input + apply row */}
        <div className="flex gap-2">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="What should change in the painted area? e.g. Replace with marble tile herringbone"
            className="flex-1 text-sm rounded-full border border-border bg-muted/30 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            onKeyDown={(e) => { if (e.key === 'Enter' && canApply) handleApply(); }}
          />
          <Button
            onClick={handleApply}
            disabled={!canApply || applying}
            className="rounded-full gap-1.5 shrink-0"
          >
            <Sparkles className="w-4 h-4" />
            {applying ? 'Applying…' : 'Apply'}
          </Button>
        </div>

        {!hasMask && (
          <p className="text-[11px] text-muted-foreground text-center">
            Paint the area first, then describe what to change.
          </p>
        )}
      </div>
    </div>
  );
};
