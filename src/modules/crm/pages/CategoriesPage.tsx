import React, { useCallback, useEffect, useState } from 'react';
import {
  Tags, Plus, Trash2, Loader2, RefreshCw, Lock, Search, X, Package, Pencil,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import { Textarea } from '@/components/core/ui/textarea';
import { getErrorMessage } from '@/core/errors/utils';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/core/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  crmCategoriesService,
  type CrmCategorySummary,
  type CrmCategoryMember,
  type CrmCategoryKind,
} from '@/services/crmCategoriesService';
import { supabase } from '@/integrations/supabase/client';
import { CRM_SEARCH_COLUMN, foldedLike } from '@/services/crmSearch';
import { FilterBar, useFilters } from '@/components/core/filters';
import { CRM_CATEGORY_FILTERS } from './crmCategoryFilters';
import { formatNumber } from '@/utils/decimal';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { CategoryColorPicker } from '@/components/business/crm/CategoryColorPicker';
import { CategoryChip, CategoryDot } from '@/components/business/crm/CategoryMultiSelect';
import { DEFAULT_CATEGORY_COLOR } from '@/components/business/crm/categoryColors';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';

const KIND_LABELS: Record<CrmCategoryKind, string> = {
  professional_type: 'Professional type',
  role: 'Access role',
  employment: 'Employment (HR)',
  manual: 'Custom',
  industry: 'Industry',
  lead_status: 'Lead status',
  lead_source: 'Lead source',
};

/** Kinds whose members are derived by `crm_resync_auto_category_members`; operator-only surface. */
const AUTO_KINDS: CrmCategoryKind[] = ['professional_type', 'role', 'employment'];

const AUTO_SOURCE: Partial<Record<CrmCategoryKind, string>> = {
  professional_type: 'user_profiles.professional_type',
  role: 'workspace_members.role',
  employment: 'hr_employees',
};

/** Pick-one vocabularies: stored as a string on the contact, so they have no members. */
const VOCAB_KINDS: CrmCategoryKind[] = ['lead_status', 'lead_source'];

/** Row order: your own first, then the shared lists people actually pick from, then the derived ones. */
const KIND_ORDER: CrmCategoryKind[] = ['manual', 'industry', 'lead_status', 'lead_source', 'role', 'employment', 'professional_type'];

type NewKind = 'workspace' | 'industry' | 'lead_status' | 'lead_source';

interface FormState {
  id: string | null;
  kind: NewKind;
  name: string;
  description: string;
  color: string;
  active: boolean;
  materialId: string | null;
}

export const CategoriesPanel: React.FC = () => {
  const { toast } = useToast();
  const { activeWorkspaceId, activeWorkspace, workspaceRole, isPlatformOperator } = useWorkspace();
  const canManageOwn = !!activeWorkspaceId && (workspaceRole === 'owner' || workspaceRole === 'admin');
  const isOperator = !!isPlatformOperator;

  const [categories, setCategories] = useState<CrmCategorySummary[]>([]);
  const [materialCats, setMaterialCats] = useState<Array<{ id: string; name: string; category_key: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [membersOpen, setMembersOpen] = useState<CrmCategorySummary | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [list, mats] = await Promise.all([
        crmCategoriesService.list(activeWorkspaceId),
        isOperator ? crmCategoriesService.listMaterialCategories() : Promise.resolve([]),
      ]);
      // Derived lists describe platform accounts — operator surface only.
      setCategories(list
        .filter((c) => isOperator || !AUTO_KINDS.includes(c.kind))
        .sort((a, b) => Number(!a.workspace_id) - Number(!b.workspace_id)
          || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)
          || a.name.localeCompare(b.name)));
      setMaterialCats(mats);
    } catch (err) {
      toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId, isOperator, toast]);

  useEffect(() => { load(); }, [load]);

  const { values, setValues, filtered, previewCount } = useFilters(categories, CRM_CATEGORY_FILTERS);
  const ownCount = categories.filter((c) => c.workspace_id).length;

  const canEdit = (c: CrmCategorySummary) => (c.workspace_id ? canManageOwn : isOperator);
  const canCreate = canManageOwn || isOperator;

  const materialLabel = useCallback(
    (id: string) => materialCats.find((m) => m.id === id)?.name ?? 'Product category (inactive)',
    [materialCats],
  );

  const openCreate = () => setForm({
    id: null, kind: canManageOwn ? 'workspace' : 'industry', name: '', description: '',
    color: DEFAULT_CATEGORY_COLOR, active: true, materialId: null,
  });
  const openEdit = (c: CrmCategorySummary) => setForm({
    id: c.id,
    kind: c.workspace_id ? 'workspace' : (c.kind === 'lead_status' || c.kind === 'lead_source' ? c.kind : 'industry'),
    name: c.name, description: c.description ?? '', color: c.color_hex || DEFAULT_CATEGORY_COLOR,
    active: c.is_active, materialId: c.material_category_id ?? null,
  });
  const editing = form?.id ? categories.find((c) => c.id === form.id) ?? null : null;

  const handleSave = async () => {
    if (!form || !form.name.trim()) return;
    setBusyAction('save');
    try {
      if (editing) {
        if (editing.kind === 'industry' && form.materialId !== (editing.material_category_id ?? null)) {
          await crmCategoriesService.setMaterialMatch(editing.id, form.materialId);
        }
        await crmCategoriesService.update(editing.id, {
          name: form.name.trim(), description: form.description.trim() || null,
          color_hex: form.color, is_active: form.active,
        });
      } else if (form.kind === 'workspace') {
        if (!activeWorkspaceId) throw new Error('No active workspace.');
        await crmCategoriesService.create({
          name: form.name.trim(), description: form.description.trim() || undefined,
          color_hex: form.color, kind: 'manual', workspace_id: activeWorkspaceId,
        });
      } else {
        await crmCategoriesService.create({
          name: form.name.trim(), description: form.description.trim() || undefined,
          color_hex: form.color, kind: form.kind,
        });
      }
      toast({ title: editing ? 'Category updated' : 'Category created' });
      setForm(null);
      load();
    } catch (err) {
      toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' });
    } finally { setBusyAction(null); }
  };

  const handleDelete = async (c: CrmCategorySummary) => {
    const autoNote = AUTO_KINDS.includes(c.kind) ? ' It is derived, so it reappears on the next "Resync auto".' : '';
    if (!window.confirm(`Delete "${c.name}"? The contacts and companies in it are kept; only the category goes.${autoNote}`)) return;
    try {
      await crmCategoriesService.remove(c.id);
      toast({ title: 'Deleted' });
      load();
    } catch (err) {
      toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' });
    }
  };

  const handleResync = async () => {
    setBusyAction('resync');
    try {
      const result = await crmCategoriesService.resyncAuto();
      const inserts = result.reduce((acc, r) => acc + r.out_inserts, 0);
      const deletes = result.reduce((acc, r) => acc + r.out_deletes, 0);
      toast({ title: 'Resync complete', description: `+${inserts} added · −${deletes} removed across the derived categories.` });
      load();
    } catch (err) {
      toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' });
    } finally { setBusyAction(null); }
  };

  const handleSyncSupply = async () => {
    setBusyAction('supply');
    try {
      const result = await crmCategoriesService.syncSupplyCategories();
      const created = result.filter((r) => r.out_action === 'created').length;
      const matched = result.filter((r) => r.out_action === 'matched').length;
      const retired = result.filter((r) => r.out_action === 'retired').length;
      toast({
        title: 'Product categories matched',
        description: `${created} added · ${matched} existing matched · ${retired} retired. Members are never dropped.`,
      });
      load();
    } catch (err) {
      toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' });
    } finally { setBusyAction(null); }
  };

  const openRow = (c: CrmCategorySummary) => {
    if (VOCAB_KINDS.includes(c.kind)) { if (canEdit(c)) openEdit(c); return; }
    setMembersOpen(c);
  };

  return (
    <Card className="dashboard-card">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base"><Tags className="h-4 w-4 text-muted-foreground" />Categories</CardTitle>
          <CardDescription className="max-w-2xl">
            Tag contacts and companies, filter the CRM and target campaigns. <b className="text-foreground">Custom</b> categories
            are private to {activeWorkspace?.name ?? 'this workspace'}
            {canManageOwn ? '' : ' and only its owner or an admin can change them'}; the others are shared lists every workspace uses.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          {isOperator && (
            <>
              <Button variant="outline" size="sm" onClick={handleResync} disabled={busyAction === 'resync'} title="Re-derive access role / employment / professional type members">
                {busyAction === 'resync' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Resync auto
              </Button>
              <Button variant="outline" size="sm" onClick={handleSyncSupply} disabled={busyAction === 'supply'} title="Bring the product-import categories in as Industry lists">
                {busyAction === 'supply' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Package className="mr-2 h-4 w-4" />}
                Match product categories
              </Button>
            </>
          )}
          {canCreate && (
            <Button size="sm" onClick={openCreate}><Plus className="mr-2 h-4 w-4" />New category</Button>
          )}
        </div>
      </CardHeader>

      <div className="border-t border-hairline bg-surface-sunken px-4 py-2">
        <FilterBar
          groups={CRM_CATEGORY_FILTERS}
          values={values}
          onChange={setValues}
          previewCount={previewCount}
          title="Filter categories"
          searchPlaceholder="Search categories"
        />
      </div>

      {canManageOwn && !loading && ownCount === 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            You have not made a custom category yet — e.g. "VIP", "Architects" or "Newsletter", each with its own colour.
          </span>
          <Button size="sm" variant="secondary" onClick={openCreate}><Plus className="mr-2 h-4 w-4" />Create your first</Button>
        </div>
      )}

      <CardContent className="p-0">
        {loading ? (
          <div className="flex items-center gap-2 py-12 justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading categories…
          </div>
        ) : filtered.length === 0 ? (
          <HubEmptyState
            icon={Search}
            variant="filtered"
            title="Nothing matches these filters"
            action={<Button size="sm" variant="outline" onClick={() => setValues({})}>Clear filters</Button>}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="hidden lg:table-cell">Description</TableHead>
                <TableHead className="text-right">Contacts</TableHead>
                <TableHead className="text-right">Companies</TableHead>
                {isOperator && <TableHead className="text-right">Users</TableHead>}
                <TableHead className="w-[1%]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => {
                const vocab = VOCAB_KINDS.includes(c.kind);
                return (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => openRow(c)}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <CategoryChip name={c.name} color={c.color_hex} />
                        {!c.is_active && <Lock className="h-3 w-3 text-muted-foreground" aria-label="Inactive" />}
                      </div>
                      {isOperator && c.kind === 'industry' && (
                        <div className={`mt-1 flex items-center gap-1 text-xs ${c.material_category_id ? 'text-muted-foreground' : 'text-amber-800 dark:text-amber-300'}`}>
                          <Package className="h-3 w-3 shrink-0" />
                          {c.material_category_id ? materialLabel(c.material_category_id) : 'No product category — edit to match one'}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {c.workspace_id ? (
                        <Badge variant="info">Custom</Badge>
                      ) : (
                        <span className="flex items-center gap-1.5 whitespace-nowrap">
                          <Badge variant="neutral">{KIND_LABELS[c.kind]}</Badge>
                          <span className="text-xs text-muted-foreground" title={AUTO_SOURCE[c.kind] ? `Derived from ${AUTO_SOURCE[c.kind]}` : undefined}>
                            {AUTO_KINDS.includes(c.kind) ? 'auto' : 'shared'}
                          </span>
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      <span className="line-clamp-1">{c.description || '—'}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{vocab ? '—' : formatNumber(c.contact_count)}</TableCell>
                    <TableCell className="text-right tabular-nums">{vocab ? '—' : formatNumber(c.company_count)}</TableCell>
                    {isOperator && <TableCell className="text-right tabular-nums">{vocab ? '—' : formatNumber(c.user_count)}</TableCell>}
                    <TableCell>
                      {canEdit(c) && (
                        <div className="flex justify-end gap-1" role="presentation" onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" variant="ghost" onClick={() => openEdit(c)} aria-label={`Edit ${c.name}`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(c)} aria-label={`Delete ${c.name}`}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={!!form} onOpenChange={(v) => !v && setForm(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form?.id ? 'Edit category' : 'New category'}</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-4">
              {!form.id && isOperator && (
                <div className="space-y-1">
                  <Label>Type</Label>
                  <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as NewKind })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {canManageOwn && <SelectItem value="workspace">Custom — private to {activeWorkspace?.name ?? 'this workspace'}</SelectItem>}
                      <SelectItem value="industry">Industry — shared</SelectItem>
                      <SelectItem value="lead_status">Lead status option — shared</SelectItem>
                      <SelectItem value="lead_source">Lead source option — shared</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1">
                <Label>Name *</Label>
                <Input
                  autoFocus
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleSave(); } }}
                  placeholder={form.kind === 'industry' ? 'e.g. Hospitality' : 'e.g. VIP customers'}
                />
              </div>
              <div className="space-y-2">
                <Label>Colour</Label>
                <CategoryColorPicker value={form.color} onChange={(color) => setForm({ ...form, color })} />
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="What this category is for" />
              </div>
              {form.id && (
                <div className="flex items-center gap-2">
                  <Checkbox id="cat-active" checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v === true })} />
                  <Label htmlFor="cat-active" className="cursor-pointer">Active</Label>
                </div>
              )}
              {editing?.kind === 'industry' && (
                <div className="space-y-1 border-t border-hairline pt-3">
                  <Label>Product category</Label>
                  <Select value={form.materialId ?? '__none'} onValueChange={(v) => setForm({ ...form, materialId: v === '__none' ? null : v })}>
                    <SelectTrigger><SelectValue placeholder="Not matched" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Not matched</SelectItem>
                      {materialCats
                        .filter((m) => m.id === form.materialId || !categories.some((c) => c.material_category_id === m.id))
                        .map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Which product-import category this industry means. Leave it unmatched for an industry the catalogue has no word for.
                  </p>
                </div>
              )}
              {editing && AUTO_KINDS.includes(editing.kind) && (
                <p className="text-xs text-muted-foreground">
                  Derived from {AUTO_SOURCE[editing.kind]} (value "{editing.source_value}"). Members re-sync on "Resync auto".
                </p>
              )}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                Preview <CategoryChip name={form.name.trim() || 'Category'} color={form.color} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={busyAction === 'save' || !form?.name.trim()}>
              {busyAction === 'save' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {form?.id ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {membersOpen && (
        <CategoryMembersDialog category={membersOpen} onClose={() => { setMembersOpen(null); load(); }} />
      )}
    </Card>
  );
};

const CategoryMembersDialog: React.FC<{
  category: CrmCategorySummary;
  onClose: () => void;
}> = ({ category, onClose }) => {
  // A workspace's own list holds only that workspace's contacts and companies.
  const ws = category.workspace_id;
  const { toast } = useToast();
  const [members, setMembers] = useState<CrmCategoryMember[]>([]);
  const [loading, setLoading] = useState(true);

  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ kind: 'user' | 'contact' | 'company'; id: string; name: string; email: string | null }>>([]);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try { setMembers(await crmCategoriesService.listMembers(category.id)); }
    catch (err) { toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [category.id, toast]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  const handleSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    try {
      const contacts = supabase.from('crm_contacts').select('id, name, email').ilike(CRM_SEARCH_COLUMN, foldedLike(q));
      const companies = supabase.from('crm_companies').select('id, name, email').ilike(CRM_SEARCH_COLUMN, foldedLike(q));
      const [usersRes, contactsRes, companiesRes] = await Promise.all([
        ws
          ? Promise.resolve({ data: [] as unknown[] })
          : supabase.from('user_profiles').select('user_id, full_name, email').or(`email.ilike.%${q}%,full_name.ilike.%${q}%`).limit(10),
        (ws ? contacts.eq('workspace_id', ws) : contacts).limit(10),
        (ws ? companies.eq('workspace_id', ws) : companies).limit(10),
      ]);
      const out: typeof searchResults = [];
      for (const r of (usersRes.data || []) as any[]) {
        out.push({ kind: 'user', id: r.user_id, name: r.full_name || '(no name)', email: r.email });
      }
      for (const r of (contactsRes.data || []) as any[]) {
        out.push({ kind: 'contact', id: r.id, name: r.name, email: r.email });
      }
      for (const r of (companiesRes.data || []) as any[]) {
        out.push({ kind: 'company', id: r.id, name: r.name, email: r.email });
      }
      setSearchResults(out);
    } catch (err) {
      toast({ title: 'Search failed', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setSearching(false);
    }
  };

  const handleAdd = async (target: { kind: 'user' | 'contact' | 'company'; id: string }) => {
    try {
      const arg =
        target.kind === 'user' ? { user_id: target.id } :
        target.kind === 'contact' ? { crm_contact_id: target.id } :
        { crm_company_id: target.id };
      await crmCategoriesService.addMember(category.id, arg as any);
      toast({ title: 'Added' });
      setSearchResults((prev) => prev.filter((r) => !(r.id === target.id && r.kind === target.kind)));
      loadMembers();
    } catch (err) {
      toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' });
    }
  };

  const handleRemove = async (memberId: string) => {
    try {
      await crmCategoriesService.removeMember(memberId);
      loadMembers();
    } catch (err) {
      toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' });
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CategoryDot color={category.color_hex} className="h-3 w-3" />
            {category.name}
            <Badge variant="outline">{members.length} members</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto pr-1">
          <div className="flex gap-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder={ws ? 'Search contacts and companies by name or email' : 'Search users, contacts, companies by name or email'}
            />
            <Button onClick={handleSearch} disabled={searching || !searchQuery.trim()}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>

          {searchResults.length > 0 && (
            <div className="border rounded p-2 space-y-1">
              <div className="text-xs text-muted-foreground">Search results</div>
              {searchResults.map((r) => (
                <div key={`${r.kind}-${r.id}`} className="flex items-center gap-2 text-sm py-1">
                  <span className="text-[10px] text-muted-foreground capitalize">{r.kind}</span>
                  <span className="font-medium">{r.name}</span>
                  {r.email && <span className="text-xs text-muted-foreground">{r.email}</span>}
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={() => handleAdd(r)}>
                    <Plus className="h-3 w-3" /> Add
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="border-t pt-3">
            <div className="text-xs text-muted-foreground mb-2">Members</div>
            {loading ? (
              <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
            ) : members.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">
                {ws
                  ? 'Nobody is in this category. Search above, or tag them from a contact or company page.'
                  : 'No members yet. Search above to add users / contacts / companies, or click "Resync auto" on the categories page if this is a synced category.'}
              </div>
            ) : (
              <div className="space-y-1">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 text-sm border-b py-2">
                    <span className="text-[10px] text-muted-foreground capitalize">{m.member_kind}</span>
                    <span className="text-[10px] text-muted-foreground capitalize">{m.source}</span>
                    <span className="font-medium truncate">{m.display_name || '(unnamed)'}</span>
                    <span className="text-xs text-muted-foreground truncate">{m.display_email || ''}</span>
                    <Button size="sm" variant="ghost" className="ml-auto" onClick={() => handleRemove(m.id)}>
                      <X className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CategoriesPanel;
