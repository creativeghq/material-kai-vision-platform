/**
 * Project plan estimator (/tools/project-plan) — anonymous lead-gen tool (#242).
 *
 * Value-first: pick a project type and the full organized scope of works (sections
 * + tasks) is shown immediately with prices computed from sensible defaults. A
 * couple of homeowner-friendly inputs (home size, bathrooms) sit inline and update
 * the total live; the technical measurements are tucked behind "Fine-tune details".
 *
 * The compute is PURE client-side math (shared blueprintFormula), so there's no
 * captcha and no quota — the breakdown just updates as you type. Sign up to import
 * the plan into your library, edit it with your own rates, and turn it into a quote.
 */

import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Loader2, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import { evaluateFormula, computeLinePricing, round2 } from '@/utils/blueprintFormula';
import { ToolsShell } from './toolsShared';

interface DimDef { key: string; label: string; unit?: string; default?: number }
interface Item {
  id: string; parent_id: string | null; sort_order: number; kind: 'section' | 'task';
  label: string; unit: string | null; quantity_formula: string | null; default_quantity: number;
  line_kind: string; material_cost: number | null; labor_rate: number | null; margin_pct: number;
  is_allowance: boolean; allowance_amount: number | null; option_group: string | null; tier: string | null;
}
interface Starter { id: string; title: string; description: string | null; project_type: string | null; dimensions_schema: DimDef[]; source_currency: string; items: Item[] }

// Homeowner-friendly fields shown up front; everything else is "Fine-tune".
const PRIMARY_KEYS = ['floor_area', 'n_bathrooms', 'n_rooms'];
const FRIENDLY_LABEL: Record<string, string> = { floor_area: 'Home size', n_bathrooms: 'Bathrooms', n_rooms: 'Rooms' };

const money = (v: number, currency: string) => {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(v); }
  catch { return `${currency} ${Math.round(v)}`; }
};

function computeBreakdown(items: Item[], dims: Record<string, number>) {
  const sections = items.filter((i) => i.kind === 'section').sort((a, b) => a.sort_order - b.sort_order);
  const optSel: Record<string, string> = {};
  for (const it of items) {
    if (it.kind !== 'task' || !it.option_group) continue;
    if (!optSel[it.option_group] || it.tier === 'good') optSel[it.option_group] = it.id;
  }
  const calc = (it: Item) => {
    const selected = it.option_group ? optSel[it.option_group] === it.id : true;
    let qty: number;
    if (it.quantity_formula && String(it.quantity_formula).trim()) {
      const r = evaluateFormula(it.quantity_formula, dims);
      qty = r.ok ? r.value : Number(it.default_quantity ?? 1);
    } else qty = Number(it.default_quantity ?? 1);
    qty = round2(qty);
    const { unit_price, line_total } = computeLinePricing({
      is_allowance: it.is_allowance, allowance_amount: it.allowance_amount,
      material_cost: it.material_cost, labor_rate: it.labor_rate, margin_pct: it.margin_pct,
      quantity: qty, is_selected: selected,
    });
    return { label: it.label, unit: it.unit, quantity: qty, unit_price, line_total, is_allowance: it.is_allowance, selected };
  };
  let subtotal = 0;
  const out = sections.map((s) => {
    const tasks = items.filter((i) => i.kind === 'task' && i.parent_id === s.id).sort((a, b) => a.sort_order - b.sort_order).map(calc).filter((t) => t.selected);
    const total = round2(tasks.reduce((a, t) => a + t.line_total, 0));
    subtotal += total;
    return { label: s.label, total, tasks };
  }).filter((s) => s.tasks.length > 0);
  return { sections: out, subtotal: round2(subtotal) };
}

export default function ProjectPlanPage() {
  const { user } = useAuth();
  const isAuthenticated = !!user;

  const [starters, setStarters] = useState<Starter[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [dims, setDims] = useState<Record<string, string>>({});
  const [showMore, setShowMore] = useState(false);

  const selected = useMemo(() => starters.find((s) => s.id === selectedId) ?? null, [starters, selectedId]);

  useEffect(() => {
    supabase.functions.invoke('public-project-plan', { body: { action: 'starters' } })
      .then(({ data, error }) => {
        if (error) return;
        const list = (data?.starters ?? []) as Starter[];
        const isFull = (s: Starter) => s.project_type === 'full_home_renovation';
        list.sort((a, b) => (isFull(a) ? 0 : 1) - (isFull(b) ? 0 : 1));
        setStarters(list);
        const preferred = list.find(isFull) ?? list[0];
        if (preferred) setSelectedId(preferred.id);
      })
      .finally(() => setLoading(false));
  }, []);

  // Reset dimension values to the blueprint's defaults whenever the type changes.
  useEffect(() => {
    if (!selected) return;
    const next: Record<string, string> = {};
    for (const d of selected.dimensions_schema ?? []) next[d.key] = String(d.default ?? 0);
    setDims(next);
    setShowMore(false);
  }, [selected]);

  const numericDims = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(dims)) out[k] = Number(String(v).replace(',', '.')) || 0;
    return out;
  }, [dims]);

  const breakdown = useMemo(
    () => (selected ? computeBreakdown(selected.items, numericDims) : { sections: [], subtotal: 0 }),
    [selected, numericDims],
  );

  const currency = selected?.source_currency || 'EUR';
  const schema = selected?.dimensions_schema ?? [];
  const primaryDims = schema.filter((d) => PRIMARY_KEYS.includes(d.key));
  const moreDims = schema.filter((d) => !PRIMARY_KEYS.includes(d.key));
  // If none of the preferred keys exist, promote the first 2 dims to primary.
  const effPrimary = primaryDims.length ? primaryDims : schema.slice(0, 2);
  const effMore = primaryDims.length ? moreDims : schema.slice(2);

  const saveAndSignUp = () => {
    if (!selected) return;
    try {
      localStorage.setItem('mk_pending_blueprint', JSON.stringify({
        starter_id: selected.id, title: selected.title, dimensions: numericDims, savedAt: Date.now(),
      }));
    } catch { /* private mode — fall through to plain signup */ }
    window.location.href = isAuthenticated ? '/blueprints' : '/auth?mode=signup&redirect=/blueprints';
  };

  const DimInput = ({ d }: { d: DimDef }) => (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">
        {FRIENDLY_LABEL[d.key] ?? d.label}{d.unit ? ` (${d.unit})` : ''}
      </Label>
      <Input inputMode="decimal" value={dims[d.key] ?? ''} onChange={(e) => setDims((s) => ({ ...s, [d.key]: e.target.value }))} />
    </div>
  );

  return (
    <ToolsShell>
      <div className="text-center mb-8">
        <h1 className="text-3xl font-semibold tracking-tight mb-2 flex items-center justify-center gap-2">
          <ClipboardList className="h-6 w-6 text-primary" />
          Project plan estimator
        </h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Pick a project type and see the full scope of works, priced — then fine-tune the numbers. Free, instant, no sign-up to look.
        </p>
      </div>

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !selected ? (
        <Card className="dashboard-card"><CardContent className="py-10 text-center text-sm text-muted-foreground">No project types available.</CardContent></Card>
      ) : (
        <div className="space-y-5">
          {/* type picker */}
          <div className="flex flex-wrap gap-2">
            {starters.map((s) => (
              <button key={s.id} onClick={() => setSelectedId(s.id)}
                className={`rounded-full border px-3.5 py-1.5 text-sm transition ${selectedId === s.id ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted/40'}`}>
                {s.title}
              </button>
            ))}
          </div>

          {/* headline + simple inputs */}
          <Card className="dashboard-card">
            <CardContent className="p-5">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 flex-1 min-w-[260px]">
                  {effPrimary.map((d) => <DimInput key={d.key} d={d} />)}
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Estimated total</div>
                  <div className="text-3xl font-semibold">{money(breakdown.subtotal, currency)}</div>
                </div>
              </div>

              {effMore.length > 0 && (
                <div className="mt-3">
                  <button onClick={() => setShowMore((v) => !v)} className="text-xs text-primary inline-flex items-center gap-1">
                    {showMore ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    Fine-tune details ({effMore.length})
                  </button>
                  {showMore && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                      {effMore.map((d) => <DimInput key={d.key} d={d} />)}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* the scope of works — the centerpiece */}
          <div className="space-y-3">
            {breakdown.sections.map((s, i) => (
              <Card key={i} className="dashboard-card overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30">
                  <span className="text-sm font-medium">{s.label}</span>
                  <span className="text-sm tabular-nums font-medium">{money(s.total, currency)}</span>
                </div>
                <div className="divide-y divide-border/40">
                  {s.tasks.map((t, j) => (
                    <div key={j} className="flex items-center justify-between px-4 py-2 text-sm">
                      <span className="text-muted-foreground">
                        {t.label}
                        {t.is_allowance
                          ? <Badge variant="outline" className="ml-2 text-[10px] h-4">allowance</Badge>
                          : <span className="text-xs text-muted-foreground/70"> · {t.quantity}{t.unit ? ` ${t.unit}` : ''} × {money(t.unit_price, currency)}</span>}
                      </span>
                      <span className="tabular-nums">{money(t.line_total, currency)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>

          {/* CTA */}
          <Card className="border-primary/30 bg-primary/[0.03]">
            <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <Sparkles className="h-5 w-5 text-primary shrink-0" />
              <div className="text-sm flex-1">
                <div className="font-medium">Make this yours</div>
                <div className="text-muted-foreground">Save this plan and we'll import it after you sign up — edit every line, use your own rates, and turn it into a client quote.</div>
              </div>
              <Button className="rounded-full whitespace-nowrap" onClick={saveAndSignUp}>Save &amp; create free account</Button>
            </CardContent>
          </Card>

          <p className="text-[11px] text-muted-foreground text-center">Ballpark estimate using standard rates — your actual pricing will differ.</p>
        </div>
      )}
    </ToolsShell>
  );
}
