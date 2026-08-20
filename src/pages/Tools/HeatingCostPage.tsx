/**
 * Heating-cost comparison tool (/tools/heating-cost)
 *
 * Pure client-side calculator — faithful port of the operator's heating-method
 * cost spreadsheet. Compares annual running cost across 6 heating technologies
 * for the same dwelling. Same engine backs the agent tool
 * `calculate_heating_cost_comparison`.
 */

import { useMemo, useState } from 'react';
import { Flame, Snowflake, Trophy, Zap } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import { Separator } from '@/components/core/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import {
  computeHeatingCostComparison,
  type AcType,
  type HeatingMethodKey,
} from '@/lib/calculators/heatingCostComparison';
import { QuotaBadge, ToolsShell, useToolsQuota } from './toolsShared';
import { useAuth } from '@/contexts/AuthContext';
import { formatMoney, formatNumber } from '@/utils/decimal';

const METHOD_ICON: Record<HeatingMethodKey, typeof Flame> = {
  oil: Flame,
  gas: Flame,
  ac: Snowflake,
  heat_pump: Zap,
  energy_fireplace: Flame,
  non_energy_fireplace: Flame,
};

export default function HeatingCostPage() {
  const { user, session } = useAuth();
  const { quota } = useToolsQuota(session?.access_token ?? null);

  const [area, setArea] = useState('200');
  const [specific, setSpecific] = useState('132');
  const [elecPrice, setElecPrice] = useState('0.19');
  const [oilPrice, setOilPrice] = useState('1.246');
  const [gasPrice, setGasPrice] = useState('0.137');
  const [woodPrice, setWoodPrice] = useState('0.54');
  const [hpCop, setHpCop] = useState('4');
  const [acType, setAcType] = useState<AcType>('inverter');

  const result = useMemo(() => {
    const a = parseFloat(area);
    const s = parseFloat(specific);
    if (!a || a <= 0 || !s || s <= 0) return null;
    return computeHeatingCostComparison({
      floorAreaM2: a,
      specificEnergyKwhM2Yr: s,
      electricityPricePerKwh: parseFloat(elecPrice) || 0,
      oilPricePerLitre: parseFloat(oilPrice) || 0,
      gasPricePerKwh: parseFloat(gasPrice) || 0,
      woodPricePerKg: parseFloat(woodPrice) || 0,
      heatPumpCop: parseFloat(hpCop) || 4,
      acType,
    });
  }, [area, specific, elecPrice, oilPrice, gasPrice, woodPrice, hpCop, acType]);

  const maxCost = result ? Math.max(...result.methods.map((m) => m.annualCostEur)) : 0;

  return (
    <ToolsShell headerRight={<QuotaBadge quota={quota} isAuthenticated={!!user} />}>
      <div className="text-center mb-8">
        <h1 className="text-3xl font-semibold tracking-tight mb-2 flex items-center justify-center gap-2">
          <Flame className="h-6 w-6 text-primary" />
          Heating cost comparison
        </h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Compare the annual running cost of six heating methods for the same home. Enter the area and
          the building's energy intensity, adjust prices, and see which is cheapest.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Inputs */}
        <Card className="dashboard-card lg:col-span-2">
          <CardHeader>
            <CardTitle>Inputs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="area">Area (m²)</Label>
                <Input id="area" type="number" inputMode="decimal" min={1} value={area} onChange={(e) => setArea(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="specific">kWh/m²·yr</Label>
                <Input id="specific" type="number" inputMode="decimal" min={1} value={specific} onChange={(e) => setSpecific(e.target.value)} />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground -mt-2">
              Energy intensity from the building's energy performance certificate (PEA). Typical: ~40–60 well-insulated, ~70–90 partial, ~90–120 uninsulated.
            </p>

            <Separator />
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Unit prices</div>
            <div className="grid grid-cols-2 gap-4">
              <PriceInput id="elec" label="Electricity €/kWh" value={elecPrice} onChange={setElecPrice} />
              <PriceInput id="gas" label="Gas €/kWh" value={gasPrice} onChange={setGasPrice} />
              <PriceInput id="oil" label="Oil €/L" value={oilPrice} onChange={setOilPrice} />
              <PriceInput id="wood" label="Wood €/kg" value={woodPrice} onChange={setWoodPrice} />
            </div>

            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="hpcop">Heat-pump COP</Label>
                <Input id="hpcop" type="number" inputMode="decimal" min={1} step={0.1} value={hpCop} onChange={(e) => setHpCop(e.target.value)} />
              </div>
              <div>
                <Label>A/C type</Label>
                <Select value={acType} onValueChange={(v) => setAcType(v as AcType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inverter">Inverter (COP 3)</SelectItem>
                    <SelectItem value="simple">Basic (COP 2)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        <div className="lg:col-span-3 space-y-4">
          {result ? (
            <>
              <Card className="dashboard-card border-primary/30">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="rounded-full bg-primary/10 p-2.5">
                    <Trophy className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Cheapest method</div>
                    <div className="text-lg font-semibold">
                      {result.cheapest.label} ·{' '}
                      <span className="text-primary tabular-nums">{eur(result.cheapest.annualCostEur)}/yr</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="dashboard-card overflow-hidden">
                <CardContent className="p-0 divide-y divide-border/40">
                  {result.methods.map((m) => {
                    const Icon = METHOD_ICON[m.key];
                    const barPct = maxCost > 0 ? (m.annualCostEur / maxCost) * 100 : 0;
                    return (
                      <div key={m.key} className="p-3.5">
                        <div className="flex items-center gap-3">
                          <div className={`rounded-lg p-2 ${m.rank === 1 ? 'bg-primary/15' : 'bg-muted'}`}>
                            <Icon className={`h-4 w-4 ${m.rank === 1 ? 'text-primary' : 'text-muted-foreground'}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium truncate">{m.label}</span>
                              {m.rank === 1 && (
                                <Badge variant="outline" className="text-[10px] border-primary/40 text-primary h-5">
                                  best
                                </Badge>
                              )}
                              {m.pctVsCheapest > 0 && (
                                <span className="text-[11px] text-muted-foreground">+{m.pctVsCheapest}%</span>
                              )}
                            </div>
                            <div className="text-[11px] text-muted-foreground tabular-nums">
                              {formatNumber(m.unitsPerYear)} {m.unitLabel}/yr
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-base font-semibold tabular-nums">{eur(m.annualCostEur)}</div>
                            <div className="text-[10px] text-muted-foreground">per year</div>
                          </div>
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${m.rank === 1 ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Estimate based on {formatNumber(result.usefulDemandKwh)} kWh/yr useful demand
                ({formatNumber(result.deliveredEnergyKwh)} kWh delivered after distribution losses). Running
                cost only — excludes equipment purchase, installation and maintenance.
              </p>
            </>
          ) : (
            <Card className="dashboard-card">
              <CardContent className="p-6 text-sm text-muted-foreground text-center">
                Enter a valid area and energy intensity to compare methods.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </ToolsShell>
  );
}

function PriceInput({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Input id={id} type="number" inputMode="decimal" min={0} step={0.001} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function eur(v: number): string {
  try {
    return formatMoney(v, 'EUR', { decimals: 0, maxDecimals: 0 });
  } catch {
    return `€${Math.round(v)}`;
  }
}
