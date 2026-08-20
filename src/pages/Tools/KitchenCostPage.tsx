/**
 * Kitchen cost calculator (/tools/kitchen-cost) — anonymous lead-gen configurator.
 *
 * Same engine as the Project plan estimator, different skin. The kitchen itself is described
 * through the blueprint's ZONES — bottom units, top units, island, worktop — each with its own
 * globals (height, depth, door model) and a list of modules (kind × width × how many). Everything
 * the flat scope still needs (`run_length`, `wall_run_length`, `worktop_length`) is DERIVED from
 * that composition, so installation and handles keep pricing per metre off a real layout.
 *
 * Before this, the whole kitchen was three sliders and three hardcoded "Drawer unit N" option
 * groups, which is why it could never say four drawer banks, a wall unit count, or an island.
 *
 * The layout is derived from the blueprint, NOT hardcoded: zones come from `composition_schema`,
 * every remaining `option_group` becomes a single-choice control and every ungrouped task becomes
 * a switch. Re-price or restructure the "New Kitchen" starter in the admin and this page follows
 * without a deploy. Pricing is the shared blueprintCompute + blueprintComposition, so what a
 * visitor sees matches what the backend engine writes when the same blueprint reaches a project.
 *
 * Registered OUTSIDE <AuthGuard> in App.tsx — no login required. Sending the estimate is the
 * only metered write (Turnstile-gated); browsing and configuring are pure client-side math.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, CookingPot, Loader2, Ruler, Send, Sparkles } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Slider } from '@/components/core/ui/slider';
import { Textarea } from '@/components/core/ui/textarea';
import { TurnstileWidget, type TurnstileHandle } from '@/components/features/turnstile/TurnstileWidget';
import { QuantityStepper } from '@/components/features/blueprint/QuantityStepper';
import { ZoneConfigurator } from '@/components/features/blueprint/ZoneConfigurator';
import type { DimensionDef } from '@/services/blueprintsService';
import type { ProjectPlanItem } from '@/services/projectPlansService';
import { composeEstimate, repriceItems, seedPlanItems, subtotalOf } from '@/utils/blueprintCompute';
import { absorbedGroups, defaultComposition, deriveComposition, hasComposition } from '@/utils/blueprintComposition';
import { evaluateFormula } from '@/utils/blueprintFormula';
import type { Composition, ZoneDef } from '@/utils/blueprintComposition';
import { formatMoney } from '@/utils/decimal';
import { ToolsShell, useToolsQuota } from './toolsShared';

const KITCHEN_PROJECT_TYPE = 'kitchen_cabinets';

/** Mirrors the mobel-style "how many walls" question — pure lead context, never priced. */
const KITCHEN_SHAPES = [
  'One wall, a single run',
  'Two walls, one corner (L-shape)',
  'Two walls facing each other (galley)',
  'Three walls (U-shape)',
  'Open plan, corner + peninsula',
  'Open plan, corner + island',
  'Not sure yet',
];

interface RawItem {
  id: string; parent_id: string | null; sort_order: number; kind: 'section' | 'task';
  label: string; unit: string | null; quantity_formula: string | null; default_quantity: number;
  line_kind: string; material_cost: number | null; labor_rate: number | null; margin_pct: number;
  is_allowance: boolean; allowance_amount: number | null;
  option_group: string | null; tier: string | null; default_selected?: boolean;
}
interface Starter {
  id: string; title: string; description: string | null; project_type: string | null;
  dimensions_schema: DimensionDef[]; composition_schema: ZoneDef[];
  source_currency: string; items: RawItem[];
}

/** What a line WOULD add if picked. `line_total` is 0 while unselected, so it can't be used here. */
function previewTotal(it: ProjectPlanItem): number {
  if (it.is_allowance) return Number(it.allowance_amount ?? 0);
  return Number(it.unit_price ?? 0) * Number(it.quantity ?? 0);
}

/** What ONE of an extra costs. Its line total is rendered separately and would read as
 *  "Included" at quantity zero, which is the opposite of what a price list should say. */
function unitHint(it: ProjectPlanItem, currency: string): string {
  const each = Number(it.is_allowance ? (it.allowance_amount ?? 0) : (it.unit_price ?? 0));
  if (each === 0) return 'Included';
  return `${formatMoney(each, currency)}/${it.unit ?? 'unit'}`;
}

function priceHint(it: ProjectPlanItem, currency: string): string {
  const total = previewTotal(it);
  if (total === 0) return 'Included';
  if (it.is_allowance) return formatMoney(total, currency);
  return `${formatMoney(Number(it.unit_price ?? 0), currency)}/${it.unit ?? 'unit'} · ${formatMoney(total, currency)}`;
}

export default function KitchenCostPage() {
  const { session } = useAuth();
  // Only used for the Turnstile site key — configuring the kitchen costs nothing and is not metered.
  const { quota } = useToolsQuota(session?.access_token ?? null);

  const [starter, setStarter] = useState<Starter | null>(null);
  const [loading, setLoading] = useState(true);
  const [dims, setDims] = useState<Record<string, number>>({});
  const [composition, setComposition] = useState<Composition>({});
  const [items, setItems] = useState<ProjectPlanItem[]>([]);

  const currency = starter?.source_currency || 'EUR';
  const zones = useMemo(() => (starter?.composition_schema ?? []) as ZoneDef[], [starter]);
  const zoned = hasComposition(zones);

  // The zones publish run_length / wall_run_length / worktop_length, so the flat scope's per-metre
  // lines must be repriced against the DERIVED numbers, never the typed ones.
  const composed = useMemo(
    () => (starter ? composeEstimate(zones, composition, starter.items, dims, items) : null),
    [starter, zones, composition, dims, items],
  );
  const effectiveDims = composed?.dims ?? dims;
  const derived = composed?.derived ?? null;
  const subtotal = composed ? composed.subtotal : subtotalOf(items);

  useEffect(() => {
    supabase.functions
      .invoke('public-project-plan', { body: { action: 'starters' } })
      .then(({ data, error }) => {
        if (error) return;
        const list = (data?.starters ?? []) as Starter[];
        const kitchen = list.find((s) => s.project_type === KITCHEN_PROJECT_TYPE) ?? null;
        setStarter(kitchen);
        if (kitchen) {
          const schema = (kitchen.composition_schema ?? []) as ZoneDef[];
          const comp = defaultComposition(schema, kitchen.items, (z, i) => `${z}-${i}`);
          setComposition(comp);
          const d: Record<string, number> = {};
          for (const dim of kitchen.dimensions_schema ?? []) d[dim.key] = Number(dim.default ?? 0);
          // Seed the flat scope against the composition's metres — seeding against the schema
          // defaults would price installation on a run length nothing in the page agrees with.
          const seedDims = { ...d, ...deriveComposition(schema, comp, kitchen.items).vars };
          setDims(d);
          setItems(seedPlanItems(kitchen.items, seedDims, new Set(absorbedGroups(schema))));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  // Changing the composition changes the derived metres, so the flat scope reprices with it.
  const updateComposition = (next: Composition) => {
    setComposition(next);
    if (!starter) return;
    const nextDims = { ...dims, ...deriveComposition(zones, next, starter.items).vars };
    setItems((cur) => repriceItems(cur, nextDims));
  };

  const setDimension = (key: string, value: number) => {
    const next = { ...dims, [key]: value };
    setDims(next);
    setItems((cur) => repriceItems(cur, starter ? { ...next, ...deriveComposition(zones, composition, starter.items).vars } : next));
  };

  /** Single-select within an option_group. */
  const pickOption = (group: string, id: string) =>
    setItems((cur) =>
      repriceItems(cur.map((it) => (it.option_group === group ? { ...it, is_selected: it.id === id } : it)), effectiveDims),
    );

  /**
   * How many of an extra. Zero means none — one gesture sets both the count and whether the line is
   * in at all, so the two can never disagree the way a switch beside a quantity field would.
   */
  const setExtraQty = (id: string, qty: number) =>
    setItems((cur) => repriceItems(
      cur.map((it) => (it.id === id ? { ...it, quantity: Math.max(0, qty), is_selected: qty > 0 } : it)),
      effectiveDims,
    ));

  /** What the composition implies this quantity should be, if the line says so. */
  const suggestionFor = (it: ProjectPlanItem): number | null => {
    if (!it.suggests_quantity) return null;
    const r = evaluateFormula(it.suggests_quantity, effectiveDims);
    return r.ok ? r.value : null;
  };

  // A dimension a zone already derives must not also get a slider — see the Measurements card.
  const loneDimensions = useMemo(
    () => (starter?.dimensions_schema ?? []).filter((d) => !(d.key in (derived?.vars ?? {}))),
    [starter, derived],
  );

  // Layout comes from the blueprint's own shape, so an admin edit reflows the page.
  const sections = useMemo(() => {
    const secs = items.filter((i) => i.kind === 'section').sort((a, b) => a.sort_order - b.sort_order);
    return secs
      .map((sec) => {
        const tasks = items
          .filter((t) => t.kind === 'task' && t.parent_id === sec.id)
          .sort((a, b) => a.sort_order - b.sort_order);
        const groupNames = Array.from(new Set(tasks.filter((t) => t.option_group).map((t) => t.option_group as string)));
        return {
          id: sec.id,
          label: sec.label,
          groups: groupNames.map((name) => ({ name, members: tasks.filter((t) => t.option_group === name) })),
          // A schedule line is a COUNT, not a choice — rendering it as a switch would invite a
          // visitor to turn off the hinges their kitchen needs.
          extras: tasks.filter((t) => !t.option_group && !t.is_schedule),
          schedule: tasks.filter((t) => t.is_schedule && t.is_selected && Number(t.quantity ?? 0) > 0),
          total: tasks.filter((t) => t.is_selected).reduce((a, t) => a + Number(t.line_total || 0), 0),
        };
      })
      .filter((s) => s.groups.length > 0 || s.extras.length > 0 || s.schedule.length > 0);
  }, [items]);

  if (loading) {
    return (
      <ToolsShell>
        <div className="py-24 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      </ToolsShell>
    );
  }

  if (!starter) {
    return (
      <ToolsShell>
        <Card className="dashboard-card">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            The kitchen calculator is not available right now.
          </CardContent>
        </Card>
      </ToolsShell>
    );
  }

  return (
    <ToolsShell>
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center rounded-full bg-primary/10 p-3 mb-4">
          <CookingPot className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight mb-2">Kitchen cost calculator</h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Build your kitchen unit by unit — bottom cabinets, top cabinets, worktop, island — and pick
          your finishes. The price updates as you go. Free, instant, no sign-up needed.
        </p>
      </div>

      <div className="space-y-5">
        {/* ── The kitchen itself: zones, their globals and their units ─────── */}
        {zoned && (
          <ZoneConfigurator
            schema={zones}
            config={composition}
            rateItems={starter.items}
            derived={derived}
            currency={currency}
            onChange={updateComposition}
          />
        )}

        {/* ── Measurements ─────────────────────────────────────────────────────
            Only what the zones do NOT publish. Rendering a slider for `run_length`
            beside a zone that derives it gives two controls for one number, and the
            one you drag loses. */}
        {loneDimensions.length > 0 && (
        <Card className="dashboard-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Ruler className="h-4 w-4 text-primary" />
              Measurements
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Rough metres are fine — add up the walls the kitchen will run along.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            {loneDimensions.map((d) => {
              const value = dims[d.key] ?? Number(d.default ?? 0);
              const max = Math.max(20, Number(d.default ?? 0) * 3);
              return (
                <div key={d.key}>
                  <div className="flex items-baseline justify-between mb-2">
                    <Label className="text-sm">{d.label}</Label>
                    <span className="text-sm font-semibold tabular-nums">
                      {value} {d.unit ?? ''}
                    </span>
                  </div>
                  <Slider
                    value={[value]}
                    min={0}
                    max={max}
                    step={0.5}
                    onValueChange={([v]) => setDimension(d.key, v)}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
        )}

        {/* ── One card per blueprint section ───────────────────────────────── */}
        {sections.map((sec) => (
          <Card key={sec.id} className="dashboard-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">{sec.label}</CardTitle>
                {sec.total > 0 && (
                  <span className="text-sm font-semibold tabular-nums">{formatMoney(sec.total, currency)}</span>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {sec.groups.map((g) => {
                const selected = g.members.find((m) => m.is_selected) ?? null;
                // A short group reads better as cards; a long one (12 cabinet models) as a select.
                const asCards = g.members.length <= 3;
                return (
                  <div key={g.name}>
                    {sec.groups.length > 1 && (
                      <Label className="text-xs text-muted-foreground mb-2 block">{g.name}</Label>
                    )}
                    {asCards ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {g.members.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => pickOption(g.name, m.id)}
                            className={`rounded-xl border p-3 text-left transition ${
                              m.is_selected
                                ? 'border-primary bg-primary/[0.06]'
                                : 'border-border hover:border-primary/40 hover:bg-muted/30'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-sm font-medium">{m.label}</span>
                              {m.is_selected && <Check className="h-4 w-4 text-primary shrink-0" />}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">{priceHint(m, currency)}</div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <Select value={selected?.id ?? ''} onValueChange={(v) => pickOption(g.name, v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose an option" />
                        </SelectTrigger>
                        <SelectContent>
                          {g.members.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.label} — {priceHint(m, currency)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                );
              })}

              {sec.schedule.length > 0 && (
                <div className="divide-y divide-border/40">
                  {sec.schedule.map((row) => (
                    <div key={row.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="text-sm">{row.label}</span>
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {row.quantity} {row.unit ?? 'pcs'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {sec.extras.length > 0 && (
                <div className="divide-y divide-border/40">
                  {sec.extras.map((x) => {
                    const qty = Number(x.quantity ?? 0);
                    const on = !!x.is_selected && qty > 0;
                    const suggested = suggestionFor(x);
                    return (
                      <div key={x.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <div className="text-sm">{x.label}</div>
                          <div className="text-xs text-muted-foreground">{unitHint(x, currency)}</div>
                          {/* A mechanism that goes in a corner unit, in a kitchen with fewer corner
                              units than that. Said out loud, never enforced — you might leave one
                              corner as plain shelves, and that is your call to make. */}
                          {suggested != null && on && qty > suggested && (
                            <div className="text-xs text-primary mt-0.5">
                              {suggested === 0
                                ? 'Your layout has no corner units for this.'
                                : `Your layout has ${suggested} corner ${suggested === 1 ? 'unit' : 'units'}.`}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {on && (
                            <span className="text-sm tabular-nums w-20 text-right">
                              {formatMoney(Number(x.line_total ?? 0), currency)}
                            </span>
                          )}
                          <QuantityStepper
                            value={qty}
                            min={0}
                            label={x.label}
                            onChange={(next) => setExtraQty(
                              x.id,
                              // 0 -> 1 lands on what the layout implies, so configuring two corner
                              // units and switching on a Le Mans gives you two, not one.
                              next === 1 && qty === 0 && suggested != null ? Math.max(1, suggested) : next,
                            )}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {/* ── Running total + CTA ──────────────────────────────────────────── */}
        <Card className="dashboard-card sticky bottom-4 border-primary/30 shadow-lg">
          <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1">
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                Estimated total
              </div>
              <div className="text-2xl font-semibold tabular-nums">{formatMoney(subtotal, currency)}</div>
              <div className="text-[11px] text-muted-foreground">Excluding VAT · appliances and sink not included</div>
            </div>
            <SendEstimateDialog
              blueprintId={starter.id}
              dimensions={dims}
              composition={zoned ? composition : null}
              items={items}
              subtotal={subtotal}
              currency={currency}
              siteKey={quota?.turnstile_site_key ?? null}
            />
          </CardContent>
        </Card>

        <p className="text-[11px] text-muted-foreground text-center">
          Ballpark estimate using standard rates — your final price depends on the survey.
        </p>
      </div>
    </ToolsShell>
  );
}

// ── Lead capture ────────────────────────────────────────────────────────────

function SendEstimateDialog({
  blueprintId,
  dimensions,
  composition,
  items,
  subtotal,
  currency,
  siteKey,
}: {
  blueprintId: string;
  dimensions: Record<string, number>;
  composition: Composition | null;
  items: ProjectPlanItem[];
  subtotal: number;
  currency: string;
  siteKey: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [shape, setShape] = useState('');
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  const [token, setToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);

  const submit = async () => {
    if (!name.trim() || (!email.trim() && !phone.trim())) {
      setError('Please leave your name and either an email or a phone number.');
      return;
    }
    if (!token) {
      setError('Please complete the captcha first.');
      return;
    }
    setSending(true);
    setError(null);
    // Only the CHOICES travel — the composition is a SPEC (how many units of what kind, which
    // door model), never a price. The server re-prices it from the blueprint's own rates, so a
    // tampered client total can never become the recorded estimate.
    const { data, error: fnError } = await supabase.functions.invoke('public-project-plan', {
      body: {
        action: 'kitchen_lead',
        blueprint_id: blueprintId,
        dimensions,
        ...(composition ? { composition } : {}),
        selected_item_ids: items.filter((i) => i.kind === 'task' && i.is_selected).map((i) => i.id),
        contact: { name: name.trim(), email: email.trim(), phone: phone.trim(), shape, notes: notes.trim() },
        turnstile_token: token,
      },
    });
    setSending(false);
    setToken(null);
    turnstileRef.current?.reset();

    if (fnError || data?.success === false) {
      setError(data?.error === 'leads_unavailable'
        ? 'We cannot take estimates online right now — please call us instead.'
        : (data?.error || fnError?.message || 'Could not send the estimate. Please try again.'));
      return;
    }
    setReference(data?.reference ?? null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) { setError(null); setReference(null); }
      }}
    >
      <Button className="whitespace-nowrap gap-2" onClick={() => setOpen(true)}>
        <Send className="h-4 w-4" />
        Get this quoted
      </Button>
      <DialogContent className="sm:max-w-lg">
        {reference ? (
          <div className="py-6 text-center space-y-3">
            <div className="inline-flex rounded-full bg-primary/10 p-3">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <DialogTitle>Estimate sent</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Thanks — we have your configuration at {formatMoney(subtotal, currency)} and will come back
              to you with a firm quote.
            </p>
            <Badge variant="outline">Reference {reference}</Badge>
            <div>
              <Button variant="ghost" className="mt-2" onClick={() => setOpen(false)}>Close</Button>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Get this quoted</DialogTitle>
              <p className="text-sm text-muted-foreground">
                We will send your configuration ({formatMoney(subtotal, currency)}) to our team and come back
                with a firm price.
              </p>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="kc-name">Your name</Label>
                <Input id="kc-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="kc-email">Email</Label>
                  <Input id="kc-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="kc-phone">Phone</Label>
                  <Input id="kc-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Kitchen shape</Label>
                <Select value={shape} onValueChange={setShape}>
                  <SelectTrigger><SelectValue placeholder="How many walls will it run along?" /></SelectTrigger>
                  <SelectContent>
                    {KITCHEN_SHAPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="kc-notes">Anything else we should know?</Label>
                <Textarea id="kc-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              {siteKey && (
                <TurnstileWidget
                  ref={turnstileRef}
                  siteKey={siteKey}
                  action="kitchen_lead"
                  onVerify={setToken}
                  onExpired={() => setToken(null)}
                />
              )}
              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button className="w-full gap-2" disabled={sending} onClick={submit}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send my estimate
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">
                We use your details only to answer this enquiry.
              </p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
