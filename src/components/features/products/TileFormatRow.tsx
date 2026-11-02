import type { TileFormatCm } from './tileFormats';

/** Each format drawn as an outlined box to one shared scale, the way tile catalogues print them. */
export function TileFormatRow({ formats, maxBoxPx = 56 }: { formats: TileFormatCm[]; maxBoxPx?: number }) {
  if (formats.length === 0) return null;
  const largest = Math.max(...formats.flatMap(f => [f.widthCm, f.heightCm]));
  const px = (c: number) => Math.max(6, Math.round((c / largest) * maxBoxPx));
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3" aria-label="Available formats">
      {formats.map(f => (
        <figure key={f.label} className="flex flex-col items-center gap-1.5 m-0">
          <div
            className="border-[1.5px] border-foreground rounded-[1px]"
            style={{ width: px(f.widthCm), height: px(f.heightCm) }}
            aria-hidden
          />
          <figcaption className="text-[11px] font-medium tabular-nums text-foreground">{f.label}</figcaption>
        </figure>
      ))}
    </div>
  );
}
