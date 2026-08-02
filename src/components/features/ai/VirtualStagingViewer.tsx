import React, { useState, useRef, useCallback } from 'react';
import { Download, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/core/ui/button';

interface VirtualStagingViewerProps {
  resultImageUrl: string;
  sourceImageUrl?: string;
  room: string;
  furnitureStyle: string;
  creditsUsed: number;
  onAnalyzeQuality?: () => void;
}

export function VirtualStagingViewer({
  resultImageUrl,
  sourceImageUrl,
  room,
  furnitureStyle,
  creditsUsed,
  onAnalyzeQuality,
}: VirtualStagingViewerProps) {
  const [showComparison, setShowComparison] = useState(false);
  const [sliderPosition, setSliderPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const updatePosition = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(pct);
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updatePosition(e.clientX);
  }, [updatePosition]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    updatePosition(e.clientX);
  }, [updatePosition]);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = resultImageUrl;
    a.download = `virtual-staging-${room.toLowerCase().replace(/\s+/g, '-')}.jpg`;
    a.click();
  };

  return (
    <div className="space-y-3">
      {/* Comparison viewer or single image */}
      {showComparison && sourceImageUrl ? (
        <div className="space-y-2">
          <div
            ref={containerRef}
            className="relative w-full rounded-xl overflow-hidden border border-border shadow-md select-none touch-none cursor-col-resize"
            style={{ aspectRatio: '16/10' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            {/* Result image (full, below) */}
            <img
              src={resultImageUrl}
              alt={`Staged — ${room}`}
              className="absolute inset-0 w-full h-full object-cover"
              draggable={false}
            />

            {/* Original image (clipped from left) */}
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ width: `${sliderPosition}%` }}
            >
              <img
                src={sourceImageUrl}
                alt="Original room"
                className="absolute inset-0 w-full h-full object-cover"
                style={{ width: containerRef.current?.offsetWidth || '100%', maxWidth: 'none' }}
                draggable={false}
              />
            </div>

            {/* Slider handle */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg"
              style={{ left: `${sliderPosition}%`, transform: 'translateX(-50%)' }}
            >
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
              </div>
            </div>

            {/* Labels */}
            <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full pointer-events-none">
              Original
            </div>
            <div className="absolute top-2 right-2 bg-primary/80 text-white text-xs px-2 py-1 rounded-full pointer-events-none">
              Staged
            </div>
          </div>
        </div>
      ) : (
        <img
          src={resultImageUrl}
          alt={`Virtual staging — ${room}`}
          className="w-full rounded-xl border border-border shadow-md object-cover"
          loading="lazy"
        />
      )}

      {/* Info bar */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
        <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full">{room}</span>
        <span className="bg-accent px-2 py-0.5 rounded-full">{furnitureStyle}</span>
        <span className="ml-auto">{creditsUsed} credits used</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" className="gap-2" onClick={handleDownload}>
          <Download className="h-4 w-4" />
          Download
        </Button>
        {sourceImageUrl && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setShowComparison(!showComparison)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {showComparison ? 'Hide Comparison' : 'Before / After'}
          </Button>
        )}
        {onAnalyzeQuality && (
          <Button variant="outline" size="sm" className="gap-2" onClick={onAnalyzeQuality}>
            Analyze quality
          </Button>
        )}
      </div>
    </div>
  );
}
