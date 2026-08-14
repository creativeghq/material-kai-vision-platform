import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, ChevronLeft, Save, LayoutTemplate, Copy } from 'lucide-react';

import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getActiveWorkspaceId } from '@/utils/activeWorkspace';
import { blueprintsService, type Blueprint, type BlueprintItem, type DimensionDef } from '@/services/blueprintsService';
import { BlueprintScope } from '@/components/features/blueprint/BlueprintScope';
import { CompositionEditor } from '@/components/features/blueprint/CompositionEditor';
import type { ZoneDef } from '@/utils/blueprintComposition';

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
  const [zones, setZones] = useState<ZoneDef[]>([]);
  const [items, setItems] = useState<EditItem[]>([]);

  // What a zone global can bind to. Derived from the scope below, so adding an option_group there
  // immediately makes it available as a zone's price list.
  const optionGroups = useMemo(
    () => Array.from(new Set(items.filter((i) => i.option_group).map((i) => i.option_group as string))),
    [items],
  );

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [b, its] = await Promise.all([blueprintsService.get(id), blueprintsService.listItems(id)]);
      if (!b) { toast({ title: 'Blueprint not found', variant: 'destructive' }); navigate('/blueprints'); return; }
      setBp(b); setTitle(b.title); setDescription(b.description ?? ''); setSchema(b.dimensions_schema ?? []);
      setZones(b.composition_schema ?? []);
      setItems(its as EditItem[]);
    } catch (e) {
      toast({ title: 'Failed to load', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally { setLoading(false); }
  }, [id, navigate, toast]);

  useEffect(() => { load(); }, [load]);


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
      await blueprintsService.update(bp.id, { title: title.trim() || bp.title, description: description.trim() || null, dimensions_schema: schema, composition_schema: zones });
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

      <CompositionEditor schema={zones} optionGroups={optionGroups} readOnly={readOnly} onChange={setZones} />

      <BlueprintScope
        schema={schema}
        items={items}
        readOnly={readOnly}
        onPatchItem={patch}
        onDeleteItem={del}
        onAddSection={addSection}
        onAddTask={addTask}
        onPatchDim={patchDim}
        onDeleteDim={delDim}
        onAddDim={addDim}
      />
      </fieldset>
      </main>
    </div>
  );
};

export default BlueprintEditorPage;
