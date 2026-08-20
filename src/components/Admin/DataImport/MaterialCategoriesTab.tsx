/**
 * Material Categories Tab
 *
 * Admin CRUD for the `material_categories` table — the dropdown shared by
 * PDF upload, XML import, and (future) web-scraping flows. Lives under
 * Data Import Hub because that's where every code path that consumes
 * these categories starts.
 *
 * Writes are gated by `is_admin_user()` RLS. Non-admins get a 403 from
 * Supabase and the toast surfaces the error.
 *
 * Disable (is_active=false) is preferred over delete: the slug
 * (`category_key`) is referenced as a string by every existing product /
 * job row, so a hard delete would orphan historical data. Delete is
 * still offered but warns first.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, Loader2, CornerDownRight } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Switch } from '@/components/core/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/core/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/core/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/core/ui/card';
import { HubEmptyState } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface MaterialCategoryRow {
  id: string;
  category_key: string;
  name: string;
  display_name: string;
  description: string | null;
  sort_order: number | null;
  is_active: boolean | null;
  default_unit: string;
  parent_category_id: string | null;
  hierarchy_level: number | null;
}

type EditableCategory = Partial<MaterialCategoryRow> & {
  category_key: string;
  name: string;
  display_name: string;
};

const PARENT_NONE = '__none__';

const KEY_PATTERN = /^[a-z0-9_]+$/;

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export const MaterialCategoriesTab: React.FC = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<MaterialCategoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editing, setEditing] = useState<EditableCategory>({
    category_key: '',
    name: '',
    display_name: '',
    description: '',
    sort_order: 0,
    is_active: true,
    default_unit: 'pcs',
  });
  const [saving, setSaving] = useState(false);
  // Category aliases (operator-managed normalization for drifted import keys).
  const [aliases, setAliases] = useState<Array<{ alias: string; category_key: string }>>([]);
  const [newAlias, setNewAlias] = useState('');
  const [newAliasCat, setNewAliasCat] = useState('');
  const [aliasBusy, setAliasBusy] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('material_categories')
      .select(
        'id, category_key, name, display_name, description, sort_order, is_active, default_unit, parent_category_id, hierarchy_level',
      )
      .order('sort_order', { ascending: true, nullsFirst: false });

    if (error) {
      toast({ title: 'Failed to load categories', description: error.message, variant: 'destructive' });
      setIsLoading(false);
      return;
    }

    setRows((data ?? []) as MaterialCategoryRow[]);

    const { data: aliasData } = await supabase
      .from('material_category_aliases')
      .select('alias, category_key')
      .order('alias', { ascending: true });
    setAliases((aliasData ?? []) as Array<{ alias: string; category_key: string }>);

    setIsLoading(false);
  };

  const addAlias = async () => {
    const a = newAlias.trim().toLowerCase();
    if (!a || !newAliasCat) {
      toast({ title: 'Alias + target category required', variant: 'destructive' });
      return;
    }
    setAliasBusy(true);
    const { error } = await supabase
      .from('material_category_aliases')
      .upsert({ alias: a, category_key: newAliasCat });
    setAliasBusy(false);
    if (error) {
      toast({ title: 'Failed to add alias', description: error.message, variant: 'destructive' });
      return;
    }
    setNewAlias('');
    setNewAliasCat('');
    void load();
  };

  const deleteAlias = async (alias: string) => {
    const { error } = await supabase.from('material_category_aliases').delete().eq('alias', alias);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    setAliases((prev) => prev.filter((x) => x.alias !== alias));
  };

  // Depth-first tree order: top-levels by sort_order, children nested under their parent.
  const displayRows = useMemo(() => {
    const byParent = new Map<string | null, MaterialCategoryRow[]>();
    for (const r of rows) {
      const p = r.parent_category_id ?? null;
      if (!byParent.has(p)) byParent.set(p, []);
      byParent.get(p)!.push(r);
    }
    for (const arr of byParent.values()) arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const out: Array<MaterialCategoryRow & { depth: number; isFirst: boolean; isLast: boolean }> = [];
    const walk = (parentId: string | null, depth: number) => {
      const sibs = byParent.get(parentId) ?? [];
      sibs.forEach((r, i) => {
        out.push({ ...r, depth, isFirst: i === 0, isLast: i === sibs.length - 1 });
        walk(r.id, depth + 1);
      });
    };
    walk(null, 0);
    return out;
  }, [rows]);

  // A row can't be its own parent or a child of its own descendant (cycle guard for the picker).
  const invalidParentIds = useMemo(() => {
    const ids = new Set<string>();
    if (!editing.id) return ids;
    ids.add(editing.id);
    const byParent = new Map<string | null, MaterialCategoryRow[]>();
    for (const r of rows) {
      const p = r.parent_category_id ?? null;
      if (!byParent.has(p)) byParent.set(p, []);
      byParent.get(p)!.push(r);
    }
    const walk = (pid: string) => { for (const r of byParent.get(pid) ?? []) { ids.add(r.id); walk(r.id); } };
    walk(editing.id);
    return ids;
  }, [rows, editing.id]);

  const openCreate = (parentId: string | null = null) => {
    setIsEditing(false);
    const siblings = rows.filter((r) => (r.parent_category_id ?? null) === parentId);
    const nextSortOrder = siblings.length > 0 ? Math.max(...siblings.map((r) => r.sort_order ?? 0)) + 1 : 1;
    setEditing({
      category_key: '',
      name: '',
      display_name: '',
      description: '',
      sort_order: nextSortOrder,
      is_active: true,
      default_unit: 'pcs',
      parent_category_id: parentId,
    });
    setEditorOpen(true);
  };

  const openEdit = (row: MaterialCategoryRow) => {
    setIsEditing(true);
    setEditing({
      id: row.id,
      category_key: row.category_key,
      name: row.name,
      display_name: row.display_name,
      description: row.description ?? '',
      sort_order: row.sort_order ?? 0,
      is_active: row.is_active ?? true,
      default_unit: row.default_unit ?? 'pcs',
      parent_category_id: row.parent_category_id ?? null,
    });
    setEditorOpen(true);
  };

  const handleNameChange = (name: string) => {
    setEditing((prev) => {
      const next = { ...prev, name };
      // Only auto-derive on create AND when the user hasn't typed a key yet.
      if (!isEditing && !prev.category_key) {
        next.category_key = slugify(name);
      }
      if (!prev.display_name || prev.display_name === prev.name) {
        next.display_name = name;
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!editing.name.trim() || !editing.category_key.trim() || !editing.display_name.trim()) {
      toast({ title: 'Missing fields', description: 'Key, name, and display name are required.', variant: 'destructive' });
      return;
    }
    if (!KEY_PATTERN.test(editing.category_key)) {
      toast({
        title: 'Invalid key',
        description: 'Use lowercase letters, numbers, and underscores only.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    const payload = {
      category_key: editing.category_key.trim(),
      name: editing.name.trim(),
      display_name: editing.display_name.trim(),
      description: (editing.description ?? '').trim() || null,
      sort_order: Number(editing.sort_order ?? 0),
      is_active: editing.is_active ?? true,
      default_unit: (editing.default_unit ?? 'pcs').trim() || 'pcs',
      parent_category_id: editing.parent_category_id ?? null,
    };

    const { error } = isEditing && editing.id
      ? await supabase.from('material_categories').update(payload).eq('id', editing.id)
      : await supabase.from('material_categories').insert(payload);

    setSaving(false);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: isEditing ? 'Category updated' : 'Category created' });
    setEditorOpen(false);
    void load();
  };

  const toggleActive = async (row: MaterialCategoryRow) => {
    const next = !(row.is_active ?? true);
    const { error } = await supabase
      .from('material_categories')
      .update({ is_active: next })
      .eq('id', row.id);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_active: next } : r)));
  };

  const move = async (row: MaterialCategoryRow, direction: -1 | 1) => {
    // Reorder within siblings (same parent) only.
    const siblings = rows
      .filter((r) => (r.parent_category_id ?? null) === (row.parent_category_id ?? null))
      .sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0));
    const idx = siblings.findIndex((r) => r.id === row.id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= siblings.length) return;

    const a = siblings[idx];
    const b = siblings[swapIdx];
    const aOrder = a.sort_order ?? idx;
    const bOrder = b.sort_order ?? swapIdx;

    setRows((prev) => prev.map((r) =>
      r.id === a.id ? { ...r, sort_order: bOrder } : r.id === b.id ? { ...r, sort_order: aOrder } : r));

    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from('material_categories').update({ sort_order: bOrder }).eq('id', a.id),
      supabase.from('material_categories').update({ sort_order: aOrder }).eq('id', b.id),
    ]);
    if (e1 || e2) {
      toast({ title: 'Reorder failed', description: (e1 ?? e2)?.message ?? 'Unknown error', variant: 'destructive' });
      void load();
    }
  };

  const handleDelete = async (row: MaterialCategoryRow) => {
    const confirmed = window.confirm(
      `Delete category "${row.display_name}"?\n\n` +
        `This is hard delete. Existing products / import jobs tagged with the key "${row.category_key}" will keep that string but the dropdown will no longer show this option.\n\n` +
        'Prefer disabling (toggle Active off) over deleting unless you really mean to remove it.',
    );
    if (!confirmed) return;

    const { error } = await supabase.from('material_categories').delete().eq('id', row.id);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Category deleted' });
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  };

  return (
    <div className="space-y-6">
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Material Categories</CardTitle>
            <CardDescription className="mt-1">
              The dropdown options shown on PDF upload and XML import. Disabled rows are hidden from the dropdowns but kept for historical reference.
            </CardDescription>
          </div>
          <Button onClick={() => openCreate()} className="rounded-full shrink-0">
            <Plus className="h-4 w-4 mr-2" />
            New category
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
            Loading categories…
          </div>
        ) : rows.length === 0 ? (
          <HubEmptyState
            icon={CornerDownRight}
            title="No categories yet"
            description="Categories drive the field registry — what fields a product of that kind has, what unit it defaults to, and how it renders."
            action={<Button size="sm" onClick={() => openCreate()}><Plus className="h-4 w-4 mr-2" />New category</Button>}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Order</TableHead>
                <TableHead>Display name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Default unit</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => move(row, -1)}
                        disabled={row.isFirst}
                        aria-label="Move up"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => move(row, 1)}
                        disabled={row.isLast}
                        aria-label="Move down"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    <span style={{ paddingLeft: `${row.depth * 1.5}rem` }} className="inline-flex items-center gap-1.5">
                      {row.depth > 0 && <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                      {row.display_name}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{row.category_key}</TableCell>
                  <TableCell className="text-muted-foreground">{row.default_unit}</TableCell>
                  <TableCell>
                    <Switch checked={row.is_active ?? false} onCheckedChange={() => toggleActive(row)} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openCreate(row.id)} aria-label="Add subcategory" title="Add subcategory">
                        <Plus className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(row)} aria-label="Edit">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(row)}
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit category' : 'New category'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="cat-name">Name</Label>
              <Input
                id="cat-name"
                value={editing.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Building Materials"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-display">Display name</Label>
              <Input
                id="cat-display"
                value={editing.display_name}
                onChange={(e) => setEditing({ ...editing, display_name: e.target.value })}
                placeholder="Building Materials"
              />
              <p className="text-xs text-muted-foreground">Shown in the dropdown to users.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-parent">Parent category</Label>
              <Select
                value={editing.parent_category_id ?? PARENT_NONE}
                onValueChange={(v) => setEditing({ ...editing, parent_category_id: v === PARENT_NONE ? null : v })}
              >
                <SelectTrigger id="cat-parent"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={PARENT_NONE}>None (top-level)</SelectItem>
                  {displayRows.filter((r) => !invalidParentIds.has(r.id)).map((r) => (
                    <SelectItem key={r.id} value={r.id} className="whitespace-pre">
                      {'  '.repeat(r.depth) + (r.depth > 0 ? '↳ ' : '') + r.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Leave as top-level, or nest under a parent to make this a subcategory.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-key">Key (slug)</Label>
              <Input
                id="cat-key"
                value={editing.category_key}
                onChange={(e) => setEditing({ ...editing, category_key: e.target.value })}
                placeholder="building_materials"
                disabled={isEditing}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Lowercase letters / digits / underscores. {isEditing
                  ? 'Cannot be changed after creation — products reference this key.'
                  : 'Auto-derived from name; you can override.'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cat-unit">Default unit</Label>
                <Input
                  id="cat-unit"
                  value={editing.default_unit ?? 'pcs'}
                  onChange={(e) => setEditing({ ...editing, default_unit: e.target.value })}
                  placeholder="pcs"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cat-desc">Description (optional)</Label>
              <Input
                id="cat-desc"
                value={editing.description ?? ''}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                placeholder="e.g. Cement, blocks, plaster, mortar…"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-card/50 p-3">
              <div>
                <Label htmlFor="cat-active">Active</Label>
                <p className="text-xs text-muted-foreground">Inactive categories are hidden from upload dropdowns.</p>
              </div>
              <Switch
                id="cat-active"
                checked={editing.is_active ?? true}
                onCheckedChange={(checked) => setEditing({ ...editing, is_active: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)} className="rounded-full">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="rounded-full">
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {isEditing ? 'Save changes' : 'Create category'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>

    {/* Category aliases: map drifted/supplier keys to a canonical category so imports
        auto-normalize (the products write-trigger reads this table). */}
    <Card>
      <CardHeader>
        <CardTitle>Category Aliases</CardTitle>
        <CardDescription className="mt-1">
          Map an incoming key (e.g. a supplier's <span className="font-mono">ceramic_tile</span>) to one of your
          categories. On import, products with that key are auto-normalized to the canonical category
          (original kept for reference). Matching is case-insensitive.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="alias-key" className="text-xs">Incoming key</Label>
            <Input
              id="alias-key"
              value={newAlias}
              onChange={(e) => setNewAlias(e.target.value)}
              placeholder="ceramic_tile"
              className="font-mono h-9 w-56"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">→ Canonical category</Label>
            <Select value={newAliasCat} onValueChange={setNewAliasCat}>
              <SelectTrigger className="h-9 w-56"><SelectValue placeholder="Pick a category" /></SelectTrigger>
              <SelectContent>
                {displayRows.map((r) => (
                  <SelectItem key={r.id} value={r.category_key} className="whitespace-pre">
                    {'  '.repeat(r.depth) + (r.depth > 0 ? '↳ ' : '') + r.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={addAlias} disabled={aliasBusy} className="rounded-full h-9">
            {aliasBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            Add alias
          </Button>
        </div>

        {aliases.length === 0 ? (
          <p className="text-xs text-muted-foreground">No aliases yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {aliases.map((a) => (
              <div key={a.alias} className="flex items-center gap-2 rounded-full border border-border bg-card/50 pl-3 pr-1 py-1 text-xs">
                <span className="font-mono">{a.alias}</span>
                <span className="text-muted-foreground">→</span>
                <span className="font-mono">{a.category_key}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:text-destructive"
                  onClick={() => deleteAlias(a.alias)}
                  aria-label={`Delete alias ${a.alias}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
    </div>
  );
};

export default MaterialCategoriesTab;
