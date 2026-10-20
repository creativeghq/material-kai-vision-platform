import React, { useMemo, useState } from 'react';
import { Play, TriangleAlert } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Input } from '@/components/core/ui/input';
import { FormField, FormGrid } from '@/components/core/ui/form-layout';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { PATTERNS, PATTERN_LABELS, type Pattern } from '@/lib/surfaceRenderer/patternVocabulary';
import {
  buildTileFloorPlan,
  suggestBackButter,
  suggestedTrowelNotchMm,
  type TileFloorParams,
} from '@/lib/installation/tileFloorTemplate';
import { solvePhotoCamera } from '@/lib/installation/photoCamera';
import { formatNumber } from '@/utils/decimal';
import type { VisualizerScene, VisualizerSurface, SurfaceProduct } from '@/services/visualizerService';
import { TileInstallationViewer, type RoomPhoto } from './TileInstallationViewer';

export interface TileInstallDesign {
  scene: VisualizerScene;
  surface: VisualizerSurface;
  product: SurfaceProduct;
  pattern: Pattern;
  groutWidthMm: number;
  groutColorHex: string;
  rotationDeg: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  design: TileInstallDesign | null;
}

const clampJoint = (mm: number) => Math.min(20, Math.max(1, Math.round(mm * 2) / 2 || 3));

export const TileInstallStudioDialog: React.FC<Props> = ({ open, onOpenChange, design }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
        {design && open ? <Studio key={`${design.scene.id}-${design.surface.key}-${design.product.id}`} design={design} /> : null}
      </DialogContent>
    </Dialog>
  );
};

function Studio({ design }: { design: TileInstallDesign }) {
  const { scene, surface, product } = design;
  const tex = product.texture;
  const [pattern, setPattern] = useState<Pattern>(design.pattern);
  const [rotationDeg, setRotationDeg] = useState(design.rotationDeg);
  const [joint, setJoint] = useState(String(clampJoint(design.groutWidthMm)));
  const [thickness, setThickness] = useState('10');
  const [run, setRun] = useState(0);

  const lengthMm = Math.round(Math.max(tex.tileWidthM, tex.tileLengthM) * 1000);
  const widthMm = Math.round(Math.min(tex.tileWidthM, tex.tileLengthM) * 1000);
  const params: TileFloorParams = useMemo(() => ({
    areaWidthM: surface.width_cm / 100,
    areaDepthM: surface.depth_cm / 100,
    tileLengthMm: lengthMm,
    tileWidthMm: widthMm,
    tileThicknessMm: Number(thickness) || 10,
    jointMm: Number(joint) || 3,
    perimeterGapMm: 5,
    trowelNotchMm: suggestedTrowelNotchMm(lengthMm),
    pattern,
    rotationDeg,
    anchor: 'corner',
    prime: true,
    backButter: suggestBackButter(lengthMm),
    adhesiveCureHours: 24,
    groutCureHours: 24,
  }), [surface.width_cm, surface.depth_cm, lengthMm, widthMm, thickness, joint, pattern, rotationDeg]);
  const plan = useMemo(() => buildTileFloorPlan(params), [params]);

  const photo: RoomPhoto | null = useMemo(() => {
    const quad = surface.quad.map((p) => ({ x: p.x * scene.width_px, y: p.y * scene.height_px })) as [
      { x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number },
    ];
    const camera = surface.kind === 'floor' || surface.kind === 'outdoor'
      ? solvePhotoCamera(quad, scene.width_px, scene.height_px, surface.width_cm / 100, surface.depth_cm / 100)
      : null;
    return camera ? { url: scene.imageUrl, width: scene.width_px, height: scene.height_px, camera, maskUrl: surface.maskUrl } : null;
  }, [scene, surface]);

  const errors = plan.issues.filter((i) => i.level === 'error');
  const warnings = plan.issues.filter((i) => i.level === 'warning');
  const q = plan.quantities;

  return (
    <>
      <DialogHeader>
        <DialogTitle>See it installed — {product.name}</DialogTitle>
        <DialogDescription>
          {scene.name} · {formatNumber(surface.width_cm / 100, { maxDecimals: 2 })} × {formatNumber(surface.depth_cm / 100, { maxDecimals: 2 })} m ·
          {' '}{widthMm === lengthMm ? `${lengthMm} × ${widthMm}` : `${widthMm} × ${lengthMm}`} mm tiles{tex.formatSource === 'default' ? ' (size assumed — the product records none)' : ''} · {PATTERN_LABELS[pattern]}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="space-y-3">
          <FormField label="Pattern">
            <Select value={pattern} onValueChange={(v) => setPattern(v as Pattern)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PATTERNS.map((p) => <SelectItem key={p} value={p}>{PATTERN_LABELS[p]}</SelectItem>)}</SelectContent>
            </Select>
          </FormField>
          <FormGrid>
            <FormField label="Rotation (°)"><Input type="number" step={15} value={rotationDeg} onChange={(e) => setRotationDeg(Number(e.target.value) || 0)} /></FormField>
            <FormField label="Joint (mm)"><Input type="number" step={0.5} value={joint} onChange={(e) => setJoint(e.target.value)} /></FormField>
          </FormGrid>
          <FormField label="Tile thickness (mm)"><Input type="number" value={thickness} onChange={(e) => setThickness(e.target.value)} /></FormField>
          <Button className="w-full gap-1.5" onClick={() => setRun((r) => r + 1)} disabled={errors.length > 0}>
            <Play className="h-4 w-4" />Play the installation
          </Button>
          {!photo && (
            <p className="text-xs text-muted-foreground">This surface is not a floor marked on the photo, so the installation is shown in 3D only.</p>
          )}
          <dl className="divide-y divide-hairline rounded-sm border border-hairline text-sm">
            <Row label="Pieces" value={`${q.fullTiles} full + ${q.cutTiles} cut`} />
            <Row label={`Tiles (+${q.sparePct}% spare)`} value={formatNumber(q.tilesToBuy)} />
            <Row label="Spacers" value={formatNumber(q.spacers)} />
            <Row label="Adhesive" value={`≈ ${formatNumber(q.adhesiveKg, { maxDecimals: 0 })} kg`} />
            <Row label="Grout" value={`≈ ${formatNumber(q.groutKg, { maxDecimals: 1 })} kg`} />
          </dl>
          <p className="text-[11px] text-muted-foreground">Adhesive and grout use typical coverage; the figures on the product's bag take precedence.</p>
        </div>

        <div className="min-w-0 space-y-3">
          {errors.map((e) => (
            <p key={e.message} className="flex gap-2 text-sm text-destructive"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />{e.message}</p>
          ))}
          {warnings.map((w) => (
            <p key={w.message} className="flex gap-2 text-xs text-amber-800 dark:text-amber-300"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{w.message}</p>
          ))}
          {errors.length === 0 && (
            <TileInstallationViewer
              key={run}
              plan={plan}
              colors={{ tile: '#d8d6d2', grout: design.groutColorHex }}
              tileImageUrl={tex.url}
              photo={photo}
              autoPlay={run > 0}
            />
          )}
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{value}</dd>
    </div>
  );
}
