/**
 * Project plan estimator (/tools/project-plan) — anonymous lead-gen tool.
 *
 * Value-first AND editable: pick a project type → the full scope of works shows
 * immediately, priced; then edit every row, add tasks, add whole sections from the
 * library, and tweak measurements — exactly like the backend Plan tab, but fully
 * client-side (no DB, no captcha, no quota). "Save & create free account" stashes
 * the edited plan and imports it into the user's library after signup.
 *
 * Only Full Home Renovation runs free here; the other types unlock after sign-up.
 */

import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Loader2, Sparkles, Lock } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent } from '@/components/core/ui/card';
import { DimensionsPanel } from '@/components/features/blueprint/DimensionsPanel';
import { PlanTreeEditor } from '@/components/features/blueprint/PlanTreeEditor';
import { SectionLibraryPicker } from '@/components/features/blueprint/SectionLibraryPicker';
import type { DimensionDef } from '@/services/blueprintsService';
import type { ProjectPlanItem } from '@/services/projectPlansService';
import { seedPlanItems, repriceItems, subtotalOf } from '@/utils/blueprintCompute';
import { ToolsShell } from './toolsShared';

interface Item { id: string; parent_id: string | null; sort_order: number; kind: 'section' | 'task'; label: string; unit: string | null; quantity_formula: string | null; default_quantity: number; line_kind: string; material_cost: number | null; labor_rate: number | null; margin_pct: number; is_allowance: boolean; allowance_amount: number | null; option_group: string | null; tier: string | null }
interface Starter { id: string; title: string; description: string | null; project_type: string | null; dimensions_schema: DimensionDef[]; source_currency: string; items: Item[] }

const isUnlocked = (s: Starter) => s.project_type === 'full_home_renovation';

export default function ProjectPlanPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAuthenticated = !!user;

  const [starters, setStarters] = useState<Starter[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [dims, setDims] = useState<Record<string, number>>({});
  const [items, setItems] = useState<ProjectPlanItem[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const selected = useMemo(() => starters.find((s) => s.id === selectedId) ?? null, [starters, selectedId]);
  const subtotal = useMemo(() => subtotalOf(items), [items]);
  const currency = selected?.source_currency || 'EUR';

  useEffect(() => {
    supabase.functions.invoke('public-project-plan', { body: { action: 'starters' } })
      .then(({ data, error }) => {
        if (error) return;
        const list = (data?.starters ?? []) as Starter[];
        list.sort((a, b) => (isUnlocked(a) ? 0 : 1) - (isUnlocked(b) ? 0 : 1));
        setStarters(list);
        const preferred = list.find(isUnlocked) ?? list[0];
        if (preferred) setSelectedId(preferred.id);
      })
      .finally(() => setLoading(false));
  }, []);

  // Seed editable items + default dims whenever the selected type changes.
  useEffect(() => {
    if (!selected) return;
    const d: Record<string, number> = {};
    for (const dim of selected.dimensions_schema ?? []) d[dim.key] = Number(dim.default ?? 0);
    setDims(d);
    setItems(seedPlanItems(selected.items, d));
  }, [selected]);

  const onDimsChange = (next: Record<string, number>) => {
    setDims(next);
    setItems((cur) => repriceItems(cur, next));
  };
  const patchItem = (id: string, patch: Partial<ProjectPlanItem>) =>
    setItems((cur) => repriceItems(cur.map((it) => (it.id === id ? { ...it, ...patch } : it)), dims));
  const deleteItem = (id: string) =>
    setItems((cur) => repriceItems(cur.filter((it) => it.id !== id && it.parent_id !== id), dims));
  const addTask = (sectionId: string) =>
    setItems((cur) => {
      const sibs = cur.filter((i) => i.parent_id === sectionId).length;
      const row: ProjectPlanItem = { id: crypto.randomUUID(), plan_id: 'local', parent_id: sectionId, sort_order: sibs, kind: 'task', label: 'New task', notes: null, unit: 'item', quantity_formula: null, quantity: 1, line_kind: 'labor', service_id: null, product_id: null, material_cost: null, labor_rate: null, margin_pct: 0, unit_price: 0, line_total: 0, option_group: null, tier: null, is_selected: true, is_allowance: false, allowance_amount: null, is_schedule: false, option_key: null, suggests_quantity: null, source: 'manual', created_at: '', updated_at: '' };
      return repriceItems([...cur, row], dims);
    });
  const addSection = () =>
    setItems((cur) => {
      const n = cur.filter((i) => i.kind === 'section').length;
      const row: ProjectPlanItem = { id: crypto.randomUUID(), plan_id: 'local', parent_id: null, sort_order: n, kind: 'section', label: 'New section', notes: null, unit: null, quantity_formula: null, quantity: 0, line_kind: 'labor', service_id: null, product_id: null, material_cost: null, labor_rate: null, margin_pct: 0, unit_price: 0, line_total: 0, option_group: null, tier: null, is_selected: true, is_allowance: false, allowance_amount: null, is_schedule: false, option_key: null, suggests_quantity: null, source: 'manual', created_at: '', updated_at: '' };
      return [...cur, row];
    });
  const selectOption = (item: ProjectPlanItem) => {
    if (!item.option_group) return;
    setItems((cur) => repriceItems(cur.map((it) => (it.option_group === item.option_group ? { ...it, is_selected: it.id === item.id } : it)), dims));
  };
  const addFromLibrary = (blueprintId: string, sectionId: string) => {
    const src = starters.find((s) => s.id === blueprintId);
    if (!src) return;
    const section = src.items.find((i) => i.id === sectionId && i.kind === 'section');
    if (!section) return;
    const tasks = src.items.filter((i) => i.parent_id === sectionId);
    setItems((cur) => {
      const n = cur.filter((i) => i.kind === 'section').length;
      const newSecId = crypto.randomUUID();
      const seeded = seedPlanItems([{ ...section, parent_id: null, sort_order: n }, ...tasks.map((t, idx) => ({ ...t, parent_id: section.id, sort_order: idx }))], dims);
      // remap ids so the appended subtree is unique
      const idMap: Record<string, string> = { [section.id]: newSecId };
      for (const t of tasks) idMap[t.id] = crypto.randomUUID();
      const remapped = seeded.map((it) => ({ ...it, id: idMap[it.id] ?? it.id, parent_id: it.parent_id ? idMap[it.parent_id] ?? null : null }));
      return repriceItems([...cur, ...remapped], dims);
    });
    toast({ title: `Added “${section.label}”` });
  };

  const saveAndSignUp = () => {
    if (!selected) return;
    try {
      // carry the full edited plan so the import recreates exactly what the user built
      const exportItems = items.map((it) => ({
        id: it.id, parent_id: it.parent_id, sort_order: it.sort_order, kind: it.kind, label: it.label,
        unit: it.unit, quantity_formula: it.quantity_formula, default_quantity: it.quantity,
        line_kind: it.line_kind, material_cost: it.material_cost, labor_rate: it.labor_rate, margin_pct: it.margin_pct,
        option_group: it.option_group, tier: it.tier, is_allowance: it.is_allowance, allowance_amount: it.allowance_amount,
      }));
      const schema = (selected.dimensions_schema ?? []).map((d) => ({ ...d, default: dims[d.key] ?? d.default }));
      localStorage.setItem('mk_pending_blueprint', JSON.stringify({
        starter_id: selected.id, title: selected.title, source_currency: currency,
        dimensions: dims, dimensions_schema: schema, items: exportItems, savedAt: Date.now(),
      }));
    } catch { /* private mode — fall through */ }
    window.location.href = isAuthenticated ? '/blueprints' : '/auth?mode=signup&redirect=/blueprints';
  };

  return (
    <ToolsShell>
      <div className="text-center mb-8">
        <h1 className="text-3xl font-semibold tracking-tight mb-2 flex items-center justify-center gap-2">
          <ClipboardList className="h-6 w-6 text-primary" />
          Project plan estimator
        </h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          See the full scope of works, priced — then edit rows, add tasks, and drop in whole sections from the library. Free, instant, no sign-up to try.
        </p>
      </div>

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !selected ? (
        <Card className="dashboard-card"><CardContent className="py-10 text-center text-sm text-muted-foreground">No project types available.</CardContent></Card>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            {starters.map((s) => {
              const locked = !isUnlocked(s);
              const active = selectedId === s.id;
              return (
                <button key={s.id}
                  onClick={() => {
                    if (locked) { toast({ title: `${s.title} unlocks after sign-up`, description: 'Create a free account to use this template — the Full Home Renovation estimate is free to try right now.' }); return; }
                    setSelectedId(s.id);
                  }}
                  className={`border px-3.5 py-1.5 text-sm transition inline-flex items-center gap-1.5 ${active ? 'border-primary bg-primary/10 text-foreground' : locked ? 'border-dashed border-border text-muted-foreground/70 hover:bg-muted/30' : 'border-border text-muted-foreground hover:bg-muted/40'}`}>
                  {locked && <Lock className="h-3 w-3" />}{s.title}
                </button>
              );
            })}
          </div>

          <DimensionsPanel schema={selected.dimensions_schema} values={dims} onChange={onDimsChange} />

          <PlanTreeEditor
            items={items}
            currency={currency}
            subtotal={subtotal}
            onPatch={patchItem}
            onDelete={deleteItem}
            onAddTask={addTask}
            onAddSection={addSection}
            onSelectOption={selectOption}
            onAddFromLibrary={() => setLibraryOpen(true)}
          />

          <Card className="border-primary/30 bg-primary/[0.03]">
            <CardContent className="py-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <Sparkles className="h-5 w-5 text-primary shrink-0" />
              <div className="text-sm flex-1">
                <div className="font-medium">Make this yours</div>
                <div className="text-muted-foreground">Save your edited plan and we'll import it after you sign up — keep refining with your own rates and turn it into a client quote.</div>
              </div>
              <Button className="whitespace-nowrap" onClick={saveAndSignUp}>Save &amp; create free account</Button>
            </CardContent>
          </Card>

          <p className="text-[11px] text-muted-foreground text-center">Ballpark estimate using standard rates — your actual pricing will differ.</p>

          <SectionLibraryPicker open={libraryOpen} onOpenChange={setLibraryOpen} onPick={(bpId, secId) => addFromLibrary(bpId, secId)} />
        </div>
      )}
    </ToolsShell>
  );
}
