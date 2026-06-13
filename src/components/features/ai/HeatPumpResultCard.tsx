/**
 * Inline AgentHub card for the `heat_pump_sizing` chunk emitted by the
 * calculate_heat_pump_sizing tool. Renders the same numbers the /tools/heat-pump
 * page shows, in a compact chat-friendly card.
 */

import { Flame, Info, Thermometer, Waves } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import type { HeatPumpSizingResult } from '@/lib/calculators/heatPumpSizing';

export function HeatPumpResultCard({ result }: { result: HeatPumpSizingResult }) {
  if (!result) return null;
  return (
    <Card className="dashboard-card border-primary/30 max-w-md">
      <CardContent className="p-4 space-y-3">
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-0.5">
            Recommended heat pump
          </div>
          <div className="text-3xl font-semibold text-primary tabular-nums">
            {result.recommendedRange.minKW}–{result.recommendedRange.maxKW}
            <span className="text-base text-muted-foreground ml-1">kW</span>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          <Row icon={Flame} label="Space-heating load" value={`${result.spaceHeatingKW} kW`} />
          {result.dhwKW > 0 && <Row icon={Waves} label="Hot-water allowance" value={`${result.dhwKW} kW`} />}
          <Row icon={Thermometer} label="Total design load" value={`${result.totalDesignKW} kW`} bold />
          <Row label="Effective specific load" value={`${result.effectiveWattsPerM2} W/m²`} muted />
          <Row label="Required flow temp" value={`${result.flowTempC} °C`} muted />
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">{result.emitterNote}</p>

        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-600 dark:text-amber-400 mb-1">
            <Info className="h-3 w-3" />
            First-pass estimate
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Not a substitute for a thermal-loss study (ΕΛΟΤ ΕΝ 12831 / ΤΟΤΕΕ 20701). Size close to the
            load — oversizing hurts COP.
          </p>
        </div>
      </CardContent>
    </Card>
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
