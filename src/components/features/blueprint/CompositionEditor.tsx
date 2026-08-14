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
 *
 * Read-only is enforced by the parent's `<fieldset disabled>`, same as BlueprintScope.
 */

import React from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Card, CardContent } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import { Switch } from '@/components/core/ui/switch';
import type {
  ModuleOptionDef,
  ModuleTypeDef,
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
            <Button variant="outline" size="sm" className="rounded-full" onClick={addZone}>
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
                      <span className="flex items-center gap-1">
                        Length follows
                        <select
                          className={selectClass} value={zone.length_from ?? ''}
                          onChange={(e) => patchZone(zi, { length_from: e.target.value || undefined })}
                        >
                          <option value="">—</option>
                          {schema.filter((z) => z.kind === 'units').map((z) => (
                            <option key={z.key} value={z.key}>{z.label}</option>
                          ))}
                        </select>
                      </span>
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
                          <option value="option">Choice</option>
                        </select>
                        {g.type === 'number' ? (
                          <>
                            <Input className="h-7 w-16" value={g.unit ?? ''} placeholder="unit" onChange={(e) => patchGlobal(zi, gi, { unit: e.target.value || undefined })} />
                            <Input className="h-7 w-20 text-right" value={String(g.default ?? 0)} placeholder="default" onChange={(e) => patchGlobal(zi, gi, { default: Number(e.target.value) || 0 })} />
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
                              <Input className="h-7 w-16 text-right" value={String(m.default_width_cm ?? 0)} onChange={(e) => patchModule(zi, mi, { default_width_cm: Number(e.target.value) || 0 })} />cm
                            </span>
                            <select className={selectClass} value={m.price_mode} onChange={(e) => patchModule(zi, mi, { price_mode: e.target.value as ModuleTypeDef['price_mode'] })}>
                              <option value="per_m">Per metre × zone rate</option>
                              <option value="per_piece">Flat price each</option>
                            </select>
                            {m.price_mode === 'per_piece' && (
                              <Input
                                className="h-7 w-20 text-right" placeholder="price" value={m.unit_price != null ? String(m.unit_price) : ''}
                                onChange={(e) => patchModule(zi, mi, { unit_price: e.target.value === '' ? undefined : Number(e.target.value) })}
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
                              <Input className="h-6 w-14 text-right" value={String(m.margin_pct ?? 0)} onChange={(e) => patchModule(zi, mi, { margin_pct: Number(e.target.value) || 0 })} />%
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
                                  <Input
                                    className="h-6 w-20 text-right" value={String(c.price ?? 0)} placeholder="price"
                                    onChange={(e) => patchOption(zi, mi, oi, { choices: (opt.choices ?? []).map((x, i) => (i === ci ? { ...x, price: Number(e.target.value) || 0 } : x)) })}
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
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
