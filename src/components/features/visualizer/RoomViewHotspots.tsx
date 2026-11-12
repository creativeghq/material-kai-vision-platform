/** A saved room view with a numbered, clickable pin on each finished surface (#560). No data access. */
import React, { useState } from 'react';
import { X } from 'lucide-react';

export interface HotspotLayer {
  surface_key: string;
  surface_label: string;
  product_id: string;
  product_name: string;
  pattern_label: string;
  grout_width_mm: number;
  format_label: string;
  format_assumed: boolean;
  /** Product photo for the card. Optional: the public view sends one, the app may not. */
  image_url?: string | null;
}

export interface HotspotPin { surface_key: string; product_id: string; x: number; y: number }

interface Props {
  imageUrl: string | null;
  alt: string;
  layers: HotspotLayer[];
  pins: HotspotPin[];
  /** Rendered under the spec in the open card: "View product", "Ask about this", … */
  actions?: (layer: HotspotLayer) => React.ReactNode;
}

export const RoomViewHotspots: React.FC<Props> = ({ imageUrl, alt, layers, pins, actions }) => {
  const [open, setOpen] = useState<string | null>(null);
  const openLayer = layers.find((l) => l.surface_key === open) ?? null;
  const openPin = pins.find((p) => p.surface_key === open) ?? null;
  return (
    <div className="relative overflow-hidden rounded-sm border border-hairline bg-surface-sunken">
      {imageUrl
        ? <img src={imageUrl} alt={alt} className="block h-auto w-full" />
        : <div className="flex aspect-video items-center justify-center text-xs text-muted-foreground">The picture could not be loaded.</div>}
      {imageUrl && pins.map((pin) => {
        const n = layers.findIndex((l) => l.surface_key === pin.surface_key) + 1;
        const layer = layers[n - 1];
        if (!layer) return null;
        return (
          <button
            key={pin.surface_key}
            type="button"
            onClick={() => setOpen((cur) => (cur === pin.surface_key ? null : pin.surface_key))}
            className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground shadow-overlay ring-2 ring-background"
            style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
            aria-label={`${n}: ${layer.product_name} on the ${layer.surface_label}`}
            aria-expanded={open === pin.surface_key}
          >
            {n}
          </button>
        );
      })}
      {openLayer && openPin && (
        <div
          className="absolute z-10 w-64 max-w-[80%] rounded-sm border border-hairline bg-card p-3 text-left shadow-overlay"
          style={{
            left: `${Math.min(openPin.x * 100, 60)}%`,
            top: openPin.y > 0.55 ? undefined : `${openPin.y * 100 + 4}%`,
            bottom: openPin.y > 0.55 ? `${(1 - openPin.y) * 100 + 4}%` : undefined,
          }}
          role="dialog"
          aria-label={openLayer.product_name}
        >
          <div className="flex items-start gap-2">
            {openLayer.image_url && <img src={openLayer.image_url} alt="" className="h-12 w-12 shrink-0 rounded-sm object-cover" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight">{openLayer.product_name}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{openLayer.surface_label}</p>
            </div>
            <button type="button" onClick={() => setOpen(null)} className="text-muted-foreground hover:text-foreground" aria-label="Close">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
            <dt className="text-muted-foreground">Format</dt>
            <dd>{openLayer.format_label}{openLayer.format_assumed ? ' (assumed)' : ''}</dd>
            <dt className="text-muted-foreground">Pattern</dt>
            <dd>{openLayer.pattern_label}</dd>
            <dt className="text-muted-foreground">Joint</dt>
            <dd>{openLayer.grout_width_mm} mm</dd>
          </dl>
          {actions && <div className="mt-2 flex flex-wrap gap-1.5">{actions(openLayer)}</div>}
        </div>
      )}
    </div>
  );
};
