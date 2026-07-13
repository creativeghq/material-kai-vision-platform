import React, { useState, useEffect } from 'react';
import { FolderTree, Plus, Edit, Trash2, ExternalLink, Lock, ListFilter } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Badge } from '@/components/core/ui/badge';
import { Switch } from '@/components/core/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/core/ui/table';
import { useToast } from '@/hooks/use-toast';
import { KBCategory } from '@/services/knowledgeBaseService';
import { supabase } from '@/integrations/supabase/client';

const ACCESS_LEVEL_CONFIG = {
  admin: { label: 'Admin Only', emoji: '🔒', className: 'bg-red-100 text-red-800 border-red-200' },
  agent: { label: 'Agent', emoji: '🤖', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  public: { label: 'Public + Agent', emoji: '🌍', className: 'bg-green-100 text-green-800 border-green-200' },
} as const;

interface CategoryManagerProps {
  /** Jump to the Documents tab pre-filtered to this category. */
  onViewDocuments?: (categoryId: string) => void;
}

export const CategoryManager: React.FC<CategoryManagerProps> = ({ onViewDocuments }) => {
  const [categories, setCategories] = useState<KBCategory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Partial<KBCategory>>({
    name: '',
    description: '',
    color: '#3B82F6',
    icon: '📁',
    sort_order: 0,
    access_level: 'agent',
  });
  const [workspaceId, setWorkspaceId] = useState<string>('');

  const { toast } = useToast();

  useEffect(() => {
    loadWorkspace();
  }, []);

  useEffect(() => {
    if (workspaceId) {
      loadCategories();
    }
  }, [workspaceId]);

  const loadWorkspace = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: workspaces } = await supabase
        .from('workspaces')
        .select('id')
        .limit(1)
        .maybeSingle();

      if (workspaces) {
        setWorkspaceId(workspaces.id);
      }
    } catch (error) {
      console.error('Failed to load workspace:', error);
    }
  };

  const loadCategories = async () => {
    try {
      setIsLoading(true);
      const [{ data, error }, { data: docCounts }] = await Promise.all([
        supabase.from('kb_categories').select('*').eq('workspace_id', workspaceId).order('sort_order', { ascending: true }),
        supabase.from('kb_docs').select('category_id').eq('workspace_id', workspaceId).eq('status', 'published'),
      ]);

      if (error) throw error;

      const countMap: Record<string, number> = {};
      (docCounts || []).forEach((d) => {
        if (d.category_id) countMap[d.category_id] = (countMap[d.category_id] || 0) + 1;
      });

      setCategories((data || []).map((c) => ({ ...c, document_count: countMap[c.id] || 0 })));
    } catch (error) {
      console.error('Failed to load categories:', error);
      toast({
        title: 'Error',
        description: 'Failed to load categories',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setIsEditing(false);
    setEditingCategory({
      name: '',
      description: '',
      color: '#3B82F6',
      icon: '📁',
      sort_order: categories.length,
      access_level: 'agent',
      trigger_keyword: null,
    });
    setShowEditor(true);
  };

  const handleEdit = (category: KBCategory) => {
    setIsEditing(true);
    setEditingCategory({ ...category });
    setShowEditor(true);
  };

  // Mirrors the SQL `kb_is_category_protected(uuid)` function. Categories with
  // access_level='agent' (Internal Configuration, Materials Bank, HeatPumps
  // Manuals) host docs the agent reads at runtime — deletion is intentionally
  // disabled. The DB trigger `kb_categories_block_locked_delete` is the real
  // guardrail; this just stops the button before the user hits a SQL error.
  const isCategoryLocked = (c: KBCategory): boolean => c.access_level === 'agent' || c.is_locked === true;

  const handleDelete = async (category: KBCategory) => {
    if (isCategoryLocked(category)) {
      toast({
        title: 'Locked',
        description: 'Agent-readable categories cannot be deleted because they host docs the platform reads at runtime (e.g. Internal Configuration → Job Research Sites).',
        variant: 'destructive',
      });
      return;
    }
    if (!confirm(`Delete category "${category.name}"? Documents in this category will become uncategorized.`)) return;

    try {
      // Null out category_id on any docs referencing this category (avoids FK violation)
      await supabase
        .from('kb_docs')
        .update({ category_id: null })
        .eq('category_id', category.id)
        .eq('workspace_id', workspaceId);

      const { error } = await supabase
        .from('kb_categories')
        .delete()
        .eq('id', category.id)
        .eq('workspace_id', workspaceId);

      if (error) throw error;

      toast({ title: 'Success', description: 'Category deleted' });
      loadCategories();
    } catch (error) {
      console.error('Failed to delete category:', error);
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to delete category', variant: 'destructive' });
    }
  };

  const handleSave = async () => {
    if (!editingCategory.name) {
      toast({
        title: 'Validation Error',
        description: 'Category name is required',
        variant: 'destructive',
      });
      return;
    }

    try {
      if (isEditing && editingCategory.id) {
        const { error } = await supabase
          .from('kb_categories')
          .update({
            name: editingCategory.name,
            description: editingCategory.description,
            icon: editingCategory.icon,
            color: editingCategory.color,
            sort_order: editingCategory.sort_order,
            access_level: editingCategory.access_level,
            is_locked: editingCategory.is_locked === true,
            // Only persist trigger_keyword for agent-level categories; clear it otherwise
            trigger_keyword: editingCategory.access_level === 'agent'
              ? (editingCategory.trigger_keyword?.trim() || null)
              : null,
          })
          .eq('id', editingCategory.id)
          .eq('workspace_id', workspaceId);

        if (error) throw error;
        toast({ title: 'Success', description: 'Category updated successfully' });
      } else {
        const { error } = await supabase
          .from('kb_categories')
          .insert({
            ...editingCategory,
            workspace_id: workspaceId,
          });

        if (error) throw error;
        toast({ title: 'Success', description: 'Category created successfully' });
      }

      setShowEditor(false);
      loadCategories();
    } catch (error) {
      console.error('Failed to save category:', error);
      toast({
        title: 'Error',
        description: 'Failed to save category',
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Categories</CardTitle>
            <Button onClick={handleCreate} className="rounded-full">
              <Plus className="h-4 w-4 mr-2" />
              New Category
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-center py-8">Loading categories...</div>
          ) : categories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No categories found. Create your first category to organize documents.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Icon</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead>Documents</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((category) => {
                  const accessConfig = ACCESS_LEVEL_CONFIG[category.access_level ?? 'agent'];
                  return (
                    <TableRow key={category.id}>
                      <TableCell>
                        <span className="text-2xl">{category.icon}</span>
                      </TableCell>
                      <TableCell className="font-medium">
                        <button
                          type="button"
                          className={`flex items-center gap-2 text-left ${onViewDocuments ? 'hover:text-primary hover:underline' : ''}`}
                          onClick={() => onViewDocuments?.(category.id)}
                          title={onViewDocuments ? 'View documents in this category' : undefined}
                          disabled={!onViewDocuments}
                        >
                          <div
                            className="w-3 h-3 rounded-full flex-shrink-0"
                            style={{ backgroundColor: category.color }}
                          />
                          {category.name}
                        </button>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {category.description}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${accessConfig.className}`}>
                            {accessConfig.emoji} {accessConfig.label}
                          </span>
                          {category.access_level === 'agent' && category.trigger_keyword && (
                            <span className="text-xs text-muted-foreground">
                              🔑 keyword: <code className="bg-muted px-1 rounded">{category.trigger_keyword}</code>
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          className={`tabular-nums ${onViewDocuments ? 'hover:text-primary hover:underline' : ''}`}
                          onClick={() => onViewDocuments?.(category.id)}
                          title={onViewDocuments ? 'View documents in this category' : undefined}
                          disabled={!onViewDocuments}
                        >
                          {category.document_count || 0}
                        </button>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {onViewDocuments && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="View documents in this category"
                              onClick={() => onViewDocuments(category.id)}
                            >
                              <ListFilter className="h-4 w-4" />
                            </Button>
                          )}
                          {category.access_level === 'public' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="View on public KB"
                              onClick={() => window.open('/knowledge-base', '_blank')}
                            >
                              <ExternalLink className="h-4 w-4 text-blue-500" />
                            </Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(category)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isCategoryLocked(category)}
                            title={isCategoryLocked(category) ? 'Locked — agent-readable category' : 'Delete'}
                            onClick={() => handleDelete(category)}
                          >
                            {isCategoryLocked(category)
                              ? <Lock className="h-4 w-4 text-amber-500 opacity-60" />
                              : <Trash2 className="h-4 w-4" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Category Editor Dialog */}
      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent aria-describedby="category-editor-description">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit Category' : 'Create Category'}</DialogTitle>
            <p id="category-editor-description" className="text-sm text-muted-foreground">
              {isEditing ? 'Update this category' : 'Create a new category to organize your knowledge base documents'}
            </p>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={editingCategory.name}
                onChange={(e) =>
                  setEditingCategory({ ...editingCategory, name: e.target.value })
                }
                placeholder="Enter category name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={editingCategory.description}
                onChange={(e) =>
                  setEditingCategory({ ...editingCategory, description: e.target.value })
                }
                placeholder="Enter category description"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="icon">Icon</Label>
                <Input
                  id="icon"
                  value={editingCategory.icon}
                  onChange={(e) =>
                    setEditingCategory({ ...editingCategory, icon: e.target.value })
                  }
                  placeholder="📁"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="color">Color</Label>
                <Input
                  id="color"
                  type="color"
                  value={editingCategory.color}
                  onChange={(e) =>
                    setEditingCategory({ ...editingCategory, color: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="access_level">Access Level</Label>
              <Select
                value={editingCategory.access_level ?? 'agent'}
                onValueChange={(value: 'admin' | 'agent' | 'public') =>
                  setEditingCategory({ ...editingCategory, access_level: value, trigger_keyword: value !== 'agent' ? null : editingCategory.trigger_keyword })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">🔒 Admin Only — restricted to admin panel</SelectItem>
                  <SelectItem value="agent">🤖 Agent — admin panel + JARVIS agent search</SelectItem>
                  <SelectItem value="public">🌍 Public — public pages + agent (always)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Trigger keyword — only shown for agent-level categories */}
            {(editingCategory.access_level ?? 'agent') === 'agent' && (
              <div className="space-y-2">
                <Label htmlFor="trigger_keyword">Trigger Keyword <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  id="trigger_keyword"
                  value={editingCategory.trigger_keyword ?? ''}
                  onChange={(e) =>
                    setEditingCategory({ ...editingCategory, trigger_keyword: e.target.value || null })
                  }
                  placeholder='e.g. "PRD" — leave blank to always include'
                />
                <p className="text-xs text-muted-foreground">
                  If set, the agent only searches this category when the query contains this keyword (case-insensitive). Leave blank to always include when the agent searches.
                </p>
              </div>
            )}

            {/* Lock — protects every doc in the category from deletion */}
            <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="cat_lock">Lock category</Label>
                <p className="text-xs text-muted-foreground">
                  When locked, every document in this category is protected from deletion and platform reset (unless a doc is explicitly unlocked).
                </p>
              </div>
              <Switch
                id="cat_lock"
                checked={editingCategory.is_locked === true}
                onCheckedChange={(checked) => setEditingCategory({ ...editingCategory, is_locked: checked })}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowEditor(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave}>
                {isEditing ? 'Update Category' : 'Create Category'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
