/**
 * Authoring the configurator's options (#321 M2, #260 Phase 1).
 *
 * Without this the runtime is unreachable: options could only be created by someone with SQL
 * access, which is not a feature a tenant has.
 *
 * The target material is a PICKER, not a text field, populated by parsing the product's own GLB.
 * A free-text field is the whole silent-zero class in one control — type `Fabric` where the model
 * says `Fabric_Navy` and you get an option that renders, is selectable, is priced, and changes
 * nothing, with no error anywhere. The runtime still warns after the fact (`unmatchedTargets`), but
 * preventing it at authoring time is better than reporting it afterwards.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Plus, Trash2, Loader2, Palette } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { listMaterialNames } from '@/components/features/ar/materialOverrides';
import { product3dService, modelPublicUrl } from '@/services/product3dService';
import {
  productConfiguratorService, type OptionGroupWithValues,
} from '@/services/productConfiguratorService';

interface ProductOptionsEditorProps {
  productId: string;
  workspaceId: string;
  /** Called after any change so a sibling preview can reload. */
  onChanged?: () => void;
}

/** A stable slug for the group key, which is UNIQUE per product. */
function slugify(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'option';
}

export const ProductOptionsEditor: React.FC<ProductOptionsEditorProps> = ({
  productId, workspaceId, onChanged,
}) => {
  const { toast } = useToast();
  const [groups, setGroups] = useState<OptionGroupWithValues[]>([]);
  const [materialNames, setMaterialNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [newGroup, setNewGroup] = useState({ label: '', target: '' });
  const [rules, setRules] = useState<Array<{
    id: string; rule_type: 'excludes' | 'requires';
    when_value_id: string; then_value_id: string; note: string | null;
  }>>([]);
  const [newRule, setNewRule] = useState<{ when: string; then: string; type: 'excludes' | 'requires' }>(
    { when: '', then: '', type: 'excludes' },
  );

  /** Every choice across every group, which is the space a rule relates. */
  const allValues = useMemo(
    () => groups.flatMap((g) => g.values.map((v) => ({ id: v.id, label: `${g.label}: ${v.label}` }))),
    [groups],
  );
  const labelFor = useCallback(
    (valueId: string) => allValues.find((v) => v.id === valueId)?.label ?? 'a removed choice',
    [allValues],
  );
  const [newValue, setNewValue] = useState<Record<string, { label: string; color: string; delta: string }>>({});

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [g, r] = await Promise.all([
        productConfiguratorService.listOptions(productId),
        productConfiguratorService.listRules(productId),
      ]);
      setGroups(g);
      setRules(r);
    } catch (err) {
      toast({
        title: 'Could not load options',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [productId, toast]);

  useEffect(() => { void reload(); }, [reload]);

  // Parse the product's GLB for its material names. Best-effort: no model, or a model we cannot
  // read, simply leaves the picker empty and the field falls back to free text.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const models = await product3dService.listModels(productId);
        const renderable = models.find((m) => m.format === 'glb' || m.format === 'gltf');
        if (!renderable) return;
        const gltf = await new GLTFLoader().loadAsync(modelPublicUrl(renderable));
        if (!cancelled) setMaterialNames(listMaterialNames(gltf.scene));
      } catch {
        if (!cancelled) setMaterialNames([]);
      }
    })();
    return () => { cancelled = true; };
  }, [productId]);

  const changed = () => { void reload(); onChanged?.(); };

  const addGroup = async () => {
    if (!newGroup.label.trim()) return;
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from('product_option_groups').insert({
        workspace_id: workspaceId,
        product_id: productId,
        key: slugify(newGroup.label),
        label: newGroup.label.trim(),
        target_material_name: newGroup.target || null,
        sort_order: groups.length,
        created_by: auth.user?.id ?? null,
      });
      if (error) throw error;
      setNewGroup({ label: '', target: '' });
      changed();
    } catch (err) {
      toast({
        title: 'Could not add the option',
        // The UNIQUE(product_id, key) violation is the likely one and reads as gibberish raw.
        description: /duplicate key/i.test(String(err))
          ? 'An option with that name already exists on this product.'
          : err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const addValue = async (group: OptionGroupWithValues) => {
    const draft = newValue[group.id];
    if (!draft?.label.trim()) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('product_option_values').insert({
        workspace_id: workspaceId,
        group_id: group.id,
        label: draft.label.trim(),
        base_color_hex: draft.color || null,
        // An AUTHORED input. The configured TOTAL is derived in SQL — never summed here.
        price_delta: Number(draft.delta) || 0,
        sort_order: group.values.length,
        is_default: group.values.length === 0,
      });
      if (error) throw error;
      setNewValue((s) => ({ ...s, [group.id]: { label: '', color: '', delta: '' } }));
      changed();
    } catch (err) {
      toast({
        title: 'Could not add the choice',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const removeGroup = async (id: string) => {
    setBusy(true);
    try {
      const { error } = await supabase.from('product_option_groups').delete().eq('id', id);
      if (error) throw error;
      changed();
    } finally {
      setBusy(false);
    }
  };

  const addRule = async () => {
    if (!newRule.when || !newRule.then) return;
    setBusy(true);
    try {
      await productConfiguratorService.addRule(
        workspaceId, productId, newRule.type, newRule.when, newRule.then,
      );
      setNewRule({ when: '', then: '', type: 'excludes' });
      changed();
    } catch (err) {
      toast({
        title: 'Could not add the rule',
        // The UNIQUE and self-reference constraints are the likely failures and read as gibberish.
        description: /duplicate key/i.test(String(err))
          ? 'That rule already exists.'
          : /not_self/i.test(String(err))
            ? 'A choice cannot rule out or require itself.'
            : err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  const removeRule = async (id: string) => {
    setBusy(true);
    try {
      await productConfiguratorService.removeRule(id);
      changed();
    } finally {
      setBusy(false);
    }
  };

  const removeValue = async (id: string) => {
    setBusy(true);
    try {
      const { error } = await supabase.from('product_option_values').delete().eq('id', id);
      if (error) throw error;
      changed();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <Palette className="h-4 w-4 text-primary" />
          Configurable options
        </CardTitle>
        <CardDescription>
          Each option targets one material in the 3D model, and its choices repaint that material.
          Price differences are added to the product's price automatically.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />Loading…
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.id} className="space-y-3 rounded-md border border-border/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{group.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {group.target_material_name
                      ? `Repaints “${group.target_material_name}”`
                      : 'No material — priced only, no visual change'}
                  </p>
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8"
                  onClick={() => removeGroup(group.id)} disabled={busy}
                  aria-label={`Delete ${group.label}`}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                {group.values.map((v) => (
                  <span key={v.id}
                    className="flex items-center gap-2 rounded-full border border-border/60 px-3 py-1 text-sm">
                    {v.base_color_hex && (
                      <span className="h-3.5 w-3.5 rounded-full border border-border/60"
                        style={{ backgroundColor: v.base_color_hex }} aria-hidden />
                    )}
                    {v.label}
                    {Number(v.price_delta) !== 0 && (
                      <span className="text-xs text-muted-foreground">
                        {Number(v.price_delta) > 0 ? '+' : ''}{Number(v.price_delta)}
                      </span>
                    )}
                    <button type="button" onClick={() => removeValue(v.id)} disabled={busy}
                      aria-label={`Remove ${v.label}`} className="text-muted-foreground hover:text-destructive">
                      ×
                    </button>
                  </span>
                ))}
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[8rem] flex-1">
                  <Label className="text-xs">Choice</Label>
                  <Input
                    placeholder="Velvet Emerald"
                    value={newValue[group.id]?.label ?? ''}
                    onChange={(e) => setNewValue((s) => ({
                      ...s,
                      [group.id]: { ...(s[group.id] ?? { color: '', delta: '' }), label: e.target.value },
                    }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Colour</Label>
                  <Input type="color" className="h-10 w-14 p-1"
                    value={newValue[group.id]?.color || '#cccccc'}
                    onChange={(e) => setNewValue((s) => ({
                      ...s,
                      [group.id]: { ...(s[group.id] ?? { label: '', delta: '' }), color: e.target.value },
                    }))}
                  />
                </div>
                <div className="w-24">
                  <Label className="text-xs">Price +/−</Label>
                  <Input type="number" step="0.01" placeholder="0"
                    value={newValue[group.id]?.delta ?? ''}
                    onChange={(e) => setNewValue((s) => ({
                      ...s,
                      [group.id]: { ...(s[group.id] ?? { label: '', color: '' }), delta: e.target.value },
                    }))}
                  />
                </div>
                <Button size="sm" variant="outline" className="rounded-full"
                  onClick={() => addValue(group)} disabled={busy}>
                  <Plus className="mr-1 h-3.5 w-3.5" />Add choice
                </Button>
              </div>
            </div>
          ))
        )}

        {/* Compatibility rules (#260 Phase 2). Only meaningful once there are at least two choices
            to relate, so the whole section stays hidden until then rather than presenting empty
            dropdowns. */}
        {allValues.length >= 2 && (
          <div className="space-y-3 border-t border-border/60 pt-4">
            <div>
              <p className="text-sm font-medium">Compatibility</p>
              <p className="text-xs text-muted-foreground">
                Combinations that are not available, and choices that depend on another. Checked
                server-side — a blocked combination cannot reach a quote.
              </p>
            </div>

            {rules.length > 0 && (
              <ul className="space-y-1">
                {rules.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      <strong>{labelFor(r.when_value_id)}</strong>
                      {r.rule_type === 'excludes' ? ' cannot be combined with ' : ' requires '}
                      <strong>{labelFor(r.then_value_id)}</strong>
                    </span>
                    <button type="button" onClick={() => removeRule(r.id)} disabled={busy}
                      aria-label="Remove rule"
                      className="shrink-0 text-muted-foreground hover:text-destructive">×</button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[9rem] flex-1">
                <Label className="text-xs">When</Label>
                <Select value={newRule.when} onValueChange={(v) => setNewRule((r) => ({ ...r, when: v }))}>
                  <SelectTrigger><SelectValue placeholder="Choice" /></SelectTrigger>
                  <SelectContent>
                    {allValues.map((v) => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-[10rem]">
                <Label className="text-xs">Then</Label>
                <Select value={newRule.type}
                  onValueChange={(v) => setNewRule((r) => ({ ...r, type: v as 'excludes' | 'requires' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="excludes">rules out</SelectItem>
                    <SelectItem value="requires">requires</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[9rem] flex-1">
                <Label className="text-xs">&nbsp;</Label>
                <Select value={newRule.then} onValueChange={(v) => setNewRule((r) => ({ ...r, then: v }))}>
                  <SelectTrigger><SelectValue placeholder="Choice" /></SelectTrigger>
                  <SelectContent>
                    {allValues.filter((v) => v.id !== newRule.when)
                      .map((v) => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" variant="outline" className="rounded-full"
                onClick={addRule} disabled={busy || !newRule.when || !newRule.then}>
                <Plus className="mr-1 h-3.5 w-3.5" />Add rule
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2 border-t border-border/60 pt-4">
          <div className="min-w-[10rem] flex-1">
            <Label className="text-xs">New option</Label>
            <Input placeholder="Fabric" value={newGroup.label}
              onChange={(e) => setNewGroup((g) => ({ ...g, label: e.target.value }))} />
          </div>
          <div className="min-w-[12rem] flex-1">
            <Label className="text-xs">Material it repaints</Label>
            {materialNames.length > 0 ? (
              <Select value={newGroup.target}
                onValueChange={(v) => setNewGroup((g) => ({ ...g, target: v === '__none' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Pick a material" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No visual change</SelectItem>
                  {materialNames.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              // No model (or unreadable): free text, and the runtime warns if it matches nothing.
              <Input placeholder="Upload a 3D model to pick from its materials"
                value={newGroup.target}
                onChange={(e) => setNewGroup((g) => ({ ...g, target: e.target.value }))} />
            )}
          </div>
          <Button size="sm" className="rounded-full" onClick={addGroup} disabled={busy || !newGroup.label.trim()}>
            <Plus className="mr-1 h-3.5 w-3.5" />Add option
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
