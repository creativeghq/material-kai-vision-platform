/**
 * Heat-pump sizer tool (/tools/heat-pump)
 *
 * Pure client-side calculator — no backend, no quota, no captcha. Runs the
 * canonical estimator in src/lib/calculators/heatPumpSizing.ts live as the
 * user edits inputs. The same estimator backs the agent tool
 * `calculate_heat_pump_sizing`.
 */

import { useMemo, useState } from 'react';
import { Flame, Info, Thermometer, Waves } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Switch } from '@/components/core/ui/switch';
import { Separator } from '@/components/core/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import {
  computeHeatPumpSizing,
  EMITTER_OPTIONS,
  GLAZING_OPTIONS,
  INSULATION_OPTIONS,
  ZONE_OPTIONS,
  type ClimateZone,
  type EmitterType,
  type GlazingExposure,
  type InsulationLevel,
} from '@/lib/calculators/heatPumpSizing';
import { QuotaBadge, ToolsShell, useToolsQuota } from './toolsShared';
import { useAuth } from '@/contexts/AuthContext';

export default function HeatPumpToolPage() {
  const { user, session } = useAuth();
  const { quota } = useToolsQuota(session?.access_token ?? null);

  const [floorArea, setFloorArea] = useState('100');
  const [ceiling, setCeiling] = useState('2.7');
  const [insulation, setInsulation] = useState<InsulationLevel>('medium');
  const [zone, setZone] = useState<ClimateZone>('C');
  const [emitter, setEmitter] = useState<EmitterType>('underfloor');
  const [glazing, setGlazing] = useState<GlazingExposure>('normal');
  const [includeDhw, setIncludeDhw] = useState(false);
  const [occupants, setOccupants] = useState('3');

  const [advanced, setAdvanced] = useState(false);
  const [designTemp, setDesignTemp] = useState('');

  const result = useMemo(() => {
    const area = parseFloat(floorArea);
    if (!area || area <= 0) return null;
    const overrideTemp = advanced && designTemp.trim() !== '' ? parseFloat(designTemp) : undefined;
    return computeHeatPumpSizing({
      floorAreaM2: area,
      ceilingHeightM: parseFloat(ceiling) || undefined,
      insulationLevel: insulation,
      climateZone: zone,
      designOutdoorTempC: Number.isFinite(overrideTemp as number) ? overrideTemp : undefined,
      emitter,
      glazingExposure: glazing,
      includeDhw,
      occupants: parseInt(occupants, 10) || 1,
    });
  }, [floorArea, ceiling, insulation, zone, emitter, glazing, includeDhw, occupants, advanced, designTemp]);

  return (
    <ToolsShell headerRight={<QuotaBadge quota={quota} isAuthenticated={!!user} />}>
      <div className="text-center mb-8">
        <h1 className="text-3xl font-semibold tracking-tight mb-2 flex items-center justify-center gap-2">
          <Thermometer className="h-6 w-6 text-primary" />
          Heat-pump sizer
        </h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          A first-pass estimate of the heat-pump capacity a space needs. Not a substitute for a full
          thermal-loss study (EN 12831 / TOTEE 20701) — but a fast, honest starting point.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Inputs */}
        <Card className="dashboard-card lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Space details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="area">Heated area (m²)</Label>
                <Input id="area" type="number" inputMode="decimal" min={1} value={floorArea} onChange={(e) => setFloorArea(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="ceiling">Ceiling height (m)</Label>
                <Input id="ceiling" type="number" inputMode="decimal" min={1.8} step={0.1} value={ceiling} onChange={(e) => setCeiling(e.target.value)} />
              </div>
            </div>

            <div>
              <Label>Insulation / building era</Label>
              <Select value={insulation} onValueChange={(v) => setInsulation(v as InsulationLevel)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INSULATION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label} <span className="text-muted-foreground">· {o.hint}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Climate zone</Label>
                <Select value={zone} onValueChange={(v) => setZone(v as ClimateZone)} disabled={advanced && designTemp.trim() !== ''}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ZONE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Glazing / exposure</Label>
                <Select value={glazing} onValueChange={(v) => setGlazing(v as GlazingExposure)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GLAZING_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Heat-emission system</Label>
              <Select value={emitter} onValueChange={(v) => setEmitter(v as EmitterType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EMITTER_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Label htmlFor="dhw" className="cursor-pointer">Include domestic hot water</Label>
                <p className="text-xs text-muted-foreground">Adds a combined DHW allowance per occupant.</p>
              </div>
              <Switch id="dhw" className="shrink-0" checked={includeDhw} onCheckedChange={setIncludeDhw} />
            </div>
            {includeDhw && (
              <div className="w-full sm:w-1/2">
                <Label htmlFor="occupants">Occupants</Label>
                <Input id="occupants" type="number" inputMode="numeric" min={1} value={occupants} onChange={(e) => setOccupants(e.target.value)} />
              </div>
            )}

            <Separator />

            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Label htmlFor="advanced" className="cursor-pointer">Advanced: exact design temperature</Label>
                <p className="text-xs text-muted-foreground">Override the zone with the local TOTEE winter design temp.</p>
              </div>
              <Switch id="advanced" className="shrink-0" checked={advanced} onCheckedChange={setAdvanced} />
            </div>
            {advanced && (
              <div className="w-full sm:w-1/2">
                <Label htmlFor="design-temp">Design outdoor temp (°C)</Label>
                <Input id="design-temp" type="number" inputMode="decimal" placeholder="e.g. -4" value={designTemp} onChange={(e) => setDesignTemp(e.target.value)} />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Result */}
        <div className="lg:col-span-2 space-y-4">
          {result ? (
            <>
              <Card className="dashboard-card border-primary/30">
                <CardContent className="p-5 text-center">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-1">
                    Recommended heat pump
                  </div>
                  <div className="text-4xl font-semibold text-primary tabular-nums">
                    {result.recommendedRange.minKW}–{result.recommendedRange.maxKW}
                    <span className="text-lg text-muted-foreground ml-1">kW</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Nominal output at the design point. Size close to the load — oversizing hurts COP.
                  </p>
                </CardContent>
              </Card>

              <Card className="dashboard-card">
                <CardContent className="p-5 space-y-3 text-sm">
                  <Row icon={Flame} label="Space-heating load" value={`${result.spaceHeatingKW} kW`} />
                  {includeDhw && <Row icon={Waves} label="Hot-water allowance" value={`${result.dhwKW} kW`} />}
                  <Row icon={Thermometer} label="Total design load" value={`${result.totalDesignKW} kW`} bold />
                  <Separator />
                  <Row label="Effective specific load" value={`${result.effectiveWattsPerM2} W/m²`} muted />
                  <Row label="Required flow temp" value={`${result.flowTempC} °C`} muted />
                  <p className="text-xs text-muted-foreground leading-relaxed pt-1">{result.emitterNote}</p>
                  <p className="text-[11px] text-muted-foreground/80 leading-relaxed">{result.climateBasis}</p>
                </CardContent>
              </Card>

              <Card className="border-amber-500/30 bg-amber-500/5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-xs font-medium text-amber-600 dark:text-amber-400 mb-2">
                    <Info className="h-3.5 w-3.5" />
                    Before you order
                  </div>
                  <ul className="space-y-1.5 text-xs text-muted-foreground">
                    {result.caveats.map((c, i) => (
                      <li key={i} className="flex gap-1.5">
                        <span className="text-amber-500/70">·</span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="dashboard-card">
              <CardContent className="p-6 text-sm text-muted-foreground text-center">
                Enter a valid heated area to see the estimate.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </ToolsShell>
  );
}

function Row({
  icon: Icon,
  label,
  value,
  bold,
  muted,
}: {
  icon?: typeof Flame;
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={`flex items-center gap-2 ${muted ? 'text-muted-foreground' : ''}`}>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        {label}
      </span>
      <span className={`tabular-nums ${bold ? 'font-semibold' : ''}`}>{value}</span>
    </div>
  );
}
