import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, ChevronLeft, Plus, Trash2, Save, LayoutTemplate, Copy } from 'lucide-react';

import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Switch } from '@/components/core/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getActiveWorkspaceId } from '@/utils/activeWorkspace';
import { blueprintsService, type Blueprint, type BlueprintItem, type DimensionDef } from '@/services/blueprintsService';
import { UnitSelect } from '@/components/features/blueprint/UnitSelect';

type EditItem = Partial<BlueprintItem> & { id: string; kind: 'section' | 'task'; label: string };

export const BlueprintEditorPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const workspaceId = getActiveWorkspaceId(user?.id);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bp, setBp] = useState<Blueprint | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [schema, setSchema] = useState<DimensionDef[]>([]);
  const [items, setItems] = useState<EditItem[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [b, its] = await Promise.all([blueprintsService.get(id), blueprintsService.listItems(id)]);
      if (!b) { toast({ title: 'Blueprint not found', variant: 'destructive' }); navigate('/blueprints'); return; }
      setBp(b); setTitle(b.title); setDescription(b.description ?? ''); setSchema(b.dimensions_schema ?? []);
      setItems(its as EditItem[]);
    } catch (e) {
      toast({ title: 'Failed to load', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally { setLoading(false); }
  }, [id, navigate, toast]);

  useEffect(() => { load(); }, [load]);

  const sections = items.filter((i) => i.kind === 'section');
  const tasksOf = (sid: string) => items.filter((i) => i.kind === 'task' && i.parent_id === sid);

  const patch = (itemId: string, p: Partial<EditItem>) => setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, ...p } : it)));
  const del = (itemId: string) => setItems((prev) => prev.filter((it) => it.id !== itemId && it.parent_id !== itemId));
  const addSection = () => setItems((prev) => [...prev, { id: crypto.randomUUID(), kind: 'section', label: 'New section', parent_id: null, sort_order: prev.filter((i) => i.kind === 'section').length }]);
  const addTask = (sid: string) => setItems((prev) => [...prev, { id: crypto.randomUUID(), kind: 'task', label: 'New task', parent_id: sid, unit: 'item', default_quantity: 1, line_kind: 'labor', margin_pct: 0, sort_order: prev.filter((i) => i.parent_id === sid).length }]);

  const addDim = () => setSchema((s) => [...s, { key: `dim_${s.length + 1}`, label: 'New measurement', unit: '', default: 0 }]);
  const patchDim = (idx: number, p: Partial<DimensionDef>) => setSchema((s) => s.map((d, i) => (i === idx ? { ...d, ...p } : d)));
  const delDim = (idx: number) => setSchema((s) => s.filter((_, i) => i !== idx));

  const save = async () => {
    if (!bp) return;
    setSaving(true);
    try {
      await blueprintsService.update(bp.id, { title: title.trim() || bp.title, description: description.trim() || null, dimensions_schema: schema });
      await blueprintsService.replaceItems(bp.id, items.map((it, idx) => ({ ...it, sort_order: it.sort_order ?? idx })));
      toast({ title: 'Blueprint saved' });
      navigate('/blueprints');
    } catch (e) {
      toast({ title: 'Save failed', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const copyToEdit = async () => {
    if (!bp || !workspaceId) { toast({ title: 'No active workspace', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const copy = await blueprintsService.duplicate(bp.id, workspaceId);
      toast({ title: 'Copied to your library' });
      navigate(`/blueprints/${copy.id}`);
    } catch (e) {
      toast({ title: 'Copy failed', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally { setSaving(false); }
  };

  if (loading) return <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!bp) return null;
  const readOnly = !!bp.is_platform_starter;

  const TaskRow = ({ it }: { it: EditItem }) => (
    <div className="rounded-md border border-border/60 bg-background/40 px-2 py-1.5 space-y-1">
      <div className="flex items-center gap-2">
        <Input className="h-8 flex-1" value={it.label} onChange={(e) => patch(it.id, { label: e.target.value })} />
        <UnitSelect className="w-36" value={it.unit} onChange={(u) => patch(it.id, { unit: u })} />
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">allow
          <Switch checked={!!it.is_allowance} onCheckedChange={(v) => patch(it.id, { is_allowance: v })} />
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => del(it.id)}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></Button>
      </div>
      {it.is_allowance ? (
        <div className="flex items-center gap-2 pl-1 text-[11px] text-muted-foreground">allowance amount
          <Input className="h-6 w-24 text-right" value={String(it.allowance_amount ?? 0)} onChange={(e) => patch(it.id, { allowance_amount: Number(e.target.value) || 0 })} />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 pl-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">qty formula
            <Input className="h-6 w-40" value={it.quantity_formula ?? ''} placeholder="= floor_area * 1.1" onChange={(e) => patch(it.id, { quantity_formula: e.target.value || null })} />
          </span>
          <span className="flex items-center gap-1">default
            <Input className="h-6 w-14 text-right" value={String(it.default_quantity ?? 1)} onChange={(e) => patch(it.id, { default_quantity: Number(e.target.value) || 0 })} />
          </span>
          <span className="flex items-center gap-1">labor
            <Input className="h-6 w-16 text-right" value={it.labor_rate != null ? String(it.labor_rate) : ''} placeholder="—" onChange={(e) => patch(it.id, { labor_rate: e.target.value === '' ? null : Number(e.target.value) })} />
          </span>
          <span className="flex items-center gap-1">material
            <Input className="h-6 w-16 text-right" value={it.material_cost != null ? String(it.material_cost) : ''} placeholder="—" onChange={(e) => patch(it.id, { material_cost: e.target.value === '' ? null : Number(e.target.value) })} />
          </span>
          <span className="flex items-center gap-1">margin
            <Input className="h-6 w-12 text-right" value={String(it.margin_pct ?? 0)} onChange={(e) => patch(it.id, { margin_pct: Number(e.target.value) || 0 })} />%
          </span>
          <span className="flex items-center gap-1">option
            <Input className="h-6 w-24" value={it.option_group ?? ''} placeholder="group" onChange={(e) => patch(it.id, { option_group: e.target.value || null })} />
          </span>
          {it.option_group && (
            <select className="h-6 bg-transparent border border-border rounded px-1 text-[11px]" value={it.tier ?? ''} onChange={(e) => patch(it.id, { tier: (e.target.value || null) as EditItem['tier'] })}>
              <option value="">tier…</option>
              <option value="good">good</option>
              <option value="better">better</option>
              <option value="best">best</option>
            </select>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        icon={LayoutTemplate}
        title={readOnly ? 'View blueprint' : 'Edit blueprint'}
        subtitle={bp.title}
        actions={
          <>
            <Button variant="outline" className="rounded-full" onClick={() => navigate('/blueprints')}><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
            {readOnly ? (
              <Button className="rounded-full" disabled={saving} onClick={copyToEdit}>{saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Copy className="h-4 w-4 mr-1" />} Copy to my library</Button>
            ) : (
              <Button className="rounded-full" disabled={saving} onClick={save}>{saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Save</Button>
            )}
          </>
        }
      />

      <main className="px-4 sm:px-6 py-6 space-y-6">
      {readOnly && (
        <div className="rounded-lg border border-primary/30 bg-primary/[0.04] px-4 py-2.5 text-sm text-muted-foreground flex items-center gap-2">
          <LayoutTemplate className="h-4 w-4 text-primary shrink-0" />
          This is a read-only starter blueprint. <span className="font-medium text-foreground">Copy it to your library</span> to edit the works, rates, and formulas.
        </div>
      )}

      <fieldset disabled={readOnly} className="space-y-6 border-0 p-0 m-0 min-w-0 disabled:opacity-90">

      <Card className="dashboard-card"><CardContent className="p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1"><Label className="text-xs text-muted-foreground">Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs text-muted-foreground">Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        </div>
      </CardContent></Card>

      {/* dimensions schema */}
      <Card className="dashboard-card"><CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Measurements</div>
          <Button variant="outline" size="sm" className="rounded-full" onClick={addDim}><Plus className="h-3.5 w-3.5 mr-1" /> Add</Button>
        </div>
        <p className="text-xs text-muted-foreground">These drive the parametric formulas (use the <code>key</code> in a task formula, e.g. <code>= floor_area * 1.1</code>).</p>
        <div className="space-y-1.5">
          {schema.map((d, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input className="h-8 w-32" value={d.key} placeholder="key" onChange={(e) => patchDim(idx, { key: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_') })} />
              <Input className="h-8 flex-1" value={d.label} placeholder="label" onChange={(e) => patchDim(idx, { label: e.target.value })} />
              <Input className="h-8 w-20" value={d.unit ?? ''} placeholder="unit" onChange={(e) => patchDim(idx, { unit: e.target.value })} />
              <Input className="h-8 w-20 text-right" value={String(d.default ?? 0)} placeholder="default" onChange={(e) => patchDim(idx, { default: Number(e.target.value) || 0 })} />
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => delDim(idx)}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></Button>
            </div>
          ))}
          {schema.length === 0 && <div className="text-xs text-muted-foreground">No measurements yet.</div>}
        </div>
      </CardContent></Card>

      {/* tree */}
      <div className="space-y-4">
        {sections.map((sec) => (
          <div key={sec.id} className="rounded-lg border border-border">
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 rounded-t-lg">
              <Input className="h-8 flex-1 font-medium bg-transparent" value={sec.label} onChange={(e) => patch(sec.id, { label: e.target.value })} />
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => del(sec.id)}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></Button>
            </div>
            <div className="p-2 space-y-1.5">
              {tasksOf(sec.id).map((t) => <TaskRow key={t.id} it={t} />)}
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => addTask(sec.id)}><Plus className="h-3 w-3 mr-1" /> Add task</Button>
            </div>
          </div>
        ))}
        <Button variant="outline" size="sm" className="rounded-full" onClick={addSection}><Plus className="h-3.5 w-3.5 mr-1" /> Add section</Button>
      </div>
      </fieldset>
      </main>
    </div>
  );
};

export default BlueprintEditorPage;
