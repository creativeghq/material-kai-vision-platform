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

import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Switch } from '@/components/core/ui/switch';
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
  ai_confidence_threshold: number | null;
  default_unit: string;
}

type EditableCategory = Partial<MaterialCategoryRow> & {
  category_key: string;
  name: string;
  display_name: string;
};

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
    ai_confidence_threshold: 0.8,
    default_unit: 'pcs',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('material_categories')
      .select(
        'id, category_key, name, display_name, description, sort_order, is_active, ai_confidence_threshold, default_unit',
      )
      .order('sort_order', { ascending: true, nullsFirst: false });

    if (error) {
      toast({ title: 'Failed to load categories', description: error.message, variant: 'destructive' });
      setIsLoading(false);
      return;
    }

    setRows((data ?? []) as MaterialCategoryRow[]);
    setIsLoading(false);
  };

  const openCreate = () => {
    setIsEditing(false);
    const nextSortOrder = rows.length > 0 ? Math.max(...rows.map((r) => r.sort_order ?? 0)) + 1 : 1;
    setEditing({
      category_key: '',
      name: '',
      display_name: '',
      description: '',
      sort_order: nextSortOrder,
      is_active: true,
      ai_confidence_threshold: 0.8,
      default_unit: 'pcs',
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
      ai_confidence_threshold: row.ai_confidence_threshold ?? 0.8,
      default_unit: row.default_unit ?? 'pcs',
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
    const threshold = Number(editing.ai_confidence_threshold ?? 0.8);
    if (Number.isNaN(threshold) || threshold < 0 || threshold > 1) {
      toast({ title: 'Invalid threshold', description: 'AI confidence must be between 0 and 1.', variant: 'destructive' });
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
      ai_confidence_threshold: threshold,
      default_unit: (editing.default_unit ?? 'pcs').trim() || 'pcs',
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
    const idx = rows.findIndex((r) => r.id === row.id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= rows.length) return;

    const a = rows[idx];
    const b = rows[swapIdx];
    const aOrder = a.sort_order ?? idx + 1;
    const bOrder = b.sort_order ?? swapIdx + 1;

    // Optimistic reorder so the UI moves immediately
    const reordered = [...rows];
    reordered[idx] = { ...a, sort_order: bOrder };
    reordered[swapIdx] = { ...b, sort_order: aOrder };
    reordered.sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0));
    setRows(reordered);

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
        `Prefer disabling (toggle Active off) over deleting unless you really mean to remove it.`,
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
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Material Categories</CardTitle>
            <CardDescription className="mt-1">
              The dropdown options shown on PDF upload and XML import. Disabled rows are hidden from the dropdowns but kept for historical reference.
            </CardDescription>
          </div>
          <Button onClick={openCreate} className="rounded-full shrink-0">
            <Plus className="h-4 w-4 mr-2" />
            New Category
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
          <div className="text-center py-12 text-muted-foreground">No categories yet. Create your first one.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Order</TableHead>
                <TableHead>Display name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Default unit</TableHead>
                <TableHead>AI threshold</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, idx) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => move(row, -1)}
                        disabled={idx === 0}
                        aria-label="Move up"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => move(row, 1)}
                        disabled={idx === rows.length - 1}
                        aria-label="Move down"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{row.display_name}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{row.category_key}</TableCell>
                  <TableCell className="text-muted-foreground">{row.default_unit}</TableCell>
                  <TableCell className="text-muted-foreground">{row.ai_confidence_threshold ?? '—'}</TableCell>
                  <TableCell>
                    <Switch checked={row.is_active ?? false} onCheckedChange={() => toggleActive(row)} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
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
              <div className="space-y-2">
                <Label htmlFor="cat-threshold">AI confidence (0–1)</Label>
                <Input
                  id="cat-threshold"
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={editing.ai_confidence_threshold ?? 0.8}
                  onChange={(e) =>
                    setEditing({ ...editing, ai_confidence_threshold: Number(e.target.value) })
                  }
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
  );
};

export default MaterialCategoriesTab;
