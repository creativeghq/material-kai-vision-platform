import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { COUNTRY_TOPO_ID } from './countryTopoIds.generated';
import { countryFlag, countryName } from './gaBreakdowns';

/** The atlas as committed by scripts/gen-world-topology.mjs. */
interface Topology {
  type: 'Topology';
  transform: { scale: [number, number]; translate: [number, number] };
  arcs: number[][][];
  objects: { countries: { geometries: Geometry[] } };
}
interface Geometry {
  type: 'Polygon' | 'MultiPolygon';
  id?: string;
  arcs: number[][] | number[][][];
  properties?: { name?: string };
}

export interface ChoroplethDatum { code: string; value: number; label?: string | null }

const SRC = '/geo/countries-110m.json';

// Inhabited latitudes: the full -90..90 spends a third of the canvas on ice and shrinks Europe.
const LAT_TOP = 84;
const LAT_BOTTOM = -58;
const W = 800;
const H = Math.round((W * (LAT_TOP - LAT_BOTTOM)) / 360);

/** Delta-decode one quantized arc into absolute [lon, lat] pairs. */
function decodeArc(arc: number[][], t: Topology['transform']): [number, number][] {
  let x = 0;
  let y = 0;
  return arc.map(([dx, dy]) => {
    x += dx;
    y += dy;
    return [x * t.scale[0] + t.translate[0], y * t.scale[1] + t.translate[1]] as [number, number];
  });
}

const project = ([lon, lat]: [number, number]): [number, number] => [
  ((lon + 180) / 360) * W,
  ((LAT_TOP - lat) / (LAT_TOP - LAT_BOTTOM)) * H,
];

/** TopoJSON rings are arc INDEXES; a negative one means "that arc, reversed" (~i === -i-1). */
function ringPath(ring: number[], arcs: [number, number][][]): string {
  const pts: [number, number][] = [];
  for (const idx of ring) {
    const arc = idx < 0 ? [...arcs[~idx]].reverse() : arcs[idx];
    if (!arc) continue;
    pts.push(...(pts.length ? arc.slice(1) : arc));
  }
  if (pts.length < 3) return '';
  return `M${pts.map((p) => project(p).map((n) => n.toFixed(1)).join(',')).join('L')}Z`;
}

function geometryPath(g: Geometry, arcs: [number, number][][]): string {
  const polys = g.type === 'Polygon' ? [g.arcs as number[][]] : (g.arcs as number[][][]);
  return polys.map((rings) => rings.map((r) => ringPath(r, arcs)).join('')).join('');
}

/**
 * Where the visitors were. Geometry is FETCHED, not bundled — 106 KB only this pane needs. A
 * missing static path does not 404 here (the SPA catch-all answers 200 with index.html), so the
 * payload is checked for being a Topology before it is trusted.
 */
export const WorldChoropleth: React.FC<{
  data: ChoroplethDatum[];
  /** What the number means, for the caption. */
  unit?: string;
}> = ({ data, unit = 'sessions' }) => {
  const [topo, setTopo] = useState<Topology | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<{ code: string; name: string; value: number } | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    (async () => {
      try {
        const r = await fetch(SRC);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        if (j?.type !== 'Topology' || !j?.objects?.countries) throw new Error('not a world topology');
        setTopo(j as Topology);
      } catch (e: any) {
        setError(e?.message || 'could not load');
      }
    })();
  }, []);

  const byTopoId = useMemo(() => {
    const m = new Map<string, ChoroplethDatum>();
    for (const d of data) {
      const id = COUNTRY_TOPO_ID[d.code?.toUpperCase?.() ?? ''];
      if (!id) continue;
      const prev = m.get(id);
      // Withdrawn and exceptional codes share a shape; it shows their sum, not the last writer.
      m.set(id, prev ? { ...prev, value: prev.value + d.value } : d);
    }
    return m;
  }, [data]);

  const max = useMemo(() => Math.max(0, ...data.map((d) => d.value || 0)), [data]);

  const shapes = useMemo(() => {
    if (!topo) return [];
    const arcs = topo.arcs.map((a) => decodeArc(a, topo.transform));
    return topo.objects.countries.geometries.map((g) => ({
      id: g.id ?? '',
      name: g.properties?.name ?? '',
      d: geometryPath(g, arcs),
    })).filter((s) => s.d);
  }, [topo]);

  if (error) {
    return (
      <div className="rounded-sm border border-hairline bg-surface-sunken px-3 py-6 text-center text-xs text-muted-foreground">
        The map could not be drawn ({error}). The country table below is unaffected.
      </div>
    );
  }
  if (!topo) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading the map…
      </div>
    );
  }

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        role="img"
        aria-label={`World map of ${unit} by country`}
        onMouseLeave={() => setHover(null)}
      >
        {shapes.map((s) => {
          const d = byTopoId.get(s.id);
          const v = d?.value ?? 0;
          // Square-rooted: one home market holds most of the traffic, and a linear ramp would
          // render every other country as the same near-empty grey.
          const t = max > 0 && v > 0 ? 0.18 + 0.82 * Math.sqrt(v / max) : 0;
          const name = d ? countryName(d.code, d.label ?? s.name) : s.name;
          return (
            <path
              key={s.id || s.name}
              d={s.d}
              fill={t > 0 ? `hsl(var(--primary) / ${t.toFixed(3)})` : 'hsl(var(--muted))'}
              stroke="hsl(var(--hairline))"
              strokeWidth={0.4}
              className={d ? 'cursor-default' : undefined}
              onMouseEnter={() => setHover(d ? { code: d.code, name, value: v } : null)}
            >
              <title>{d ? `${name}: ${v.toLocaleString()} ${unit}` : name}</title>
            </path>
          );
        })}
      </svg>

      {/* A caption, not a floating tooltip: it cannot be clipped by the pane. */}
      <div className="mt-1 flex min-h-5 items-center gap-2 text-xs text-muted-foreground">
        {hover ? (
          <>
            <span aria-hidden="true">{countryFlag(hover.code)}</span>
            <span className="font-medium text-foreground">{hover.name}</span>
            <span className="tabular-nums">{hover.value.toLocaleString()} {unit}</span>
          </>
        ) : (
          <span>Hover a country for its {unit}.</span>
        )}
      </div>
    </div>
  );
};
