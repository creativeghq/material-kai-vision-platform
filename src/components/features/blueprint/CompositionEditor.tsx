/**
 * Blueprint zones editor — the admin side of the configurator.
 *
 * A zone is what the customer configures: bottom units, top units, an island, a worktop. This is
 * where you say what zones exist, what is GLOBAL to each (height, depth, which price list its door
 * model comes from) and what MODULE TYPES can go in it (1-door, 2-door, drawer bank) with how each
 * one is priced.
 *
 * Two rules worth knowing before you edit anything here:
 *
 *  - Binding a global to an option_group ABSORBS that group. Its rows stop being a choice of their
 *    own anywhere — they become this zone's rate table, and the zone owns the selection. That is
 *    what lets bottom and top units share one price list and still pick different finishes. Bind a
 *    group to nothing and it stays an ordinary pick-one line in the scope below.
 *  - `Publishes as` is the formula variable the zone's derived length appears under. Point it at
 *    the variable your per-metre task lines already use (`run_length`) and those lines keep working
 *    untouched, now fed by the real composition instead of a number somebody typed.
 *  - An APPLIANCES zone is priced by who supplies each row, not by what is in it. Anything the
 *    customer already owns costs nothing and still books its housing and its connections, so the
 *    two fields that matter most on an appliance are `Goes in` (which cabinet, checked against the
 *    layout) and `Needs` (sockets, water, waste, gas, duct — counted whoever buys the machine).
 *
 * `Yields` / `Needs` are the hardware and services bag, written as `key:n` pairs — `doors:2,
 * shelves:1` on a unit, `socket:1, water_in:1` on an appliance. They are what the schedule counts;
 * a key nothing consumes raises an issue rather than sitting at zero unnoticed.
 *
 * Read-only is enforced by the parent's `<fieldset disabled>`, same as BlueprintScope.
 */

import React from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Card, CardContent } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import { MoneyInput } from '@/components/core/ui/money-input';
import { Switch } from '@/components/core/ui/switch';
import type {
  AppliancePlacementDef,
  ApplianceTypeDef,
  ModuleOptionDef,
  ModuleTypeDef,
  Yields,
  ZoneDef,
  ZoneGlobalDef,
} from '@/utils/blueprintComposition';

export interface CompositionEditorProps {
  schema: ZoneDef[];
  /** Distinct option_group names in the blueprint — what a zone global can bind to. */
  optionGroups: string[];
  readOnly?: boolean;
  onChange: (next: ZoneDef[]) => void;
}

const selectClass = 'h-8 bg-transparent border border-border rounded px-1.5 text-xs min-w-0';
const keyify = (v: string) => v.replace(/[^a-zA-Z0-9_]/g, '_');

/** `{ doors: 2, shelves: 1 }` ⇄ `doors:2, shelves:1`. One text field for the whole counts bag. */
const formatYields = (y: Yields | undefined): string =>
  Object.entries(y ?? {}).filter(([, v]) => v != null).map(([k, v]) => `${k}:${v}`).join(', ');

const parseYields = (raw: string): Yields | undefined => {
  const out: Yields = {};
  for (const part of raw.split(',')) {
    const [key, value] = part.split(':').map((x) => x.trim());
    const n = Number(value);
    if (!key || !Number.isFinite(n) || n === 0) continue;
    out[keyify(key)] = n;
  }
  return Object.keys(out).length ? out : undefined;
};

export const CompositionEditor: React.FC<CompositionEditorProps> = ({
  schema, optionGroups, readOnly = false, onChange,
}) => {
  const [open, setOpen] = React.useState<Record<string, boolean>>({});

  const patchZone = (idx: number, patch: Partial<ZoneDef>) =>
    onChange(schema.map((z, i) => (i === idx ? { ...z, ...patch } : z)));

  const addZone = () =>
    onChange([...schema, {
      key: `zone_${schema.length + 1}`,
      label: 'New zone',
      kind: 'units',
      globals: [],
      modules: [],
    }]);

  const removeZone = (idx: number) => onChange(schema.filter((_, i) => i !== idx));

  const patchGlobal = (zi: number, gi: number, patch: Partial<ZoneGlobalDef>) =>
    patchZone(zi, { globals: (schema[zi].globals ?? []).map((g, i) => (i === gi ? { ...g, ...patch } : g)) });

  const patchModule = (zi: number, mi: number, patch: Partial<ModuleTypeDef>) =>
    patchZone(zi, { modules: (schema[zi].modules ?? []).map((m, i) => (i === mi ? { ...m, ...patch } : m)) });

  const patchOption = (zi: number, mi: number, oi: number, patch: Partial<ModuleOptionDef>) => {
    const mod = schema[zi].modules[mi];
    patchModule(zi, mi, { options: (mod.options ?? []).map((o, i) => (i === oi ? { ...o, ...patch } : o)) });
  };

  const patchAppliance = (zi: number, ai: number, patch: Partial<ApplianceTypeDef>) =>
    patchZone(zi, { appliances: (schema[zi].appliances ?? []).map((a, i) => (i === ai ? { ...a, ...patch } : a)) });

  const patchPlacement = (zi: number, ai: number, pi: number, patch: Partial<AppliancePlacementDef>) => {
    const app = (schema[zi].appliances ?? [])[ai];
    patchAppliance(zi, ai, { placements: (app.placements ?? []).map((p, i) => (i === pi ? { ...p, ...patch } : p)) });
  };

  /** Only a `units` zone can house an appliance — a worktop is not somewhere a fridge goes. */
  const unitZones = schema.filter((z) => z.kind === 'units');

  return (
    <Card className="dashboard-card">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Zones</div>
            <p className="text-xs text-muted-foreground">
              What the customer configures — units, their sizes and how many. Leave empty for a
              blueprint driven by typed measurements alone.
            </p>
          </div>
          {!readOnly && (
            <Button variant="outline" size="sm" onClick={addZone}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add zone
            </Button>
          )}
        </div>

        {schema.length === 0 && (
          <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
            No zones — this blueprint is configured by measurements only.
          </div>
        )}

        {schema.map((zone, zi) => {
          const expanded = open[zone.key] ?? true;
          return (
            <div key={zi} className="rounded-lg border border-border">
              <div className="flex flex-wrap items-center gap-2 px-2 py-2 bg-muted/30 rounded-t-lg">
                <button
                  type="button"
                  className="shrink-0 text-muted-foreground"
                  aria-label={expanded ? `Collapse ${zone.label}` : `Expand ${zone.label}`}
                  onClick={() => setOpen((s) => ({ ...s, [zone.key]: !expanded }))}
                >
                  {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <Input
                  className="h-8 w-32" value={zone.key} placeholder="key"
                  onChange={(e) => patchZone(zi, { key: keyify(e.target.value) })}
                />
                <Input
                  className="h-8 flex-1 min-w-[10rem] font-medium bg-transparent" value={zone.label} placeholder="label"
                  onChange={(e) => patchZone(zi, { label: e.target.value })}
                />
                <select
                  className={selectClass} value={zone.kind}
                  onChange={(e) => patchZone(zi, { kind: e.target.value as ZoneDef['kind'] })}
                >
                  <option value="units">Units</option>
                  <option value="surface">Surface</option>
                  <option value="appliances">Appliances</option>
                </select>
                <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  Optional
                  <Switch checked={!!zone.optional} onCheckedChange={(v) => patchZone(zi, { optional: v })} />
                </label>
                {zone.optional && (
                  <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    On by default
                    <Switch checked={!!zone.enabled_by_default} onCheckedChange={(v) => patchZone(zi, { enabled_by_default: v })} />
                  </label>
                )}
                {!readOnly && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Remove ${zone.label}`} onClick={() => removeZone(zi)}>
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                )}
              </div>

              {expanded && (
                <div className="p-2.5 space-y-3">
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      Publishes as
                      <Input
                        className="h-6 w-36" placeholder={`${zone.key}_length`} value={zone.length_var ?? ''}
                        onChange={(e) => patchZone(zi, { length_var: keyify(e.target.value) || undefined })}
                      />
                    </span>
                    <span className="flex items-center gap-1">
                      Count as
                      <Input
                        className="h-6 w-32" placeholder={`${zone.key}_units`} value={zone.count_var ?? ''}
                        onChange={(e) => patchZone(zi, { count_var: keyify(e.target.value) || undefined })}
                      />
                    </span>
                    {zone.kind === 'surface' && (
                      <>
                        <span className="flex items-center gap-1">
                          Length follows
                          <select
                            className={selectClass} value={zone.length_from ?? ''}
                            onChange={(e) => patchZone(zi, { length_from: e.target.value || undefined })}
                          >
                            <option value="">—</option>
                            {unitZones.map((z) => (
                              <option key={z.key} value={z.key}>{z.label}</option>
                            ))}
                          </select>
                        </span>
                        {/* …or from a seat count, which wins over the run. A breakfast bar is as
                            long as the people at it, and "how many eat here" is the answer the
                            customer actually has. */}
                        <span className="flex items-center gap-1">
                          or from seats
                          <select
                            className={selectClass} value={zone.seats?.global ?? ''}
                            onChange={(e) => patchZone(zi, {
                              seats: e.target.value
                                ? { cm_per_seat: 60, ...(zone.seats ?? {}), global: e.target.value }
                                : undefined,
                            })}
                          >
                            <option value="">—</option>
                            {(zone.globals ?? []).filter((g) => g.type === 'number').map((g) => (
                              <option key={g.key} value={g.key}>{g.label}</option>
                            ))}
                          </select>
                          {zone.seats && (
                            <>
                              <MoneyInput
                                className="h-6 w-14 text-right" aria-label="Centimetres per seat"
                                value={zone.seats.cm_per_seat ?? 60} displayDecimals={null}
                                onValueChange={(v) => patchZone(zi, { seats: { ...zone.seats!, cm_per_seat: v ?? 0 } })}
                              />cm each
                            </>
                          )}
                        </span>
                      </>
                    )}
                  </div>

                  {/* ── Globals ─────────────────────────────────────────────── */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">Applies to the whole zone</span>
                      {!readOnly && (
                        <Button
                          variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground"
                          onClick={() => patchZone(zi, {
                            globals: [...(zone.globals ?? []), { key: `g_${(zone.globals ?? []).length + 1}`, label: 'New setting', type: 'number', default: 0 }],
                          })}
                        >
                          <Plus className="h-3 w-3 mr-1" /> Add setting
                        </Button>
                      )}
                    </div>
                    {(zone.globals ?? []).map((g, gi) => (
                      <div key={gi} className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-background/40 px-2 py-1.5">
                        <Input className="h-7 w-28" value={g.key} placeholder="key" onChange={(e) => patchGlobal(zi, gi, { key: keyify(e.target.value) })} />
                        <Input className="h-7 flex-1 min-w-[8rem]" value={g.label} placeholder="label" onChange={(e) => patchGlobal(zi, gi, { label: e.target.value })} />
                        <select className={selectClass} value={g.type} onChange={(e) => patchGlobal(zi, gi, { type: e.target.value as ZoneGlobalDef['type'] })}>
                          <option value="number">Number</option>
                          <option value="option">Price list</option>
                          <option value="choice">Answer (no price)</option>
                        </select>
                        {g.type === 'number' ? (
                          <>
                            <Input className="h-7 w-16" value={g.unit ?? ''} placeholder="unit" onChange={(e) => patchGlobal(zi, gi, { unit: e.target.value || undefined })} />
                            <MoneyInput className="h-7 w-20 text-right" value={Number(g.default ?? 0)} displayDecimals={null} placeholder="default" onValueChange={(v) => patchGlobal(zi, gi, { default: v ?? 0 })} />
                          </>
                        ) : g.type === 'choice' ? (
                          <>
                            {/* Spec, not money: these answers are published as `<zone>_<key>_<value>`
                                flags a formula can multiply by, and nothing is absorbed. */}
                            <div className="flex-1 min-w-[12rem] space-y-1">
                              {(g.choices ?? []).map((c, ci) => (
                                <div key={ci} className="flex items-center gap-1.5">
                                  <Input
                                    className="h-6 w-24" value={c.value} placeholder="value"
                                    onChange={(e) => patchGlobal(zi, gi, { choices: (g.choices ?? []).map((x, i) => (i === ci ? { ...x, value: keyify(e.target.value) } : x)) })}
                                  />
                                  <Input
                                    className="h-6 flex-1" value={c.label} placeholder="label"
                                    onChange={(e) => patchGlobal(zi, gi, { choices: (g.choices ?? []).map((x, i) => (i === ci ? { ...x, label: e.target.value } : x)) })}
                                  />
                                  {!readOnly && (
                                    <Button
                                      variant="ghost" size="icon" className="h-6 w-6" aria-label={`Remove ${c.label}`}
                                      onClick={() => patchGlobal(zi, gi, { choices: (g.choices ?? []).filter((_, i) => i !== ci) })}
                                    >
                                      <Trash2 className="h-3 w-3 text-muted-foreground" />
                                    </Button>
                                  )}
                                </div>
                              ))}
                              {!readOnly && (
                                <Button
                                  variant="ghost" size="sm" className="h-6 text-[11px] text-muted-foreground"
                                  onClick={() => patchGlobal(zi, gi, { choices: [...(g.choices ?? []), { value: `v${(g.choices ?? []).length + 1}`, label: 'New answer' }] })}
                                >
                                  <Plus className="h-3 w-3 mr-1" /> Answer
                                </Button>
                              )}
                            </div>
                            <label className="flex items-center gap-1 text-[11px] text-muted-foreground whitespace-nowrap">
                              More than one
                              <Switch checked={!!g.multi} onCheckedChange={(v) => patchGlobal(zi, gi, { multi: v || undefined, default: undefined })} />
                            </label>
                          </>
                        ) : (
                          <>
                            <select
                              className={`${selectClass} flex-1 min-w-[9rem]`} value={g.option_group ?? ''}
                              onChange={(e) => patchGlobal(zi, gi, { option_group: e.target.value || undefined })}
                            >
                              <option value="">Choose a price list…</option>
                              {optionGroups.map((og) => <option key={og} value={og}>{og}</option>)}
                            </select>
                            <label className="flex items-center gap-1 text-[11px] text-muted-foreground whitespace-nowrap">
                              Sets the €/m
                              <Switch checked={!!g.is_rate_source} onCheckedChange={(v) => patchGlobal(zi, gi, { is_rate_source: v })} />
                            </label>
                          </>
                        )}
                        {!readOnly && (
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7" aria-label={`Remove ${g.label}`}
                            onClick={() => patchZone(zi, { globals: (zone.globals ?? []).filter((_, i) => i !== gi) })}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* ── Module types ────────────────────────────────────────── */}
                  {zone.kind === 'units' && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">Units that can go in it</span>
                        {!readOnly && (
                          <Button
                            variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground"
                            onClick={() => patchZone(zi, {
                              modules: [...(zone.modules ?? []), { key: `m_${(zone.modules ?? []).length + 1}`, label: 'New unit', default_width_cm: 60, price_mode: 'per_m' }],
                            })}
                          >
                            <Plus className="h-3 w-3 mr-1" /> Add unit type
                          </Button>
                        )}
                      </div>

                      {(zone.modules ?? []).map((m, mi) => (
                        <div key={mi} className="rounded-md border border-border/60 bg-background/40 px-2 py-1.5 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <Input className="h-7 w-24" value={m.key} placeholder="key" onChange={(e) => patchModule(zi, mi, { key: keyify(e.target.value) })} />
                            <Input className="h-7 flex-1 min-w-[8rem]" value={m.label} placeholder="label" onChange={(e) => patchModule(zi, mi, { label: e.target.value })} />
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              Width
                              <MoneyInput className="h-7 w-16 text-right" value={m.default_width_cm ?? 0} displayDecimals={null} onValueChange={(v) => patchModule(zi, mi, { default_width_cm: v ?? 0 })} />cm
                            </span>
                            <select className={selectClass} value={m.price_mode} onChange={(e) => patchModule(zi, mi, { price_mode: e.target.value as ModuleTypeDef['price_mode'] })}>
                              <option value="per_m">Per metre × zone rate</option>
                              <option value="per_piece">Flat price each</option>
                            </select>
                            {m.price_mode === 'per_piece' && (
                              <MoneyInput
                                className="h-7 w-20 text-right" placeholder="price" value={m.unit_price}
                                onValueChange={(v) => patchModule(zi, mi, { unit_price: v ?? undefined })}
                              />
                            )}
                            {!readOnly && (
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7" aria-label={`Remove ${m.label}`}
                                onClick={() => patchZone(zi, { modules: (zone.modules ?? []).filter((_, i) => i !== mi) })}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-3 pl-1 text-[11px] text-muted-foreground">
                            <label className="flex items-center gap-1">
                              Adds to the run length
                              <Switch checked={m.counts_length !== false} onCheckedChange={(v) => patchModule(zi, mi, { counts_length: v })} />
                            </label>
                            <label className="flex items-center gap-1">
                              Fixed width
                              <Switch checked={!!m.fixed_width} onCheckedChange={(v) => patchModule(zi, mi, { fixed_width: v })} />
                            </label>
                            <span className="flex items-center gap-1">
                              Margin
                              <MoneyInput className="h-6 w-14 text-right" value={m.margin_pct ?? 0} displayDecimals={null} onValueChange={(v) => patchModule(zi, mi, { margin_pct: v ?? 0 })} />%
                            </span>
                            {/* What one piece is made of. Uncontrolled + onBlur: reformatting the
                                bag on every keystroke would eat the colon you are still typing. */}
                            <span className="flex items-center gap-1">
                              Yields
                              <Input
                                className="h-6 w-56" placeholder="doors:2, shelves:1, legs:4"
                                key={`${zone.key}-${m.key}-yields`}
                                defaultValue={formatYields(m.yields)}
                                onBlur={(e) => patchModule(zi, mi, { yields: parseYields(e.target.value) })}
                              />
                            </span>
                            {!readOnly && (
                              <Button
                                variant="ghost" size="sm" className="h-6 text-[11px]"
                                onClick={() => patchModule(zi, mi, {
                                  options: [...(m.options ?? []), { key: `o_${(m.options ?? []).length + 1}`, label: 'New choice', choices: [] }],
                                })}
                              >
                                <Plus className="h-3 w-3 mr-1" /> Add a per-unit choice
                              </Button>
                            )}
                          </div>

                          {/* Per-piece choices inside the unit — a runner set, a soft-close upgrade. */}
                          {(m.options ?? []).map((opt, oi) => (
                            <div key={oi} className="rounded border border-dashed border-border/70 p-1.5 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Input className="h-6 w-24" value={opt.key} placeholder="key" onChange={(e) => patchOption(zi, mi, oi, { key: keyify(e.target.value) })} />
                                <Input className="h-6 flex-1 min-w-[8rem]" value={opt.label} placeholder="label" onChange={(e) => patchOption(zi, mi, oi, { label: e.target.value })} />
                                {!readOnly && (
                                  <>
                                    <Button
                                      variant="ghost" size="sm" className="h-6 text-[11px] text-muted-foreground"
                                      onClick={() => patchOption(zi, mi, oi, { choices: [...(opt.choices ?? []), { value: `v${(opt.choices ?? []).length + 1}`, label: 'New value', price: 0 }] })}
                                    >
                                      <Plus className="h-3 w-3 mr-1" /> Value
                                    </Button>
                                    <Button
                                      variant="ghost" size="icon" className="h-6 w-6" aria-label={`Remove ${opt.label}`}
                                      onClick={() => patchModule(zi, mi, { options: (m.options ?? []).filter((_, i) => i !== oi) })}
                                    >
                                      <Trash2 className="h-3 w-3 text-muted-foreground" />
                                    </Button>
                                  </>
                                )}
                              </div>
                              {(opt.choices ?? []).map((c, ci) => (
                                <div key={ci} className="flex items-center gap-2 pl-2">
                                  <Input
                                    className="h-6 w-24" value={c.value} placeholder="value"
                                    onChange={(e) => patchOption(zi, mi, oi, { choices: (opt.choices ?? []).map((x, i) => (i === ci ? { ...x, value: e.target.value } : x)) })}
                                  />
                                  <Input
                                    className="h-6 flex-1" value={c.label} placeholder="label"
                                    onChange={(e) => patchOption(zi, mi, oi, { choices: (opt.choices ?? []).map((x, i) => (i === ci ? { ...x, label: e.target.value } : x)) })}
                                  />
                                  <MoneyInput
                                    className="h-6 w-20 text-right" value={c.price ?? 0} placeholder="price"
                                    onValueChange={(v) => patchOption(zi, mi, oi, { choices: (opt.choices ?? []).map((x, i) => (i === ci ? { ...x, price: v ?? 0 } : x)) })}
                                  />
                                  <label className="flex items-center gap-1 text-[11px] text-muted-foreground whitespace-nowrap">
                                    Default
                                    <Switch
                                      checked={opt.default === c.value}
                                      onCheckedChange={(v) => patchOption(zi, mi, oi, { default: v ? c.value : undefined })}
                                    />
                                  </label>
                                  {!readOnly && (
                                    <Button
                                      variant="ghost" size="icon" className="h-6 w-6" aria-label={`Remove ${c.label}`}
                                      onClick={() => patchOption(zi, mi, oi, { choices: (opt.choices ?? []).filter((_, i) => i !== ci) })}
                                    >
                                      <Trash2 className="h-3 w-3 text-muted-foreground" />
                                    </Button>
                                  )}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ── Appliances ──────────────────────────────────────────
                      Priced only when we supply the row. Everything else about an appliance —
                      the housing it needs and the connections it books — applies whoever bought
                      it, which is why `Goes in` and `Needs` sit next to the price rather than
                      behind it. */}
                  {zone.kind === 'appliances' && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">Appliances it can accommodate</span>
                        {!readOnly && (
                          <Button
                            variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground"
                            onClick={() => patchZone(zi, {
                              appliances: [...(zone.appliances ?? []), { key: `a_${(zone.appliances ?? []).length + 1}`, label: 'New appliance' }],
                            })}
                          >
                            <Plus className="h-3 w-3 mr-1" /> Add appliance
                          </Button>
                        )}
                      </div>

                      {(zone.appliances ?? []).map((a, ai) => (
                        <div key={ai} className="rounded-md border border-border/60 bg-background/40 px-2 py-1.5 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <Input className="h-7 w-24" value={a.key} placeholder="key" onChange={(e) => patchAppliance(zi, ai, { key: keyify(e.target.value) })} />
                            <Input className="h-7 flex-1 min-w-[8rem]" value={a.label} placeholder="label" onChange={(e) => patchAppliance(zi, ai, { label: e.target.value })} />
                            <select
                              className={`${selectClass} min-w-[9rem]`} value={a.option_group ?? ''}
                              onChange={(e) => patchAppliance(zi, ai, { option_group: e.target.value || undefined })}
                            >
                              <option value="">Flat price…</option>
                              {optionGroups.map((og) => <option key={og} value={og}>{og}</option>)}
                            </select>
                            {!a.option_group && (
                              <MoneyInput
                                className="h-7 w-20 text-right" placeholder="price" value={a.unit_price}
                                onValueChange={(v) => patchAppliance(zi, ai, { unit_price: v ?? undefined })}
                              />
                            )}
                            {!readOnly && (
                              <Button
                                variant="ghost" size="icon" className="h-7 w-7" aria-label={`Remove ${a.label}`}
                                onClick={() => patchZone(zi, { appliances: (zone.appliances ?? []).filter((_, i) => i !== ai) })}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-3 pl-1 text-[11px] text-muted-foreground">
                            <span className="flex items-center gap-1">
                              Aperture
                              <MoneyInput
                                className="h-6 w-16 text-right" value={a.width_cm} displayDecimals={null} placeholder="60"
                                onValueChange={(v) => patchAppliance(zi, ai, { width_cm: v ?? undefined })}
                              />cm
                            </span>
                            <span className="flex items-center gap-1">
                              Runs on
                              <Input
                                className="h-6 w-24" value={a.energy ?? ''} placeholder="electricity"
                                onChange={(e) => patchAppliance(zi, ai, { energy: keyify(e.target.value) || undefined })}
                              />
                            </span>
                            <span className="flex items-center gap-1">
                              Needs
                              <Input
                                className="h-6 w-56" placeholder="socket:1, water_in:1, waste_out:1"
                                key={`${zone.key}-${a.key}-requires`}
                                defaultValue={formatYields(a.requires)}
                                onBlur={(e) => patchAppliance(zi, ai, { requires: parseYields(e.target.value) })}
                              />
                            </span>
                            <label className="flex items-center gap-1">
                              Usually already owned
                              <Switch
                                checked={a.default_supply === 'existing'}
                                onCheckedChange={(v) => patchAppliance(zi, ai, { default_supply: v ? 'existing' : undefined })}
                              />
                            </label>
                            {!readOnly && (
                              <Button
                                variant="ghost" size="sm" className="h-6 text-[11px]"
                                onClick={() => patchAppliance(zi, ai, {
                                  placements: [...(a.placements ?? []), { value: `p${(a.placements ?? []).length + 1}`, label: 'New position' }],
                                })}
                              >
                                <Plus className="h-3 w-3 mr-1" /> Add a position
                              </Button>
                            )}
                          </div>

                          {/* Where it can go, and which cabinet has to be in the layout for it. */}
                          {(a.placements ?? []).map((p, pi) => {
                            const housingZone = schema.find((z) => z.key === p.housing?.zone);
                            return (
                              <div key={pi} className="flex flex-wrap items-center gap-1.5 rounded border border-dashed border-border/70 p-1.5">
                                <Input
                                  className="h-6 w-24" value={p.value} placeholder="value"
                                  onChange={(e) => patchPlacement(zi, ai, pi, { value: keyify(e.target.value) })}
                                />
                                <Input
                                  className="h-6 flex-1 min-w-[7rem]" value={p.label} placeholder="label"
                                  onChange={(e) => patchPlacement(zi, ai, pi, { label: e.target.value })}
                                />
                                <span className="text-[11px] text-muted-foreground">in</span>
                                <select
                                  className={selectClass} value={p.housing?.zone ?? ''}
                                  onChange={(e) => patchPlacement(zi, ai, pi, {
                                    housing: e.target.value ? { zone: e.target.value, module: '' } : undefined,
                                  })}
                                >
                                  <option value="">nothing in particular</option>
                                  {unitZones.map((z) => <option key={z.key} value={z.key}>{z.label}</option>)}
                                </select>
                                {p.housing && (
                                  <select
                                    className={selectClass} value={p.housing.module}
                                    onChange={(e) => patchPlacement(zi, ai, pi, { housing: { zone: p.housing!.zone, module: e.target.value } })}
                                  >
                                    <option value="">choose a unit…</option>
                                    {(housingZone?.modules ?? []).map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                                  </select>
                                )}
                                <MoneyInput
                                  className="h-6 w-20 text-right" value={p.price} placeholder="fitting"
                                  onValueChange={(v) => patchPlacement(zi, ai, pi, { price: v ?? undefined })}
                                />
                                {!readOnly && (
                                  <Button
                                    variant="ghost" size="icon" className="h-6 w-6" aria-label={`Remove ${p.label}`}
                                    onClick={() => patchAppliance(zi, ai, { placements: (a.placements ?? []).filter((_, i) => i !== pi) })}
                                  >
                                    <Trash2 className="h-3 w-3 text-muted-foreground" />
                                  </Button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
