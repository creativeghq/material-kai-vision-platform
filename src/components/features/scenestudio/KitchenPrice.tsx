import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Calculator, FileText, Loader2, RefreshCw } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { formatMoney, formatNumber } from '@/utils/decimal';
import { Button } from '@/components/core/ui/button';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { projectsService } from '@/modules/projects/services/projectsService';
import { projectPlansService, type ProjectPlan, type ProjectPlanItem } from '@/services/projectPlansService';
import { sceneStudioService, type SceneObject, type SceneRow } from '@/services/sceneStudioService';
import { KITCHEN_KINDS, kitchenSignature } from '@/lib/scene/kitchenComposition';
import type { Composition, PlanComposition, RateChoice } from '@/utils/blueprintComposition';

const WHOLE = { decimals: 0, maxDecimals: 0 };
const UNIT_ZONES = ['base', 'wall', 'tall', 'island', 'highboard'];
const TOP_ZONES = ['worktop', 'island_worktop', 'bar'];


export const KitchenPrice: React.FC<{
  scene: SceneRow;
  objects: SceneObject[];
  onSceneChange(patch: Partial<SceneRow>): void;
}> = ({ scene, objects, onSceneChange }) => {
  const { toast } = useToast();
  const [plan, setPlan] = useState<ProjectPlan | null>(null);
  const [items, setItems] = useState<ProjectPlanItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }> | null>(null);
  const [projectId, setProjectId] = useState<string | null>(scene.project_id);
  const [blueprints, setBlueprints] = useState<Array<{ id: string; title: string }> | null>(null);
  const [blueprintId, setBlueprintId] = useState<string | null>(null);
  const [pricedSig, setPricedSig] = useState<string | null>(null);
  const kitchen = objects.filter((o) => !o.removed_at && KITCHEN_KINDS.has(o.kind));
  const sig = kitchenSignature(objects);

  useEffect(() => {
    let live = true;
    if (!scene.project_plan_id) { setPlan(null); setItems([]); return; }
    void Promise.all([projectPlansService.get(scene.project_plan_id), projectPlansService.listItems(scene.project_plan_id)])
      .then(([p, list]) => { if (live) { setPlan(p); setItems(list); } })
      .catch(() => { if (live) setPlan(null); });
    return () => { live = false; };
  }, [scene.project_plan_id]);

  useEffect(() => {
    if (scene.project_plan_id || projects) return;
    void projectsService.listProjects({ status: 'active' })
      .then((list) => setProjects(list.map((p) => ({ id: p.id, name: (p as { name?: string; title?: string }).name ?? (p as { title?: string }).title ?? 'Project' }))))
      .catch(() => setProjects([]));
  }, [scene.project_plan_id, projects]);

  useEffect(() => {
    if (scene.project_plan_id || blueprints) return;
    void sceneStudioService.kitchenBlueprints(scene.workspace_id)
      .then((list) => { setBlueprints(list); setBlueprintId((id) => id ?? list[0]?.id ?? null); })
      .catch(() => setBlueprints([]));
  }, [scene.project_plan_id, scene.workspace_id, blueprints]);

  const fail = (title: string, e: unknown) => toast({ title, description: e instanceof Error ? e.message : String(e), variant: 'destructive' });

  const price = async () => {
    setBusy('price');
    try {
      const res = await sceneStudioService.priceKitchen(scene, objects, projectId, blueprintId);
      setPlan(res.plan);
      setItems(res.items);
      setPricedSig(sig);
      if (res.plan.id !== scene.project_plan_id) onSceneChange({ project_plan_id: res.plan.id, project_id: res.plan.project_id });
    } catch (e) { fail('The kitchen could not be priced', e); } finally { setBusy(null); }
  };

  const choose = async (zones: string[], key: string, value: string) => {
    if (!plan) return;
    setBusy(key);
    try {
      const res = await sceneStudioService.setKitchenChoice(plan.id, (config: Composition) => {
        const next: Composition = { ...config };
        for (const z of zones) next[z] = { ...(next[z] ?? {}), globals: { ...(next[z]?.globals ?? {}), [key]: value } };
        return next;
      });
      setPlan(res.plan);
      setItems(res.items);
    } catch (e) { fail('The choice could not be priced', e); } finally { setBusy(null); }
  };

  const quote = async () => {
    if (!plan) return;
    setBusy('quote');
    try {
      const quoteId = await projectPlansService.createQuote(plan.id);
      setPlan({ ...plan, quote_id: quoteId, status: 'quoted' });
      toast({ title: 'Quote created', description: 'The kitchen is now a draft quote with every priced line.' });
    } catch (e) { fail('The quote could not be created', e); } finally { setBusy(null); }
  };

  const comp = (plan?.composition ?? {}) as Partial<PlanComposition>;
  const tables = comp.rate_tables ?? {};
  const config = comp.config ?? {};
  const currentOf = (zones: string[], key: string) => zones.map((z) => config[z]?.globals?.[key]).find((v) => typeof v === 'string') as string | undefined;
  const topLines = useMemo(
    () => [...items].filter((i) => i.kind === 'task' && i.is_selected !== false && (i.line_total ?? 0) > 0).sort((a, b) => b.line_total - a.line_total).slice(0, 6),
    [items],
  );
  const cutLines = useMemo(() => {
    const cutKeys = /total_(board_m2|edge_m)_/;
    return items.filter((i) => i.kind === 'task' && i.is_schedule && cutKeys.test(i.quantity_formula ?? ''));
  }, [items]);

  if (!kitchen.length) return null;

  const choiceSelect = (label: string, group: string, zones: string[], key: string) => {
    const choices: RateChoice[] = tables[group] ?? [];
    if (!choices.length) return null;
    const picked = currentOf(zones, key);
    const value = choices.some((c) => c.id === picked) ? picked! : (choices.find((c) => c.tier === 'good') ?? choices[0]).id;
    return (
      <div className="space-y-1">
        <Label className="text-xs">{label}</Label>
        <Select value={value} onValueChange={(v) => void choose(zones, key, v)} disabled={!!busy}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {choices.map((c) => (
              <SelectItem key={c.id} value={c.id} className="text-xs">
                {c.label} · {formatMoney(c.unit_price, plan?.source_currency ?? 'EUR', WHOLE)}{c.unit ? `/${c.unit}` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  };

  return (
    <div className="space-y-2 border-t border-hairline pt-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Kitchen Price</Label>
        {plan && <Badge variant={plan.quote_id ? 'success' : 'neutral'}>{plan.quote_id ? 'Quoted' : 'Priced'}</Badge>}
      </div>
      {!plan ? (
        <>
          <p className="text-[11px] text-muted-foreground">
            Prices the {kitchen.length === 1 ? 'kitchen unit' : `${kitchen.length} kitchen units`} in this room from your kitchen blueprint: runs, cabinet counts, door model and worktop, on a project plan you can quote.
          </p>
          {blueprints && blueprints.length > 1 && (
            <div className="space-y-1">
              <Label className="text-xs">Price By</Label>
              <Select value={blueprintId ?? undefined} onValueChange={setBlueprintId}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{blueprints.map((b) => <SelectItem key={b.id} value={b.id} className="text-xs">{b.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {!scene.project_id && (
            <Select value={projectId ?? undefined} onValueChange={setProjectId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={projects ? 'Choose the project' : 'Loading projects…'} /></SelectTrigger>
              <SelectContent>{(projects ?? []).map((p) => <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Button size="sm" variant="outline" className="w-full gap-1.5" disabled={busy === 'price' || !(projectId ?? scene.project_id)} onClick={() => void price()}>
            {busy === 'price' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Calculator className="h-3.5 w-3.5" />}Price this kitchen
          </Button>
          {projects && !projects.length && !scene.project_id && <p className="text-[11px] text-muted-foreground">Create a project first; the kitchen is priced on its plan.</p>}
        </>
      ) : (
        <>
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-semibold tabular-nums">{formatMoney(plan.subtotal ?? 0, plan.source_currency, WHOLE)}</span>
            <span className="text-[11px] text-muted-foreground">before tax</span>
          </div>
          {choiceSelect('Door Model', 'Cabinet model', UNIT_ZONES, 'door_model')}
          {choiceSelect('Carcass Board', 'Carcass Board', UNIT_ZONES, 'carcass_board')}
          {choiceSelect('Front Board', 'Front Board', UNIT_ZONES, 'front_board')}
          {choiceSelect('Front Edge Tape', 'Front Edge Tape', UNIT_ZONES, 'front_edge')}
          {choiceSelect('Worktop', 'Worktop', TOP_ZONES, 'material')}
          {topLines.length > 0 && (
            <ul className="space-y-0.5 text-[11px]">
              {topLines.map((l) => (
                <li key={l.id} className="flex justify-between gap-2">
                  <span className="truncate text-muted-foreground">{l.label}</span>
                  <span className="shrink-0 tabular-nums">{formatMoney(l.line_total, plan.source_currency, WHOLE)}</span>
                </li>
              ))}
            </ul>
          )}
          {cutLines.length > 0 && (
            <div className="space-y-0.5">
              <Label className="text-xs">Cut List</Label>
              <ul className="space-y-0.5 text-[11px]">
                {cutLines.map((l) => (
                  <li key={l.id} className="flex justify-between gap-2">
                    <span className="truncate text-muted-foreground">{l.label}</span>
                    <span className="shrink-0 tabular-nums">{formatNumber(l.quantity)} {l.unit ?? ''}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {pricedSig !== null && pricedSig !== sig && <p className="text-[11px] text-amber-800 dark:text-amber-300">The kitchen has changed in the room since it was priced.</p>}
          <div className="grid grid-cols-2 gap-1.5">
            <Button size="sm" variant="outline" className="gap-1.5" disabled={!!busy} onClick={() => void price()}>
              {busy === 'price' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Update from room
            </Button>
            {plan.quote_id ? (
              <Button size="sm" variant="outline" className="gap-1.5" asChild>
                <Link to={`/quotes/${plan.quote_id}`}><FileText className="h-3.5 w-3.5" />Open quote</Link>
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="gap-1.5" disabled={!!busy} onClick={() => void quote()}>
                {busy === 'quote' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}Create quote
              </Button>
            )}
          </div>
          {plan.project_id && (
            <Link to={`/projects/${plan.project_id}?tab=plan`} className="flex items-center gap-1 text-[11px] text-primary hover:underline">
              Open the full plan<ArrowUpRight className="h-3 w-3" />
            </Link>
          )}
        </>
      )}
    </div>
  );
};
