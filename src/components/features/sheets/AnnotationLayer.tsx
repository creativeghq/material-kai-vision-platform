import React, { useCallback, useRef } from 'react';

/**
 * Shared image-backdrop canvas used by every interactive sheet widget
 * (CalloutCanvas, DimensionCanvas, FixtureSymbolCanvas).
 *
 * Mounts an <img> as the backdrop, captures pointer events on a transparent
 * overlay, converts client coordinates to NORMALIZED [0..1] space relative to
 * the rendered image area, and yields them to children via render-props.
 *
 * Why normalized: the PDF builder uses the same [0..1] convention to position
 * annotations regardless of final pixel dimensions, so the same data round-trips
 * to PDF without per-device coordinate math.
 */

export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface AnnotationLayerHandle {
  toNormalized: (clientX: number, clientY: number) => NormalizedPoint | null;
  fromNormalized: (n: NormalizedPoint) => { left: number; top: number } | null;
}

interface AnnotationLayerProps {
  imageUrl: string;
  aspectRatio?: string;
  className?: string;
  onPointerDownPoint?: (p: NormalizedPoint, e: React.PointerEvent) => void;
  onPointerMovePoint?: (p: NormalizedPoint, e: React.PointerEvent) => void;
  onPointerUpPoint?: (p: NormalizedPoint, e: React.PointerEvent) => void;
  children?: React.ReactNode;
}

export const AnnotationLayer = React.forwardRef<AnnotationLayerHandle, AnnotationLayerProps>(
  function AnnotationLayer(
    { imageUrl, aspectRatio = '16/10', className, onPointerDownPoint, onPointerMovePoint, onPointerUpPoint, children },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);

    const toNormalized = useCallback((clientX: number, clientY: number): NormalizedPoint | null => {
      const el = containerRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const x = (clientX - rect.left) / rect.width;
      const y = (clientY - rect.top) / rect.height;
      return {
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y)),
      };
    }, []);

    const fromNormalized = useCallback((n: NormalizedPoint): { left: number; top: number } | null => {
      const el = containerRef.current;
      if (!el) return null;
      return {
        left: n.x * el.clientWidth,
        top: n.y * el.clientHeight,
      };
    }, []);

    React.useImperativeHandle(ref, () => ({ toNormalized, fromNormalized }), [toNormalized, fromNormalized]);

    const handlePointerDown = (e: React.PointerEvent) => {
      const p = toNormalized(e.clientX, e.clientY);
      if (p) onPointerDownPoint?.(p, e);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
      const p = toNormalized(e.clientX, e.clientY);
      if (p) onPointerMovePoint?.(p, e);
    };

    const handlePointerUp = (e: React.PointerEvent) => {
      const p = toNormalized(e.clientX, e.clientY);
      if (p) onPointerUpPoint?.(p, e);
    };

    return (
      <div
        ref={containerRef}
        className={`relative w-full overflow-hidden rounded-lg border border-white/20 bg-black/20 select-none touch-none ${className ?? ''}`}
        style={{ aspectRatio }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <img
          src={imageUrl}
          alt=""
          draggable={false}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        />
        {children}
      </div>
    );
  },
);
