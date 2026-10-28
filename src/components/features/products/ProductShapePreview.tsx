import React, { useMemo, useState } from 'react';
import { isoBox, type PlaceholderShape } from './productShape';

const W = 260;
const H = 200;
const PAD = 34;

const points = (pts: Array<{ x: number; y: number }>): string => pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

interface ProductShapePreviewProps {
  shapes: PlaceholderShape[];
}

/** The product's catalog size as a plain box. It states what is known and invents nothing else. */
export const ProductShapePreview: React.FC<ProductShapePreviewProps> = ({ shapes }) => {
  const [index, setIndex] = useState(0);
  const shape = shapes[Math.min(index, shapes.length - 1)];
  const depthKnown = shape.d !== null;
  const drawnDepth = shape.d ?? Math.max(shape.w, shape.h) * 0.06;
  const box = useMemo(() => isoBox(shape.w, shape.h, drawnDepth, W, H, PAD), [shape.w, shape.h, drawnDepth]);

  const label = 'fill-muted-foreground text-[10px] tabular-nums';
  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Approximate shape, ${shape.w} wide by ${shape.h} high${depthKnown ? ` by ${shape.d} deep` : ''} millimetres`}
        className="w-full max-w-[17rem] rounded-lg bg-muted/30"
      >
        <polygon points={points(box.side)} className="fill-primary/25 stroke-primary/60" strokeWidth={1} strokeLinejoin="round" />
        <polygon points={points(box.front)} className="fill-primary/15 stroke-primary/60" strokeWidth={1} strokeLinejoin="round" />
        <polygon points={points(box.top)} className="fill-primary/10 stroke-primary/60" strokeWidth={1} strokeLinejoin="round" />
        <text x={box.widthAt.x - 2} y={box.widthAt.y + 16} textAnchor="middle" className={label}>{shape.w} mm</text>
        <text x={box.heightAt.x - 8} y={box.heightAt.y} textAnchor="end" dominantBaseline="middle" className={label}>{shape.h} mm</text>
        {depthKnown && (
          <text x={box.depthAt.x + 8} y={box.depthAt.y + 14} textAnchor="middle" className={label}>{shape.d} mm</text>
        )}
      </svg>
      <figcaption className="mt-2 space-y-1.5 text-[11px] text-muted-foreground">
        {shapes.length > 1 && (
          <select
            value={index}
            onChange={e => setIndex(Number(e.target.value))}
            aria-label="Model to draw"
            className="h-8 w-full max-w-[17rem] rounded-sm border border-hairline bg-card px-2 text-xs text-foreground"
          >
            {shapes.map((s, i) => (
              <option key={s.label} value={i}>{s.label}</option>
            ))}
          </select>
        )}
        <p>
          Approximate shape from the catalog sizes, not a real model.
          {!depthKnown && ' The catalog states no depth, so the thickness is only suggested.'}
        </p>
      </figcaption>
    </figure>
  );
};
