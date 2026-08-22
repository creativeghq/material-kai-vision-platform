/**
 * The zone configurator — where a kitchen is described as what it actually is.
 *
 * ONE renderer, used by the anonymous calculator (/tools/kitchen-cost) and by the project Plan
 * tab, so a visitor and a salesperson configure the same kitchen through the same controls and
 * arrive at the same number. Presentational: every edit is emitted through `onChange`, and the
 * money shown per row comes from the passed-in `derived` result — this file never prices anything
 * itself, because a second pricing path is how a configurator starts disagreeing with the quote.
 *
 * What a zone shows, top to bottom: its GLOBALS (height, depth, door model — the things true of
 * every unit in it), then its MODULE ROWS (kind × width × how many, plus per-module choices like
 * the drawer/runner set). A `surface` zone (worktop) has no modules — just its material and a
 * length that follows the run it sits on unless you override it.
 *
 * An `appliances` zone asks a different question per row, and the important one is not the price:
 * WHO SUPPLIES IT. "I already have a fridge-freezer" is the commonest answer on a kitchen survey
 * and it changes the money to zero while changing nothing at all about the aperture, the socket or
 * the tall housing it still has to go in — so the row keeps showing what it needs either way.
 */

import React from 'react';
import { Minus, Plus, Ruler, Trash2 } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Switch } from '@/components/core/ui/switch';
import { formatMoney, parseDecimalOr } from '@/utils/decimal';
import { rateChoices, yieldMeta, zoneEnabled } from '@/utils/blueprintComposition';
import type {
  ApplianceRow,
  ApplianceSupply,
  ApplianceTypeDef,
  Composition,
  DerivedComposition,
  ModuleTypeDef,
  RateItemLike,
  ZoneConfig,
  ZoneDef,
  ZoneModuleRow,
} from '@/utils/blueprintComposition';

export interface ZoneConfiguratorProps {
  schema: ZoneDef[];
  config: Composition;
  /** Rows the zone globals read their choices off — blueprint items, or a plan's frozen tables. */
  rateItems: RateItemLike[];
  derived: DerivedComposition | null;
  currency: string;
  readOnly?: boolean;
  onChange: (next: Composition) => void;
}

const newRowId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `row-${Date.now()}-${Math.random()}`);

/**
 * The two answers, in the customer's words. "I already have one" is not a discount — it is a
 * different sentence about the same appliance, and the row goes on showing the space and the
 * connections it needs regardless of which one is true.
 */
const SUPPLY_LABELS: Record<ApplianceSupply, string> = {
  ours: 'We supply',
  existing: 'I already have one',
};

export const ZoneConfigurator: React.FC<ZoneConfiguratorProps> = ({
  schema, config, rateItems, derived, currency, readOnly = false, onChange,
}) => {
  const patchZone = (key: string, patch: Partial<ZoneConfig>) =>
    onChange({ ...config, [key]: { ...(config[key] ?? {}), ...patch } });

  const setGlobal = (zoneKey: string, globalKey: string, value: number | string | string[]) => {
    const zone = config[zoneKey] ?? {};
    patchZone(zoneKey, { globals: { ...(zone.globals ?? {}), [globalKey]: value } });
  };

  const setRows = (zoneKey: string, rows: ZoneModuleRow[]) => patchZone(zoneKey, { modules: rows });

  const addRow = (zone: ZoneDef, mod: ModuleTypeDef) => {
    const rows = config[zone.key]?.modules ?? [];
    const options: Record<string, string> = {};
    for (const opt of mod.options ?? []) {
      const fallback = opt.default ?? opt.choices?.[0]?.value;
      if (fallback != null) options[opt.key] = fallback;
    }
    setRows(zone.key, [...rows, { id: newRowId(), type: mod.key, width_cm: mod.default_width_cm, qty: 1, options }]);
  };

  const patchRow = (zoneKey: string, rowId: string, patch: Partial<ZoneModuleRow>) =>
    setRows(zoneKey, (config[zoneKey]?.modules ?? []).map((r) => (r.id === rowId ? { ...r, ...patch } : r)));

  const removeRow = (zoneKey: string, rowId: string) =>
    setRows(zoneKey, (config[zoneKey]?.modules ?? []).filter((r) => r.id !== rowId));

  const setAppliances = (zoneKey: string, rows: ApplianceRow[]) => patchZone(zoneKey, { appliances: rows });

  const addAppliance = (zone: ZoneDef, def: ApplianceTypeDef) => {
    const options: Record<string, string> = {};
    for (const opt of def.options ?? []) {
      const fallback = opt.default ?? opt.choices?.[0]?.value;
      if (fallback != null) options[opt.key] = fallback;
    }
    const model = rateChoices(rateItems, def.option_group)[0];
    setAppliances(zone.key, [...(config[zone.key]?.appliances ?? []), {
      id: newRowId(),
      type: def.key,
      supply: def.default_supply ?? 'ours',
      qty: Math.max(1, Math.round(Number(def.default_qty ?? 1))),
      placement: def.placements?.[0]?.value,
      ...(model ? { model: model.id } : {}),
      options,
    }]);
  };

  const patchAppliance = (zoneKey: string, rowId: string, patch: Partial<ApplianceRow>) =>
    setAppliances(zoneKey, (config[zoneKey]?.appliances ?? []).map((r) => (r.id === rowId ? { ...r, ...patch } : r)));

  const removeAppliance = (zoneKey: string, rowId: string) =>
    setAppliances(zoneKey, (config[zoneKey]?.appliances ?? []).filter((r) => r.id !== rowId));

  /** Everything the derivation charged for one module row — the carcass line plus its options. */
  const rowTotal = (zoneKey: string, rowId: string) =>
    (derived?.lines ?? [])
      .filter((l) => l.key === `${zoneKey}:${rowId}` || l.key.startsWith(`${zoneKey}:${rowId}:`))
      .reduce((sum, l) => sum + Number(l.line_total || 0), 0);

  const zoneSummary = (zoneKey: string) => derived?.zones.find((z) => z.key === zoneKey) ?? null;

  if (!schema?.length) return null;

  return (
    <div className="space-y-5">
      {schema.map((zone) => {
        const cfg = config[zone.key] ?? {};
        const enabled = zoneEnabled(zone, cfg);
        const summary = zoneSummary(zone.key);
        const rows = cfg.modules ?? [];
        const modulesByKey: Record<string, ModuleTypeDef> = {};
        for (const m of zone.modules ?? []) modulesByKey[m.key] = m;
        const applianceRows = cfg.appliances ?? [];
        const appliancesByKey: Record<string, ApplianceTypeDef> = {};
        for (const a of zone.appliances ?? []) appliancesByKey[a.key] = a;

        return (
          <Card key={zone.key} className="dashboard-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-base">{zone.label}</CardTitle>
                  {enabled && summary && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {zone.kind === 'units'
                        ? `${summary.unit_count} ${summary.unit_count === 1 ? 'unit' : 'units'} · ${summary.length_m.toFixed(2)} m`
                        : zone.kind === 'appliances'
                          ? `${summary.unit_count} ${summary.unit_count === 1 ? 'appliance' : 'appliances'}`
                          : `${summary.length_m.toFixed(2)} m`}
                    </p>
                  )}
                  {zone.hint && <p className="text-xs text-muted-foreground mt-0.5">{zone.hint}</p>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {enabled && summary && summary.total > 0 && (
                    <span className="text-sm font-semibold tabular-nums">{formatMoney(summary.total, currency)}</span>
                  )}
                  {zone.optional && (
                    <Switch
                      checked={enabled}
                      disabled={readOnly}
                      aria-label={`Include ${zone.label}`}
                      onCheckedChange={(on) => patchZone(zone.key, { enabled: on })}
                    />
                  )}
                </div>
              </div>
            </CardHeader>

            {enabled && (
              <CardContent className="space-y-4">
                {/* Globals — what is true of every unit in this zone. */}
                {(zone.globals ?? []).length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {(zone.globals ?? []).map((g) => {
                      const value = cfg.globals?.[g.key];
                      if (g.type === 'number') {
                        return (
                          <div key={g.key} className="space-y-1">
                            <Label className="text-xs text-muted-foreground">
                              {g.label}{g.unit ? ` (${g.unit})` : ''}
                            </Label>
                            <Input
                              inputMode="decimal"
                              disabled={readOnly}
                              defaultValue={String(value ?? g.default ?? 0)}
                              onBlur={(e) => setGlobal(zone.key, g.key, parseDecimalOr(e.target.value, Number(g.default ?? 0)))}
                              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                            />
                          </div>
                        );
                      }
                      if (g.type === 'choice') {
                        const answers = g.choices ?? [];
                        const picked = Array.isArray(value)
                          ? value.map(String)
                          : (typeof value === 'string' && value ? [value] : []);
                        // A multi answer is a row of toggles rather than a multi-select: "we have
                        // electricity AND gas" is two facts about the property, and a control that
                        // shows one of them at a time hides the other behind a click.
                        if (g.multi) {
                          return (
                            <div key={g.key} className="space-y-1 sm:col-span-2">
                              <Label className="text-xs text-muted-foreground">{g.label}</Label>
                              <div className="flex flex-wrap gap-1.5">
                                {answers.map((c) => {
                                  const on = picked.includes(c.value);
                                  return (
                                    <Button
                                      key={c.value}
                                      type="button"
                                      size="sm"
                                      variant={on ? 'secondary' : 'outline'}
                                      aria-pressed={on}
                                      disabled={readOnly}
                                      onClick={() => setGlobal(
                                        zone.key,
                                        g.key,
                                        on ? picked.filter((v) => v !== c.value) : [...picked, c.value],
                                      )}
                                    >
                                      {c.label}
                                    </Button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div key={g.key} className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{g.label}</Label>
                            <Select
                              value={picked[0] ?? ''}
                              disabled={readOnly}
                              onValueChange={(v) => setGlobal(zone.key, g.key, v)}
                            >
                              <SelectTrigger><SelectValue placeholder={`Choose ${g.label.toLowerCase()}`} /></SelectTrigger>
                              <SelectContent>
                                {answers.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      }
                      const choices = rateChoices(rateItems, g.option_group);
                      return (
                        <div key={g.key} className="space-y-1">
                          <Label className="text-xs text-muted-foreground">{g.label}</Label>
                          <Select
                            value={typeof value === 'string' ? value : ''}
                            disabled={readOnly}
                            onValueChange={(v) => setGlobal(zone.key, g.key, v)}
                          >
                            <SelectTrigger><SelectValue placeholder={`Choose ${g.label.toLowerCase()}`} /></SelectTrigger>
                            <SelectContent>
                              {choices.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.label}{c.unit_price > 0 ? ` — ${formatMoney(c.unit_price, currency)}/${c.unit ?? 'm'}` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* A surface takes its length from the run it sits on — override only when it differs. */}
                {zone.kind === 'surface' && (
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <Ruler className="h-3 w-3" /> Length (m)
                      </Label>
                      <Input
                        className="w-32"
                        inputMode="decimal"
                        disabled={readOnly}
                        placeholder={summary ? summary.length_m.toFixed(2) : '0'}
                        defaultValue={cfg.length_m != null ? String(cfg.length_m) : ''}
                        onBlur={(e) => {
                          const raw = e.target.value.trim();
                          patchZone(zone.key, { length_m: raw === '' ? undefined : parseDecimalOr(raw, 0) });
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      />
                    </div>
                    {zone.length_from && cfg.length_m == null && (
                      <p className="text-xs text-muted-foreground pb-2.5">
                        Following the {schema.find((z) => z.key === zone.length_from)?.label.toLowerCase() ?? 'run'}. Type a length to override.
                      </p>
                    )}
                  </div>
                )}

                {/* Module rows. */}
                {zone.kind === 'units' && (
                  <div className="space-y-2">
                    {rows.length === 0 && (
                      <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                        No units yet — add the cabinets that go along this run.
                      </div>
                    )}

                    {rows.map((row) => {
                      const mod = modulesByKey[row.type];
                      if (!mod) return null;
                      const total = rowTotal(zone.key, row.id);
                      return (
                        <div key={row.id} className="rounded-lg border border-border/60 bg-background/40 p-2.5 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Select
                              value={row.type}
                              disabled={readOnly}
                              onValueChange={(v) => {
                                const next = modulesByKey[v];
                                patchRow(zone.key, row.id, {
                                  type: v,
                                  width_cm: next ? next.default_width_cm : row.width_cm,
                                  options: {},
                                });
                              }}
                            >
                              <SelectTrigger className="h-9 w-full sm:w-56"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {(zone.modules ?? []).map((m) => (
                                  <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            <div className="flex items-center gap-1">
                              <Input
                                className="h-9 w-20 text-right"
                                inputMode="numeric"
                                aria-label="Width in centimetres"
                                disabled={readOnly || mod.fixed_width}
                                defaultValue={String(row.width_cm)}
                                key={`${row.id}-${row.type}-w`}
                                onBlur={(e) => patchRow(zone.key, row.id, { width_cm: parseDecimalOr(e.target.value, mod.default_width_cm) })}
                                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                              />
                              <span className="text-xs text-muted-foreground">cm</span>
                            </div>

                            <div className="flex items-center gap-1">
                              <Button
                                type="button" variant="outline" size="icon" className="h-8 w-8"
                                disabled={readOnly || row.qty <= 1}
                                aria-label={`One fewer ${mod.label}`}
                                onClick={() => patchRow(zone.key, row.id, { qty: Math.max(1, row.qty - 1) })}
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </Button>
                              <span className="w-7 text-center text-sm tabular-nums">{row.qty}</span>
                              <Button
                                type="button" variant="outline" size="icon" className="h-8 w-8"
                                disabled={readOnly}
                                aria-label={`One more ${mod.label}`}
                                onClick={() => patchRow(zone.key, row.id, { qty: row.qty + 1 })}
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            </div>

                            <div className="ml-auto flex items-center gap-2">
                              <span className="text-sm tabular-nums">{formatMoney(total, currency)}</span>
                              {!readOnly && (
                                <Button
                                  type="button" variant="ghost" size="icon" className="h-8 w-8"
                                  aria-label={`Remove ${mod.label}`}
                                  onClick={() => removeRow(zone.key, row.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* Per-module choices — the runner set, a soft-close upgrade. */}
                          {(mod.options ?? []).length > 0 && (
                            <div className="flex flex-wrap gap-2 pl-0.5">
                              {(mod.options ?? []).map((opt) => (
                                <div key={opt.key} className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">{opt.label}</span>
                                  <Select
                                    value={row.options?.[opt.key] ?? opt.default ?? ''}
                                    disabled={readOnly}
                                    onValueChange={(v) =>
                                      patchRow(zone.key, row.id, { options: { ...(row.options ?? {}), [opt.key]: v } })}
                                  >
                                    <SelectTrigger className="h-8 w-56 text-xs"><SelectValue placeholder={opt.label} /></SelectTrigger>
                                    <SelectContent>
                                      {(opt.choices ?? []).map((c) => (
                                        <SelectItem key={c.value} value={c.value}>
                                          {c.label}{c.price ? ` — ${formatMoney(c.price, currency)}` : ''}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {!readOnly && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {(zone.modules ?? []).map((m) => (
                          <Button
                            key={m.key} type="button" variant="outline" size="sm"
                            onClick={() => addRow(zone, m)}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" />{m.label}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Appliance rows. */}
                {zone.kind === 'appliances' && (
                  <div className="space-y-2">
                    {applianceRows.length === 0 && (
                      <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                        Nothing listed yet — add every appliance that has to fit, including the ones
                        you already own.
                      </div>
                    )}

                    {applianceRows.map((row) => {
                      const def = appliancesByKey[row.type];
                      if (!def) return null;
                      const ours = row.supply !== 'existing';
                      const placements = def.placements ?? [];
                      const models = rateChoices(rateItems, def.option_group);
                      const line = derived?.appliances.find((a) => a.key === `${zone.key}:${row.id}`) ?? null;
                      const needs = Object.entries(line?.requires ?? {}).filter(([, v]) => v > 0);
                      return (
                        <div key={row.id} className="rounded-lg border border-border/60 bg-background/40 p-2.5 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Select
                              value={row.type}
                              disabled={readOnly}
                              onValueChange={(v) => {
                                const next = appliancesByKey[v];
                                const opts: Record<string, string> = {};
                                for (const opt of next?.options ?? []) {
                                  const fallback = opt.default ?? opt.choices?.[0]?.value;
                                  if (fallback != null) opts[opt.key] = fallback;
                                }
                                patchAppliance(zone.key, row.id, {
                                  type: v,
                                  placement: next?.placements?.[0]?.value,
                                  model: rateChoices(rateItems, next?.option_group)[0]?.id,
                                  options: opts,
                                });
                              }}
                            >
                              <SelectTrigger className="h-9 w-full sm:w-52"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {(zone.appliances ?? []).map((a) => (
                                  <SelectItem key={a.key} value={a.key}>{a.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            {/* Who is buying it. Two explicit answers rather than a switch, because
                                "off" would read as "no fridge" and the fridge is very much there. */}
                            <div className="flex items-center gap-1">
                              {(['ours', 'existing'] as ApplianceSupply[]).map((supply) => (
                                <Button
                                  key={supply}
                                  type="button"
                                  size="sm"
                                  variant={(supply === 'ours') === ours ? 'secondary' : 'outline'}
                                  aria-pressed={(supply === 'ours') === ours}
                                  disabled={readOnly}
                                  onClick={() => patchAppliance(zone.key, row.id, { supply })}
                                >
                                  {SUPPLY_LABELS[supply]}
                                </Button>
                              ))}
                            </div>

                            <div className="flex items-center gap-1">
                              <Button
                                type="button" variant="outline" size="icon" className="h-8 w-8"
                                disabled={readOnly || row.qty <= 1}
                                aria-label={`One fewer ${def.label}`}
                                onClick={() => patchAppliance(zone.key, row.id, { qty: Math.max(1, row.qty - 1) })}
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </Button>
                              <span className="w-7 text-center text-sm tabular-nums">{row.qty}</span>
                              <Button
                                type="button" variant="outline" size="icon" className="h-8 w-8"
                                disabled={readOnly}
                                aria-label={`One more ${def.label}`}
                                onClick={() => patchAppliance(zone.key, row.id, { qty: row.qty + 1 })}
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            </div>

                            <div className="ml-auto flex items-center gap-2">
                              <span className="text-sm tabular-nums">
                                {/* €0 for something the customer already owns is the right answer,
                                    not a missing one — say so rather than showing a bare 0.00. */}
                                {ours ? formatMoney(Number(line?.total ?? 0), currency) : 'Yours'}
                              </span>
                              {!readOnly && (
                                <Button
                                  type="button" variant="ghost" size="icon" className="h-8 w-8"
                                  aria-label={`Remove ${def.label}`}
                                  onClick={() => removeAppliance(zone.key, row.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                                </Button>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2 pl-0.5">
                            {placements.length > 0 && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Goes in</span>
                                <Select
                                  value={row.placement ?? placements[0].value}
                                  disabled={readOnly}
                                  onValueChange={(v) => patchAppliance(zone.key, row.id, { placement: v })}
                                >
                                  <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {placements.map((p) => (
                                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}

                            {/* A model list is only a question when we are the ones buying. */}
                            {ours && models.length > 0 && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Model</span>
                                <Select
                                  value={row.model ?? ''}
                                  disabled={readOnly}
                                  onValueChange={(v) => patchAppliance(zone.key, row.id, { model: v })}
                                >
                                  <SelectTrigger className="h-8 w-56 text-xs">
                                    <SelectValue placeholder="Choose a model" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {models.map((m) => (
                                      <SelectItem key={m.id} value={m.id}>
                                        {m.label}{m.unit_price > 0 ? ` — ${formatMoney(m.unit_price, currency)}` : ''}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}

                            {(def.options ?? []).map((opt) => (
                              <div key={opt.key} className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">{opt.label}</span>
                                <Select
                                  value={row.options?.[opt.key] ?? opt.default ?? ''}
                                  disabled={readOnly}
                                  onValueChange={(v) =>
                                    patchAppliance(zone.key, row.id, { options: { ...(row.options ?? {}), [opt.key]: v } })}
                                >
                                  <SelectTrigger className="h-8 w-52 text-xs"><SelectValue placeholder={opt.label} /></SelectTrigger>
                                  <SelectContent>
                                    {(opt.choices ?? []).map((c) => (
                                      <SelectItem key={c.value} value={c.value}>
                                        {c.label}{ours && c.price ? ` — ${formatMoney(c.price, currency)}` : ''}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ))}
                          </div>

                          {/* What it books. Shown on the row rather than only in the schedule,
                              because this is the moment somebody can still move the socket. */}
                          {needs.length > 0 && (
                            <p className="text-xs text-muted-foreground pl-0.5">
                              Needs {needs.map(([k, v]) => `${v} × ${yieldMeta(k).label.toLowerCase()}`).join(' · ')}
                            </p>
                          )}
                        </div>
                      );
                    })}

                    {!readOnly && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {(zone.appliances ?? []).map((a) => (
                          <Button
                            key={a.key} type="button" variant="outline" size="sm"
                            onClick={() => addAppliance(zone, a)}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1" />{a.label}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* Emptiness is ambiguous — say WHICH zone is unpriced rather than showing a confident 0. */}
      {(derived?.issues ?? []).length > 0 && (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground space-y-1">
          {derived!.issues.map((issue) => <div key={issue}>{issue}</div>)}
        </div>
      )}
    </div>
  );
};
