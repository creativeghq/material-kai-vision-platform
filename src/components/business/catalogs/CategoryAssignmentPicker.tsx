/**
 * CategoryAssignmentPicker — which CRM categories a user / contact / company belongs to, as one
 * colour-coded multi-select. Workspace owners/admins can create a category from inside it.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Tags } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { crmCategoriesService, type CrmCategorySummary } from '@/services/crmCategoriesService';
import { getErrorMessage } from '@/core/errors/utils';
import { CategoryMultiSelect, type CategoryOption } from '@/components/business/crm/CategoryMultiSelect';

type Target =
  | { kind: 'user'; id: string }
  | { kind: 'contact'; id: string }
  | { kind: 'company'; id: string };

interface Props {
  target: Target;
  className?: string;
  /** Render just the body (no Card chrome) for embedding in a CollapsibleCard. */
  bare?: boolean;
}

/**
 * What this picker owns. A workspace's own lists hold only its contacts/companies (RLS refuses a
 * platform user), and role / employment / industry / lead kinds have their own UIs or are derived.
 */
function assignableHere(c: CrmCategorySummary, target: Target): boolean {
  if (!c.is_active) return false;
  if (c.workspace_id) return target.kind !== 'user';
  if (c.kind === 'manual') return true;
  return c.kind === 'professional_type' && target.kind !== 'user';
}

function groupLabel(c: CrmCategorySummary): string {
  if (c.workspace_id) return 'Your categories';
  return c.kind === 'professional_type' ? 'Professional type' : 'Platform lists';
}

export const CategoryAssignmentPicker: React.FC<Props> = ({ target, className, bare = false }) => {
  const { toast } = useToast();
  const { activeWorkspaceId, workspaceRole } = useWorkspace();
  const canCreate = !!activeWorkspaceId && target.kind !== 'user'
    && (workspaceRole === 'owner' || workspaceRole === 'admin');

  const [categories, setCategories] = useState<CrmCategorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [memberOf, setMemberOf] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // Depend on the primitive kind/id, NOT the `target` object — the parent passes a fresh literal.
  const refreshMemberships = useCallback(async () => {
    const ids =
      target.kind === 'user'    ? await crmCategoriesService.listMembershipsForUser(target.id) :
      target.kind === 'contact' ? await crmCategoriesService.listMembershipsForContact(target.id) :
                                  await crmCategoriesService.listMembershipsForCompany(target.id);
    setMemberOf(new Set(ids));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.kind, target.id]);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const list = await crmCategoriesService.list(activeWorkspaceId);
      setCategories(list);
      await refreshMemberships();
    } catch (err) {
      toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId, refreshMemberships, toast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const assignable = useMemo(
    // eslint-disable-next-line react-hooks/exhaustive-deps
    () => categories.filter((c) => assignableHere(c, target))
      .sort((a, b) => Number(!a.workspace_id) - Number(!b.workspace_id) || a.name.localeCompare(b.name)),
    [categories, target.kind],
  );
  const options: CategoryOption[] = useMemo(
    () => assignable.map((c) => ({ id: c.id, name: c.name, color_hex: c.color_hex, group: groupLabel(c) })),
    [assignable],
  );

  const save = async (next: Set<string>, scope: CrmCategorySummary[]) => {
    setMemberOf(next);
    setSaving(true);
    try {
      // ONLY what this picker renders: a full replace deletes what the supply picker just wrote.
      const scopeIds = scope.map((c) => c.id);
      const selected = scopeIds.filter((id) => next.has(id));
      if (target.kind === 'user') {
        await crmCategoriesService.setMembershipsForUser(target.id, selected);
      } else if (target.kind === 'contact') {
        await crmCategoriesService.setContactMembershipsWithinScope(target.id, scopeIds, selected);
      } else {
        await crmCategoriesService.setCompanyMembershipsWithinScope(target.id, scopeIds, selected);
      }
    } catch (err) {
      toast({ title: 'Save failed', description: getErrorMessage(err), variant: 'destructive' });
      await refreshMemberships();
    } finally { setSaving(false); }
  };

  const toggle = (categoryId: string) => {
    const next = new Set(memberOf);
    if (next.has(categoryId)) next.delete(categoryId); else next.add(categoryId);
    void save(next, assignable);
  };

  const create = async (name: string, color: string): Promise<CategoryOption> => {
    if (!activeWorkspaceId) throw new Error('No active workspace.');
    const created = await crmCategoriesService.create({ name, color_hex: color, kind: 'manual', workspace_id: activeWorkspaceId });
    const summary: CrmCategorySummary = {
      ...created, user_count: 0, contact_count: 0, company_count: 0, total_count: 0,
    };
    setCategories((prev) => [...prev, summary]);
    await save(new Set([...memberOf, created.id]), [...assignable, summary]);
    toast({ title: 'Category created', description: name });
    return { id: created.id, name: created.name, color_hex: created.color_hex, group: groupLabel(summary) };
  };

  const body = loading ? (
    <div className="flex items-center gap-2 py-3 text-muted-foreground text-sm">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
    </div>
  ) : (
    <div className="space-y-2">
      <CategoryMultiSelect
        options={options}
        value={assignable.filter((c) => memberOf.has(c.id)).map((c) => c.id)}
        onToggle={toggle}
        onCreate={canCreate ? create : undefined}
        saving={saving}
        placeholder={options.length === 0 && !canCreate ? 'No categories yet' : 'Add categories…'}
      />
      {options.length === 0 && !canCreate && (
        <p className="text-xs text-muted-foreground">
          Your workspace owner can create categories in{' '}
          <a href="/crm?tab=categories" className="text-primary hover:underline">CRM → Categories</a>.
        </p>
      )}
    </div>
  );

  if (bare) return <div className={cn('space-y-4', className)}>{body}</div>;

  return (
    <Card className={className}>
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2">
          <Tags className="h-4 w-4" /> CRM Categories
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">{body}</CardContent>
    </Card>
  );
};
