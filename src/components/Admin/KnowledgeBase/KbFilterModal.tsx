import React, { useEffect, useMemo, useState } from 'react';
import { Filter, Trash2, FolderTree } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Label } from '@/components/core/ui/label';
import { ScrollArea } from '@/components/core/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { KBCategory } from '@/services/knowledgeBaseService';

export interface KbDocFilters {
  statuses: string[];
  visibilities: string[];
  categoryIds: string[];
  embeddingStatuses: string[];
}

export const EMPTY_KB_FILTERS: KbDocFilters = {
  statuses: [],
  visibilities: [],
  categoryIds: [],
  embeddingStatuses: [],
};

export function countActiveFilters(filters: KbDocFilters): number {
  return (
    filters.statuses.length +
    filters.visibilities.length +
    filters.categoryIds.length +
    filters.embeddingStatuses.length
  );
}

const UNCATEGORIZED = '__uncategorized__';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
];

const VISIBILITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'public', label: '🌍 Public' },
  { value: 'private', label: '🔒 Private' },
];

const EMBEDDING_OPTIONS: { value: string; label: string }[] = [
  { value: 'success', label: 'Success' },
  { value: 'pending', label: 'Pending' },
  { value: 'failed', label: 'Failed' },
];

export function applyKbFiltersToQuery<T extends { eq: Function; in: Function; is: Function; or: Function }>(
  query: T,
  filters: KbDocFilters,
): T {
  let q: any = query;

  if (filters.statuses.length > 0) q = q.in('status', filters.statuses);
  if (filters.visibilities.length > 0) q = q.in('visibility', filters.visibilities);
  if (filters.embeddingStatuses.length > 0) q = q.in('embedding_status', filters.embeddingStatuses);

  if (filters.categoryIds.length > 0) {
    const hasUncat = filters.categoryIds.includes(UNCATEGORIZED);
    const realIds = filters.categoryIds.filter((id) => id !== UNCATEGORIZED);
    if (hasUncat && realIds.length > 0) {
      const inList = realIds.join(',');
      q = q.or(`category_id.is.null,category_id.in.(${inList})`);
    } else if (hasUncat) {
      q = q.is('category_id', null);
    } else {
      q = q.in('category_id', realIds);
    }
  }

  return q as T;
}

interface KbFilterModalProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  initialFilters: KbDocFilters;
  onApply: (filters: KbDocFilters) => void;
  onDeleteAllMatching: (filters: KbDocFilters, matchCount: number) => Promise<void> | void;
}

export const KbFilterModal: React.FC<KbFilterModalProps> = ({
  open,
  onClose,
  workspaceId,
  initialFilters,
  onApply,
  onDeleteAllMatching,
}) => {
  const [filters, setFilters] = useState<KbDocFilters>(initialFilters);
  const [categories, setCategories] = useState<KBCategory[]>([]);
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) setFilters(initialFilters);
  }, [open, initialFilters]);

  useEffect(() => {
    if (!open || !workspaceId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('kb_categories')
        .select('id, name, color, icon, access_level, sort_order')
        .eq('workspace_id', workspaceId)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (!cancelled && !error && data) setCategories(data as KBCategory[]);
    })();
    return () => { cancelled = true; };
  }, [open, workspaceId]);

  useEffect(() => {
    if (!open || !workspaceId) return;
    let cancelled = false;
    setCountLoading(true);
    (async () => {
      try {
        let query: any = supabase
          .from('kb_docs')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', workspaceId);
        query = applyKbFiltersToQuery(query, filters);
        const { count, error } = await query;
        if (cancelled) return;
        if (error) {
          setMatchCount(null);
        } else {
          setMatchCount(count ?? 0);
        }
      } finally {
        if (!cancelled) setCountLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, workspaceId, filters]);

  const activeCount = useMemo(() => countActiveFilters(filters), [filters]);

  const toggle = (key: keyof KbDocFilters, value: string) => {
    setFilters((prev) => {
      const arr = prev[key];
      const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
      return { ...prev, [key]: next };
    });
  };

  const clearAll = () => setFilters(EMPTY_KB_FILTERS);

  const handleApply = () => {
    onApply(filters);
    onClose();
  };

  const handleDeleteAllMatching = async () => {
    if (matchCount == null || matchCount === 0) return;
    if (activeCount === 0) {
      toast({
        title: 'Refusing to delete',
        description: 'Pick at least one filter — deleting all documents requires explicit filters.',
        variant: 'destructive',
      });
      return;
    }
    const ok = window.confirm(
      `Delete ${matchCount} document${matchCount === 1 ? '' : 's'} matching the current filters? This cannot be undone.`,
    );
    if (!ok) return;
    setDeleting(true);
    try {
      await onDeleteAllMatching(filters, matchCount);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filter documents
            {activeCount > 0 && (
              <Badge variant="secondary" className="rounded-full">{activeCount} active</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Pick any combination of filters, preview the match count, then apply or bulk-delete the matching documents.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mr-6 pr-6">
          <div className="space-y-6 py-2">
            <section>
              <Label className="text-sm font-medium">Status</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {STATUS_OPTIONS.map((opt) => (
                  <FilterChip
                    key={opt.value}
                    label={opt.label}
                    checked={filters.statuses.includes(opt.value)}
                    onToggle={() => toggle('statuses', opt.value)}
                  />
                ))}
              </div>
            </section>

            <section>
              <Label className="text-sm font-medium">Visibility</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {VISIBILITY_OPTIONS.map((opt) => (
                  <FilterChip
                    key={opt.value}
                    label={opt.label}
                    checked={filters.visibilities.includes(opt.value)}
                    onToggle={() => toggle('visibilities', opt.value)}
                  />
                ))}
              </div>
            </section>

            <section>
              <Label className="text-sm font-medium">Embedding</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {EMBEDDING_OPTIONS.map((opt) => (
                  <FilterChip
                    key={opt.value}
                    label={opt.label}
                    checked={filters.embeddingStatuses.includes(opt.value)}
                    onToggle={() => toggle('embeddingStatuses', opt.value)}
                  />
                ))}
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <FolderTree className="h-4 w-4" />
                  Categories
                </Label>
                {filters.categoryIds.length > 0 && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setFilters((p) => ({ ...p, categoryIds: [] }))}
                  >
                    Clear categories
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                <CategoryRow
                  id={UNCATEGORIZED}
                  label="Uncategorized"
                  icon="📄"
                  checked={filters.categoryIds.includes(UNCATEGORIZED)}
                  onToggle={() => toggle('categoryIds', UNCATEGORIZED)}
                />
                {categories.map((cat) => (
                  <CategoryRow
                    key={cat.id}
                    id={cat.id}
                    label={cat.name}
                    icon={cat.icon || '📁'}
                    color={cat.color}
                    accessLevel={cat.access_level}
                    checked={filters.categoryIds.includes(cat.id)}
                    onToggle={() => toggle('categoryIds', cat.id)}
                  />
                ))}
                {categories.length === 0 && (
                  <p className="text-sm text-muted-foreground col-span-full">No categories found.</p>
                )}
              </div>
            </section>
          </div>
        </ScrollArea>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between border-t pt-4 mt-2">
          <div className="flex items-center gap-3">
            <Button type="button" variant="ghost" size="sm" onClick={clearAll} disabled={activeCount === 0}>
              Clear all
            </Button>
            <span className="text-sm text-muted-foreground">
              {countLoading
                ? 'Counting…'
                : matchCount == null
                  ? '—'
                  : `Matches ${matchCount} document${matchCount === 1 ? '' : 's'}`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteAllMatching}
              disabled={deleting || countLoading || !matchCount || activeCount === 0}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {deleting ? 'Deleting…' : `Delete ${matchCount ?? 0} matching`}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={handleApply}>
              Apply filters
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const FilterChip: React.FC<{ label: string; checked: boolean; onToggle: () => void }> = ({ label, checked, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
      checked
        ? 'bg-primary text-primary-foreground border-primary'
        : 'bg-transparent text-foreground border-border hover:bg-muted'
    }`}
  >
    {label}
  </button>
);

const CategoryRow: React.FC<{
  id: string;
  label: string;
  icon: string;
  color?: string;
  accessLevel?: 'admin' | 'agent' | 'public';
  checked: boolean;
  onToggle: () => void;
}> = ({ id, label, icon, color, accessLevel, checked, onToggle }) => (
  <label
    htmlFor={`kb-cat-${id}`}
    className={`flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer transition-colors ${
      checked ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
    }`}
  >
    <Checkbox id={`kb-cat-${id}`} checked={checked} onCheckedChange={onToggle} />
    <span className="text-base" style={color ? { color } : undefined}>{icon}</span>
    <span className="text-sm flex-1 truncate">{label}</span>
    {accessLevel && (
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{accessLevel}</span>
    )}
  </label>
);
