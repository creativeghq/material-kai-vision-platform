import { useMemo, useState } from 'react';
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
import { TileInstallationViewer } from '@/components/features/installation/TileInstallationViewer';
import {
  buildTileFloorPlan,
  DEFAULT_TILE_FLOOR,
  suggestBackButter,
  suggestedTrowelNotchMm,
  type TileFloorParams,
  type TilePattern,
} from '@/lib/installation/tileFloorTemplate';
import { formatNumber } from '@/utils/decimal';
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
  };
}

export default function TileInstallationPage() {
  const { user, session } = useAuth();
  const { quota } = useToolsQuota(session?.access_token ?? null);

  const [draft, setDraft] = useState<Draft>(() => toDraft(DEFAULT_TILE_FLOOR));
  const [pattern, setPattern] = useState<TilePattern>(DEFAULT_TILE_FLOOR.pattern);
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
      pattern,
      prime,
      backButter,
    };
  }, [draft, pattern, prime, backButter]);

  const plan = useMemo(() => buildTileFloorPlan(params), [params]);
  const colors = useMemo(() => ({ tile: tileColor, grout: groutColor }), [tileColor, groutColor]);

  const longSide = Math.max(params.tileLengthMm || 0, params.tileWidthMm || 0);
  const typicalNotch = suggestedTrowelNotchMm(longSide);
  const errors = plan.issues.filter((i) => i.level === 'error');
  const warnings = plan.issues.filter((i) => i.level === 'warning');
  const q = plan.quantities;

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
                  <Select value={pattern} onValueChange={(v) => setPattern(v as TilePattern)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="grid">Straight grid</SelectItem>
                      <SelectItem value="offset_third">One-third offset</SelectItem>
                      <SelectItem value="offset_half">Half offset (brick)</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
              </FormGrid>
              <Swatches label="Tile colour" options={TILE_COLORS} value={tileColor} onChange={setTileColor} />
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

            <FormSection title="Curing">
              <FormGrid>
                {field('adhesiveCureHours', 'Adhesive (h)')}
                {field('groutCureHours', 'Grout (h)')}
              </FormGrid>
            </FormSection>
          </CardContent>
        </Card>

        <div className="order-first min-w-0 space-y-4 lg:order-none">
          {errors.length > 0 ? (
            <Card>
              <CardContent className="space-y-1 p-4">
                {errors.map((e) => (
                  <p key={e.message} className="flex gap-2 text-sm text-destructive">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    {e.message}
                  </p>
                ))}
              </CardContent>
            </Card>
          ) : (
            <>
              <TileInstallationViewer plan={plan} colors={colors} />

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
                    <Row label={`Tiles to order (incl. ${q.wastePct}% for cuts and breakage)`} value={formatNumber(q.tilesToBuy)} />
                    <Row label="Pieces on the floor" value={`${q.fullTiles} full + ${q.cutTiles} cut`} />
                    <Row label={`Spacers (${params.jointMm} mm)`} value={formatNumber(q.spacers)} />
                    <Row label={`Tile adhesive (${params.trowelNotchMm} mm notch${backButter ? ', back-buttered' : ''})`} value={`≈ ${formatNumber(q.adhesiveKg, { maxDecimals: 0 })} kg`} />
                    <Row label={`Grout (${params.jointMm} mm joints)`} value={`≈ ${formatNumber(q.groutKg, { maxDecimals: 1 })} kg`} />
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
