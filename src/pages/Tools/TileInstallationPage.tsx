import { useEffect, useMemo, useRef, useState } from 'react';
import { Grid3x3, TriangleAlert } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import { Switch } from '@/components/core/ui/switch';
import { Button } from '@/components/core/ui/button';
import { FormField, FormGrid, FormSection } from '@/components/core/ui/form-layout';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import { TileInstallationViewer, type RoomPhoto } from '@/components/features/installation/TileInstallationViewer';
import { RoomPhotoCorners, type CornerPoint } from '@/components/features/installation/RoomPhotoCorners';
import { solvePhotoCamera } from '@/lib/installation/photoCamera';
import {
  buildTileFloorPlan,
  DEFAULT_TILE_FLOOR,
  suggestBackButter,
  suggestedTrowelNotchMm,
  type TileFloorParams,
} from '@/lib/installation/tileFloorTemplate';
import { formatNumber } from '@/utils/decimal';
import { PATTERNS, PATTERN_LABELS, type Pattern } from '@/lib/surfaceRenderer/patternVocabulary';
import { useAuth } from '@/contexts/AuthContext';
import { QuotaBadge, ToolsShell, useToolsQuota } from './toolsShared';

const TILE_COLORS = [
  { label: 'Light grey', value: '#d8d6d2' },
  { label: 'Warm beige', value: '#d9c7a8' },
  { label: 'White', value: '#f1efea' },
  { label: 'Anthracite', value: '#4a4a4c' },
];

const GROUT_COLORS = [
  { label: 'Grey', value: '#8f8f8c' },
  { label: 'White', value: '#ecebe7' },
  { label: 'Beige', value: '#c8b593' },
  { label: 'Anthracite', value: '#3a3a3c' },
];

type NumericKey = {
  [K in keyof TileFloorParams]: TileFloorParams[K] extends number ? K : never;
}[keyof TileFloorParams];

type Draft = Record<NumericKey, string>;

function toDraft(p: TileFloorParams): Draft {
  return {
    areaWidthM: String(p.areaWidthM),
    areaDepthM: String(p.areaDepthM),
    tileLengthMm: String(p.tileLengthMm),
    tileWidthMm: String(p.tileWidthMm),
    tileThicknessMm: String(p.tileThicknessMm),
    jointMm: String(p.jointMm),
    perimeterGapMm: String(p.perimeterGapMm),
    trowelNotchMm: String(p.trowelNotchMm),
    adhesiveCureHours: String(p.adhesiveCureHours),
    groutCureHours: String(p.groutCureHours),
    rotationDeg: String(p.rotationDeg),
  };
}

export default function TileInstallationPage() {
  const { user, session } = useAuth();
  const { quota } = useToolsQuota(session?.access_token ?? null);

  const [draft, setDraft] = useState<Draft>(() => toDraft(DEFAULT_TILE_FLOOR));
  const [pattern, setPattern] = useState<Pattern>(DEFAULT_TILE_FLOOR.pattern);
  const [tileImage, setTileImage] = useState<string | null>(null);
  const tileInput = useRef<HTMLInputElement>(null);
  const roomInput = useRef<HTMLInputElement>(null);
  const [room, setRoom] = useState<{ url: string; width: number; height: number } | null>(null);
  const [corners, setCorners] = useState<CornerPoint[]>([]);
  const [editCorners, setEditCorners] = useState(true);
  useEffect(() => () => { if (room) URL.revokeObjectURL(room.url); }, [room]);
  const pickRoom = (file: File) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setRoom({ url, width: img.naturalWidth, height: img.naturalHeight });
      setCorners([]);
      setEditCorners(true);
    };
    img.src = url;
  };
  useEffect(() => () => { if (tileImage) URL.revokeObjectURL(tileImage); }, [tileImage]);
  const [prime, setPrime] = useState(DEFAULT_TILE_FLOOR.prime);
  const [backButter, setBackButter] = useState(DEFAULT_TILE_FLOOR.backButter);
  const [tileColor, setTileColor] = useState(TILE_COLORS[0].value);
  const [groutColor, setGroutColor] = useState(GROUT_COLORS[0].value);

  const params: TileFloorParams = useMemo(() => {
    const n = (k: NumericKey) => parseFloat(draft[k]);
    return {
      areaWidthM: n('areaWidthM'),
      areaDepthM: n('areaDepthM'),
      tileLengthMm: n('tileLengthMm'),
      tileWidthMm: n('tileWidthMm'),
      tileThicknessMm: n('tileThicknessMm'),
      jointMm: n('jointMm'),
      perimeterGapMm: n('perimeterGapMm'),
      trowelNotchMm: n('trowelNotchMm'),
      adhesiveCureHours: n('adhesiveCureHours'),
      groutCureHours: n('groutCureHours'),
      rotationDeg: Number.isFinite(n('rotationDeg')) ? n('rotationDeg') : 0,
      anchor: 'centre',
      pattern,
      prime,
      backButter,
    };
  }, [draft, pattern, prime, backButter]);

  const plan = useMemo(() => buildTileFloorPlan(params), [params]);
  const photo: RoomPhoto | null = useMemo(() => {
    if (!room || corners.length !== 4) return null;
    const quad = corners.map((c) => ({ x: c.x * room.width, y: c.y * room.height })) as [CornerPoint, CornerPoint, CornerPoint, CornerPoint];
    const camera = solvePhotoCamera(quad, room.width, room.height, params.areaWidthM, params.areaDepthM);
    return camera ? { url: room.url, width: room.width, height: room.height, camera } : null;
  }, [room, corners, params.areaWidthM, params.areaDepthM]);
  const colors = useMemo(() => ({ tile: tileColor, grout: groutColor }), [tileColor, groutColor]);

  const longSide = Math.max(params.tileLengthMm || 0, params.tileWidthMm || 0);
  const typicalNotch = suggestedTrowelNotchMm(longSide);
  const errors = plan.issues.filter((i) => i.level === 'error');
  const lastValid = useRef(plan);
  if (errors.length === 0) lastValid.current = plan;
  const shown = lastValid.current;
  const warnings = shown.issues.filter((i) => i.level === 'warning');
  const q = shown.quantities;

  const field = (k: NumericKey, label: string, step = '1') => (
    <FormField label={label}>
      <Input
        type="number"
        inputMode="decimal"
        step={step}
        value={draft[k]}
        onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
      />
    </FormField>
  );

  return (
    <ToolsShell wide headerRight={<QuotaBadge quota={quota} isAuthenticated={!!user} />}>
      <div className="mb-8 text-center">
        <h1 className="mb-2 flex items-center justify-center gap-2 text-3xl font-semibold tracking-tight">
          <Grid3x3 className="h-6 w-6 text-primary" />
          Tile installation guide
        </h1>
        <p className="mx-auto max-w-2xl text-muted-foreground">
          Enter your room and tile, and watch the floor go down step by step in 3D — setting out, adhesive,
          every tile, spacer and edge cut, then grout — with the materials you need.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Your floor</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <FormSection title="Room">
              <FormGrid>
                {field('areaWidthM', 'Width (m)', '0.1')}
                {field('areaDepthM', 'Depth (m)', '0.1')}
              </FormGrid>
            </FormSection>

            <FormSection title="Tile">
              <FormGrid>
                {field('tileLengthMm', 'Length (mm)')}
                {field('tileWidthMm', 'Width (mm)')}
                {field('tileThicknessMm', 'Thickness (mm)')}
                <FormField label="Pattern">
                  <Select value={pattern} onValueChange={(v) => setPattern(v as Pattern)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PATTERNS.map((p) => <SelectItem key={p} value={p}>{PATTERN_LABELS[p]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormField>
                {field('rotationDeg', 'Rotation (°)', '15')}
              </FormGrid>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Tile photo (optional)</p>
                <input
                  ref={tileInput}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setTileImage(URL.createObjectURL(file));
                  }}
                />
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => tileInput.current?.click()}>
                    {tileImage ? 'Change photo' : 'Use a photo of the tile'}
                  </Button>
                  {tileImage && (
                    <>
                      <img src={tileImage} alt="" className="h-8 w-8 rounded-sm border border-hairline object-cover" />
                      <Button type="button" variant="ghost" size="sm" onClick={() => setTileImage(null)}>Remove</Button>
                    </>
                  )}
                </div>
              </div>
              {!tileImage && <Swatches label="Tile colour" options={TILE_COLORS} value={tileColor} onChange={setTileColor} />}
            </FormSection>

            <FormSection title="Setting">
              <FormGrid>
                {field('jointMm', 'Joint (mm)', '0.5')}
                {field('perimeterGapMm', 'Wall gap (mm)')}
                <FormField
                  label="Trowel notch (mm)"
                  hint={
                    Number(draft.trowelNotchMm) !== typicalNotch && longSide > 0 ? (
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-xs"
                        onClick={() => setDraft((d) => ({ ...d, trowelNotchMm: String(typicalNotch) }))}
                      >
                        Use typical {typicalNotch} mm
                      </Button>
                    ) : undefined
                  }
                >
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={draft.trowelNotchMm}
                    onChange={(e) => setDraft((d) => ({ ...d, trowelNotchMm: e.target.value }))}
                  />
                </FormField>
              </FormGrid>
              <Swatches label="Grout colour" options={GROUT_COLORS} value={groutColor} onChange={setGroutColor} />
              <div className="space-y-2 pt-1">
                <ToggleRow label="Prime the floor first" checked={prime} onChange={setPrime} />
                <ToggleRow
                  label="Back-butter tiles"
                  hint={suggestBackButter(longSide) ? 'Recommended for tiles this large' : undefined}
                  checked={backButter}
                  onChange={setBackButter}
                />
              </div>
            </FormSection>

            <FormSection title="Your room (optional)" description="Put the floor into a photo of the real room.">
              <input
                ref={roomInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const file = e.target.files?.[0]; if (file) pickRoom(file); }}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => roomInput.current?.click()}>
                  {room ? 'Change room photo' : 'Use a photo of my room'}
                </Button>
                {room && corners.length === 4 && !editCorners && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEditCorners(true)}>Adjust the corners</Button>
                )}
                {room && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setRoom(null); setCorners([]); }}>Remove</Button>
                )}
              </div>
            </FormSection>

            <FormSection title="Curing">
              <FormGrid>
                {field('adhesiveCureHours', 'Adhesive (h)')}
                {field('groutCureHours', 'Grout (h)')}
              </FormGrid>
            </FormSection>
          </CardContent>
        </Card>

        <div className="order-first min-w-0 space-y-4 lg:order-none">
          {errors.length > 0 && (
            <Card>
              <CardContent className="space-y-1 p-4">
                {errors.map((e) => (
                  <p key={e.message} className="flex gap-2 text-sm text-destructive">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    {e.message}
                  </p>
                ))}
                <p className="text-xs text-muted-foreground">Showing your last valid floor until this is fixed.</p>
              </CardContent>
            </Card>
          )}
          {shown.steps.length > 0 && (
            <>
              {room && (editCorners || corners.length < 4) && (
                <Card>
                  <CardHeader>
                    <CardTitle>Mark the floor in your photo</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <RoomPhotoCorners url={room.url} corners={corners} onChange={setCorners} />
                    {corners.length === 4 && (
                      photo
                        ? <Button size="sm" onClick={() => setEditCorners(false)}>Show the tiles in my room</Button>
                        : <p className="text-sm text-destructive">Those four corners do not make a floor the camera could see. Click them in order, around the floor.</p>
                    )}
                  </CardContent>
                </Card>
              )}
              <TileInstallationViewer plan={shown} colors={colors} tileImageUrl={tileImage} photo={editCorners ? null : photo} />

              {warnings.length > 0 && (
                <Card>
                  <CardContent className="space-y-2 p-4">
                    {warnings.map((w) => (
                      <p key={w.message} className="flex gap-2 text-sm text-amber-800 dark:text-amber-300">
                        <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        {w.message}
                      </p>
                    ))}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>What you need</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Adhesive and grout use typical coverage; the figures on your product’s bag take precedence.
                  </p>
                </CardHeader>
                <CardContent className="p-0">
                  <dl className="divide-y divide-hairline text-sm">
                    <Row label="Floor area" value={`${formatNumber(q.areaM2, { maxDecimals: 2 })} m²`} />
                    <Row label={`Tiles to order (the layout uses ${q.tilesFromLayout}, plus ${q.sparePct}% spare)`} value={formatNumber(q.tilesToBuy)} />
                    <Row label="Pieces on the floor" value={`${q.fullTiles} full + ${q.cutTiles} cut`} />
                    <Row label={`Spacers (${shown.params.jointMm} mm)`} value={formatNumber(q.spacers)} />
                    <Row label={`Tile adhesive (${shown.params.trowelNotchMm} mm notch${shown.params.backButter ? ', back-buttered' : ''})`} value={`≈ ${formatNumber(q.adhesiveKg, { maxDecimals: 0 })} kg`} />
                    <Row label={`Grout (${shown.params.jointMm} mm joints)`} value={`≈ ${formatNumber(q.groutKg, { maxDecimals: 1 })} kg`} />
                  </dl>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </ToolsShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>
        {label}
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function Swatches({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ label: string; value: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            title={o.label}
            onClick={() => onChange(o.value)}
            className={`h-7 w-7 rounded-sm border ${value === o.value ? 'border-primary ring-2 ring-primary/40' : 'border-hairline'}`}
            style={{ backgroundColor: o.value }}
          >
            <span className="sr-only">{o.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
