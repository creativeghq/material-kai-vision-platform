import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Loader2, Plus, ClipboardList, FileText, Save, History, LayoutTemplate, Trash2, Sparkles, RefreshCw,
} from 'lucide-react';

import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';

import { DimensionsPanel } from '@/components/features/blueprint/DimensionsPanel';
import { PlanTreeEditor } from '@/components/features/blueprint/PlanTreeEditor';
import { BlueprintPickerDialog } from '@/components/features/blueprint/BlueprintPickerDialog';
import { PlanVersionHistory } from '@/components/features/blueprint/PlanVersionHistory';
import { blueprintsService, type DimensionDef } from '@/services/blueprintsService';
import {
  projectPlansService, type ProjectPlan, type ProjectPlanItem,
} from '@/services/projectPlansService';

interface PlanTabProps {
  projectId: string;
  workspaceId: string;
  currency: string;
  isOwner: boolean;
}

export function PlanTab({ projectId, workspaceId, currency }: PlanTabProps) {
  const { toast } = useToast();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [plans, setPlans] = useState<ProjectPlan[]>([]);
  const [plan, setPlan] = useState<ProjectPlan | null>(null);
  const [items, setItems] = useState<ProjectPlanItem[]>([]);
  const [schema, setSchema] = useState<DimensionDef[]>([]);
  const [dims, setDims] = useState<Record<string, number>>({});

  const [pickerOpen, setPickerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [saveAsTitle, setSaveAsTitle] = useState('');
  const rescaleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadPlanFull = useCallback(async (p: ProjectPlan) => {
    setPlan(p);
    setDims(p.dimensions ?? {});
    const [planItems, bp] = await Promise.all([
      projectPlansService.listItems(p.id),
      p.blueprint_id ? blueprintsService.get(p.blueprint_id) : Promise.resolve(null),
    ]);
    setItems(planItems);
    if (bp?.dimensions_schema?.length) {
      setSchema(bp.dimensions_schema);
    } else {
      // blueprint gone — derive a bare schema from the plan's dimension keys
      setSchema(Object.keys(p.dimensions ?? {}).map((key) => ({ key, label: key })));
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await projectPlansService.listForProject(projectId);
      setPlans(list);
      if (list.length) await loadPlanFull(list[0]);
      else { setPlan(null); setItems([]); }
    } catch (e) {
      toast({ title: 'Failed to load plans', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [projectId, loadPlanFull, toast]);

  useEffect(() => { load(); }, [load]);

  const refreshItems = (next: { plan: ProjectPlan; items: ProjectPlanItem[] }) => {
    setPlan(next.plan);
    setItems(next.items);
    setDims(next.plan.dimensions ?? {});
  };

  const importBlueprint = async (blueprintId: string) => {
    setBusy(true);
    try {
      const res = await projectPlansService.createFromBlueprint({ project_id: projectId, blueprint_id: blueprintId });
      setPlans((prev) => [res.plan, ...prev]);
      await loadPlanFull(res.plan);
      toast({ title: 'Plan created', description: 'Adjust the measurements and line items, then create a quote.' });
    } catch (e) {
      toast({ title: 'Import failed', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const onDimsChange = (next: Record<string, number>) => {
    setDims(next);
    if (!plan) return;
    if (rescaleTimer.current) clearTimeout(rescaleTimer.current);
    rescaleTimer.current = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await projectPlansService.rescale(plan.id, next);
        refreshItems(res);
      } catch (e) {
        toast({ title: 'Rescale failed', description: String((e as Error)?.message ?? e), variant: 'destructive' });
      } finally {
        setBusy(false);
      }
    }, 500);
  };

  const patchItem = async (id: string, patch: Partial<ProjectPlanItem>) => {
    if (!plan) return;
    setBusy(true);
    try {
      const res = await projectPlansService.updateItems(plan.id, [{ id, ...patch }]);
      refreshItems(res);
    } catch (e) {
      toast({ title: 'Update failed', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const deleteItem = async (id: string) => {
    if (!plan) return;
    setBusy(true);
    try {
      await projectPlansService.deleteItem(plan.id, id);
      refreshItems(await projectPlansService.reprice(plan.id));
    } catch (e) {
      toast({ title: 'Delete failed', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const addItem = async (kind: 'section' | 'task', parentId?: string) => {
    if (!plan) return;
    setBusy(true);
    try {
      const siblings = items.filter((i) => i.kind === kind && (kind === 'section' ? true : i.parent_id === parentId));
      await projectPlansService.addItem(plan.id, {
        kind,
        label: kind === 'section' ? 'New section' : 'New task',
        parent_id: parentId ?? null,
        unit: kind === 'task' ? 'item' : null,
        sort_order: siblings.length,
      });
      refreshItems(await projectPlansService.reprice(plan.id));
    } catch (e) {
      toast({ title: 'Add failed', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const selectOption = async (item: ProjectPlanItem) => {
    if (!plan || !item.option_group) return;
    const group = items.filter((i) => i.option_group === item.option_group);
    setBusy(true);
    try {
      const res = await projectPlansService.updateItems(plan.id, group.map((i) => ({ id: i.id, is_selected: i.id === item.id })));
      refreshItems(res);
    } catch (e) {
      toast({ title: 'Update failed', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const refreshPricing = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      refreshItems(await projectPlansService.reprice(plan.id));
      toast({ title: 'Pricing refreshed', description: 'Re-applied current service-catalog rates.' });
    } catch (e) {
      toast({ title: 'Refresh failed', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const saveVersion = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      const v = await projectPlansService.saveVersion(plan.id);
      toast({ title: `Saved version ${v}` });
    } catch (e) {
      toast({ title: 'Save failed', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const createQuote = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      const quoteId = await projectPlansService.createQuote(plan.id);
      toast({ title: 'Quote created from plan' });
      navigate(`/quotes/${quoteId}`);
    } catch (e) {
      toast({ title: 'Quote creation failed', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const saveAsBlueprint = async () => {
    if (!plan || !saveAsTitle.trim()) return;
    setBusy(true);
    try {
      await blueprintsService.createFromPlan({ workspace_id: workspaceId, plan_id: plan.id, title: saveAsTitle.trim(), project_type: plan.title });
      toast({ title: 'Saved as blueprint', description: 'Reuse it from the Blueprint Library on your next project.' });
      setSaveAsOpen(false); setSaveAsTitle('');
    } catch (e) {
      toast({ title: 'Save failed', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const deletePlan = async () => {
    if (!plan) return;
    if (!confirm('Delete this plan? This cannot be undone.')) return;
    setBusy(true);
    try {
      await projectPlansService.remove(plan.id);
      toast({ title: 'Plan deleted' });
      await load();
    } catch (e) {
      toast({ title: 'Delete failed', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  if (loading) {
    return <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  // Empty state
  if (!plan) {
    return (
      <>
        <Card className="dashboard-card">
          <CardContent className="p-10 flex flex-col items-center text-center gap-3">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <ClipboardList className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="text-lg font-medium">Build a project plan</div>
            <p className="text-sm text-muted-foreground max-w-md">
              Start from a reusable blueprint — a structured scope of works. Enter a few measurements
              and it prices itself; then turn it into a quote in one click.
            </p>
            <Button className="rounded-full" onClick={() => setPickerOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Import a blueprint
            </Button>
          </CardContent>
        </Card>
        <BlueprintPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} workspaceId={workspaceId} onPick={importBlueprint} />
      </>
    );
  }

  return (
    <div className="space-y-5">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 mr-auto min-w-0">
          <LayoutTemplate className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-medium truncate">{plan.title}</span>
          <Badge variant="outline" className="text-xs h-5 capitalize">{plan.status}</Badge>
          {plans.length > 1 && (
            <select
              className="ml-2 text-xs bg-transparent border border-border rounded-md px-2 py-1"
              value={plan.id}
              onChange={(e) => { const p = plans.find((x) => x.id === e.target.value); if (p) loadPlanFull(p); }}
            >
              {plans.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          )}
        </div>
        <Button variant="outline" size="sm" className="rounded-full" disabled={busy} onClick={() => setPickerOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> New
        </Button>
        <Button variant="outline" size="sm" className="rounded-full" disabled={busy} onClick={refreshPricing}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh pricing
        </Button>
        <Button variant="outline" size="sm" className="rounded-full" disabled={busy} onClick={saveVersion}>
          <Save className="h-3.5 w-3.5 mr-1" /> Save version
        </Button>
        <Button variant="outline" size="sm" className="rounded-full" disabled={busy} onClick={() => setHistoryOpen(true)}>
          <History className="h-3.5 w-3.5 mr-1" /> History
        </Button>
        <Button variant="outline" size="sm" className="rounded-full" disabled={busy} onClick={() => { setSaveAsTitle(plan.title); setSaveAsOpen(true); }}>
          <Sparkles className="h-3.5 w-3.5 mr-1" /> Save as blueprint
        </Button>
        <Button size="sm" className="rounded-full" disabled={busy} onClick={createQuote}>
          <FileText className="h-3.5 w-3.5 mr-1" /> Create quote
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busy} onClick={deletePlan}>
          <Trash2 className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>

      {busy && (
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Updating…
        </div>
      )}

      <DimensionsPanel schema={schema} values={dims} onChange={onDimsChange} disabled={busy} />

      <PlanTreeEditor
        items={items}
        currency={currency || plan.source_currency || 'EUR'}
        subtotal={plan.subtotal}
        busy={busy}
        onPatch={patchItem}
        onDelete={deleteItem}
        onAddTask={(sectionId) => addItem('task', sectionId)}
        onAddSection={() => addItem('section')}
        onSelectOption={selectOption}
      />

      <BlueprintPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} workspaceId={workspaceId} onPick={importBlueprint} />
      <PlanVersionHistory open={historyOpen} onOpenChange={setHistoryOpen} planId={plan.id} onRestored={() => load()} />

      <Dialog open={saveAsOpen} onOpenChange={setSaveAsOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Save as blueprint</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Blueprint name</Label>
            <Input value={saveAsTitle} onChange={(e) => setSaveAsTitle(e.target.value)} placeholder="e.g. Standard Bathroom Reno" />
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setSaveAsOpen(false)}>Cancel</Button>
            <Button className="rounded-full" disabled={busy || !saveAsTitle.trim()} onClick={saveAsBlueprint}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
