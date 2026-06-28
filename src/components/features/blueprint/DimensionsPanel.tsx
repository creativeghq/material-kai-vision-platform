import React, { useEffect, useState } from 'react';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Card, CardContent } from '@/components/core/ui/card';
import { parseDecimalOr } from '@/utils/decimal';
import type { DimensionDef } from '@/services/blueprintsService';

/**
 * The few measurements that drive parametric rescale of a plan/blueprint.
 * Emits the full values map on change (debounced by the parent before it calls
 * the engine). Inputs are text (EU-decimal tolerant via parseDecimalOr).
 */
interface DimensionsPanelProps {
  schema: DimensionDef[];
  values: Record<string, number>;
  onChange: (values: Record<string, number>) => void;
  disabled?: boolean;
}

export function DimensionsPanel({ schema, values, onChange, disabled }: DimensionsPanelProps) {
  const [local, setLocal] = useState<Record<string, string>>({});

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const d of schema) next[d.key] = String(values[d.key] ?? d.default ?? 0);
    setLocal(next);
  }, [schema, values]);

  if (!schema?.length) return null;

  const commit = (key: string, raw: string) => {
    const num = parseDecimalOr(raw, values[key] ?? 0);
    onChange({ ...values, [key]: num });
  };

  return (
    <Card className="dashboard-card">
      <CardContent className="p-4">
        <div className="text-sm font-medium mb-3">Project measurements</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {schema.map((d) => (
            <div key={d.key} className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {d.label}{d.unit ? ` (${d.unit})` : ''}
              </Label>
              <Input
                inputMode="decimal"
                value={local[d.key] ?? ''}
                disabled={disabled}
                onChange={(e) => setLocal((s) => ({ ...s, [d.key]: e.target.value }))}
                onBlur={(e) => commit(d.key, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
