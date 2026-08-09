import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Tags, Plus, Trash2, Loader2, RefreshCw, Users, Building2, User as UserIcon,
  Lock, Search, X,
} from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
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
import { useToast } from '@/hooks/use-toast';
import {
  crmCategoriesService,
  type CrmCategorySummary,
  type CrmCategoryMember,
  type CrmCategoryKind,
} from '@/services/crmCategoriesService';
import { supabase } from '@/integrations/supabase/client';
import { FilterBar, useFilters } from '@/components/core/filters';
import { CRM_CATEGORY_FILTERS } from './crmCategoryFilters';
import { formatNumber } from '@/utils/decimal';

const KIND_LABELS: Record<CrmCategoryKind, string> = {
  professional_type: 'Professional type',
  role: 'Access role',
  employment: 'Employment (HR)',
  manual: 'Custom',
  industry: 'Industry',
  lead_status: 'Lead status',
  lead_source: 'Lead source',
};

const KIND_VARIANTS: Record<CrmCategoryKind, 'default' | 'secondary' | 'outline'> = {
  professional_type: 'secondary',
  role: 'outline',
  employment: 'secondary',
  manual: 'default',
  industry: 'secondary',
  lead_status: 'outline',
  lead_source: 'outline',
};

/** Kinds whose MEMBERS are derived by `crm_resync_auto_category_members`, not typed by hand.
 *  Each one names the table that answers the question, so nobody re-invents the answer:
 *    professional_type → user_profiles.professional_type
 *    role             → workspace_members.role   ("who is a sales manager?")
 *    employment       → hr_employees             ("who actually works here?")
 *  An operator may still pin someone manually on top; manual rows survive resync. */
const AUTO_KINDS: CrmCategoryKind[] = ['professional_type', 'role', 'employment'];

/** What each auto kind derives FROM — shown next to the group heading. */
const AUTO_SOURCE: Partial<Record<CrmCategoryKind, string>> = {
  professional_type: 'user_profiles.professional_type',
  role: 'workspace_members.role — the access role that decides which portal they land on',
  employment: 'hr_employees — the HR module’s own roster, incl. departments and line managers',
};

/** Pick-one attribute vocabularies — stored as a string on the contact, not as
 * a membership list. They have no members, so the card opens Edit (not the
 * members dialog) and the member-count footer is hidden. */
const VOCAB_KINDS: CrmCategoryKind[] = ['lead_status', 'lead_source'];

export const CategoriesPanel: React.FC = () => {
  const { toast } = useToast();

  const [categories, setCategories] = useState<CrmCategorySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createColor, setCreateColor] = useState('#22c55e');
  const [createKind, setCreateKind] = useState<'manual' | 'industry' | 'lead_status' | 'lead_source'>('manual');

  const [editing, setEditing] = useState<CrmCategorySummary | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editActive, setEditActive] = useState(true);

  const [membersOpen, setMembersOpen] = useState<CrmCategorySummary | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setCategories(await crmCategoriesService.list());
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to load', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const { values, setValues, filtered, previewCount } = useFilters(categories, CRM_CATEGORY_FILTERS);

  const grouped = useMemo(() => {
    const out: Record<CrmCategoryKind, CrmCategorySummary[]> = {
      professional_type: [], role: [], employment: [], manual: [], industry: [], lead_status: [], lead_source: [],
    };
    for (const c of filtered) out[c.kind].push(c);
    return out;
  }, [filtered]);

  const totals = useMemo(() => categories.reduce((acc, c) => ({
    categories: acc.categories + 1,
    users: acc.users + c.user_count,
    contacts: acc.contacts + c.contact_count,
    companies: acc.companies + c.company_count,
  }), { categories: 0, users: 0, contacts: 0, companies: 0 }), [categories]);

  const handleResync = async () => {
    setBusyAction('resync');
    try {
      const result = await crmCategoriesService.resyncAuto();
      const inserts = result.reduce((acc, r) => acc + r.out_inserts, 0);
      const deletes = result.reduce((acc, r) => acc + r.out_deletes, 0);
      toast({ title: 'Resync complete', description: `+${inserts} added · −${deletes} removed across the derived (access role / employment / professional type) categories.` });
      load();
    } catch (err) {
      toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' });
    } finally { setBusyAction(null); }
  };

  const handleCreate = async () => {
    if (!createName.trim()) return;
    setBusyAction('create');
    try {
      await crmCategoriesService.create({
        name: createName.trim(),
        description: createDescription.trim() || undefined,
        color_hex: createColor || undefined,
        kind: createKind,
      });
      toast({ title: 'Category created' });
      setShowCreate(false);
      setCreateName(''); setCreateDescription(''); setCreateColor('#22c55e'); setCreateKind('manual');
      load();
    } catch (err) {
      toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' });
    } finally { setBusyAction(null); }
  };

  const openEdit = (c: CrmCategorySummary) => {
    setEditing(c);
    setEditName(c.name);
    setEditDescription(c.description || '');
    setEditColor(c.color_hex || '');
    setEditActive(c.is_active);
  };

  const handleEditSave = async () => {
    if (!editing) return;
    setBusyAction('edit');
    try {
      await crmCategoriesService.update(editing.id, {
        name: editName.trim(),
        description: editDescription.trim() || null as any,
        color_hex: editColor || null as any,
        is_active: editActive,
      });
      toast({ title: 'Category updated' });
      setEditing(null);
      load();
    } catch (err) {
      toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' });
    } finally { setBusyAction(null); }
  };

  const handleDelete = async (c: CrmCategorySummary) => {
    const autoNote = AUTO_KINDS.includes(c.kind)
      ? ` This is derived from ${AUTO_SOURCE[c.kind]}, so it will reappear on the next "Resync auto".`
      : '';
    if (!window.confirm(`Delete "${c.name}"? Members are removed but the underlying users / contacts stay.${autoNote}`)) return;
    try {
      await crmCategoriesService.remove(c.id);
      toast({ title: 'Deleted' });
      load();
    } catch (err) {
      toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-sm text-muted-foreground max-w-2xl space-y-1">
          <p>Group platform users + CRM contacts + companies into lists — used by "Send to Customers" and other outreach. Every category here is fully editable: rename, recolour, toggle active, add/remove members, or delete.</p>
          <p className="text-xs">
            <b className="text-foreground">Access role</b>, <b className="text-foreground">Employment</b> and <b className="text-foreground">Professional type</b> lists are <i>derived</i> — their members come from
            {' '}<code className="text-foreground">workspace_members.role</code>, <code className="text-foreground">hr_employees</code> and <code className="text-foreground">user_profiles.professional_type</code> respectively, and re-sync on "Resync auto".
            That is how "who is a sales manager / an employee" is answered: you set it where it belongs (invite someone with that role, or hire them in HR) and the list follows.
            You can still pin extra people onto a derived list by hand — manual rows survive resync. <b className="text-foreground">Custom</b> lists are entirely yours.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleResync} disabled={busyAction === 'resync'}>
            {busyAction === 'resync' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Resync auto
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" /> New category
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniStat icon={Tags}      label="Categories" value={totals.categories} />
          <MiniStat icon={UserIcon}  label="Users"      value={totals.users} />
          <MiniStat icon={Users}     label="Contacts"   value={totals.contacts} />
          <MiniStat icon={Building2} label="Companies"  value={totals.companies} />
        </div>

        <FilterBar
          groups={CRM_CATEGORY_FILTERS}
          values={values}
          onChange={setValues}
          previewCount={previewCount}
          title="Filter categories"
          searchPlaceholder="Search categories"
        />

        {loading ? (
          <div className="flex items-center gap-2 py-12 justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading categories…
          </div>
        ) : (
          <div className="space-y-6">
            {(['role', 'employment', 'lead_status', 'lead_source', 'industry', 'manual', 'professional_type'] as CrmCategoryKind[]).map((kind) => {
              const list = grouped[kind];
              if (list.length === 0) return null;
              return (
                <div key={kind} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                      {KIND_LABELS[kind]}
                    </h2>
                    <Badge variant={KIND_VARIANTS[kind]} className="text-[10px] py-0">{list.length}</Badge>
                    {AUTO_KINDS.includes(kind) && (
                      <span className="text-xs text-muted-foreground">— derived from {AUTO_SOURCE[kind]}</span>
                    )}
                    {VOCAB_KINDS.includes(kind) && (
                      <span className="text-xs text-muted-foreground">— pick-one options for the contact {kind === 'lead_status' ? 'Lead Status' : 'Lead Source'} dropdown</span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {list.map((c) => (
                      <Card key={c.id} className="dashboard-card cursor-pointer hover:border-primary/40" onClick={() => (VOCAB_KINDS.includes(c.kind) ? openEdit(c) : setMembersOpen(c))}>
                        <CardContent className="p-4 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              {c.color_hex && (
                                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: c.color_hex }} />
                              )}
                              <div className="font-medium truncate">{c.name}</div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {!c.is_active && <Lock className="h-3 w-3 text-muted-foreground" />}
                              <Badge variant="outline" className="text-[10px] py-0">{KIND_LABELS[c.kind]}</Badge>
                            </div>
                          </div>
                          {c.description && <p className="text-xs text-muted-foreground line-clamp-2">{c.description}</p>}
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex gap-3 text-muted-foreground">
                              {VOCAB_KINDS.includes(c.kind) ? (
                                <span>option</span>
                              ) : (
                                <>
                                  <span>{c.total_count} total</span>
                                  {c.user_count > 0    && <span>{c.user_count}u</span>}
                                  {c.contact_count > 0 && <span>{c.contact_count}c</span>}
                                  {c.company_count > 0 && <span>{c.company_count}co</span>}
                                </>
                              )}
                            </div>
                            <div className="flex gap-1" role="presentation" onClick={(e) => e.stopPropagation()}>
                              <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>Edit</Button>
                              <Button size="sm" variant="ghost" onClick={() => handleDelete(c)} title={c.kind !== 'manual' ? 'Delete (auto categories reappear on resync)' : 'Delete'}>
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={(v) => !v && setShowCreate(false)}>
        <DialogContent>
          <DialogHeader><DialogTitle>New CRM Category</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={createKind} onValueChange={(v) => setCreateKind(v as 'manual' | 'industry' | 'lead_status' | 'lead_source')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Custom list</SelectItem>
                  <SelectItem value="industry">Industry</SelectItem>
                  <SelectItem value="lead_status">Lead status</SelectItem>
                  <SelectItem value="lead_source">Lead source</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {createKind === 'industry'
                  ? 'Industries are the taxonomy you assign to companies (multi-select on the company page).'
                  : createKind === 'lead_status'
                    ? 'Pick-one options for a contact’s Lead Status dropdown.'
                    : createKind === 'lead_source'
                      ? 'Pick-one options for a contact’s Lead Source dropdown.'
                      : 'A free-form list you assign people / companies to.'}
              </p>
            </div>
            <div className="space-y-1">
              <Label>Name *</Label>
              <Input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder={createKind === 'industry' ? 'e.g. Hospitality, Retail, Architecture' : 'e.g. Newsletter VIPs'} />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea value={createDescription} onChange={(e) => setCreateDescription(e.target.value)} rows={2} placeholder="What this list is for" />
            </div>
            <div className="space-y-1">
              <Label>Color</Label>
              <div className="flex items-center gap-2">
                <Input type="color" value={createColor} onChange={(e) => setCreateColor(e.target.value)} className="w-16 h-9 p-1" />
                <Input value={createColor} onChange={(e) => setCreateColor(e.target.value)} className="flex-1" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={busyAction === 'create' || !createName.trim()}>
              {busyAction === 'create' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Category</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2} />
              </div>
              <div className="space-y-1">
                <Label>Color</Label>
                <div className="flex items-center gap-2">
                  <Input type="color" value={editColor || '#888888'} onChange={(e) => setEditColor(e.target.value)} className="w-16 h-9 p-1" />
                  <Input value={editColor || ''} onChange={(e) => setEditColor(e.target.value)} className="flex-1" placeholder="#22c55e" />
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2">
                <Checkbox id="active" checked={editActive} onCheckedChange={(v) => setEditActive(v === true)} />
                <Label htmlFor="active" className="cursor-pointer">Active</Label>
              </div>
              {AUTO_KINDS.includes(editing.kind) && (
                <p className="text-xs text-muted-foreground">
                  Derived from {AUTO_SOURCE[editing.kind]} — value "{editing.source_value}". You can rename, recolour, toggle Active, and add/remove members freely; auto members just re-sync on "Resync auto". (Only the slug/kind/source stay fixed so the sync keeps matching.)
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={busyAction === 'edit'}>
              {busyAction === 'edit' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Members dialog */}
      {membersOpen && (
        <CategoryMembersDialog
          category={membersOpen}
          onClose={() => { setMembersOpen(null); load(); }}
        />
      )}
    </div>
  );
};

const MiniStat: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}> = ({ icon: Icon, label, value }) => (
  <Card className="dashboard-card">
    <CardContent className="p-3 flex flex-col gap-1">
      <div className="text-xs text-muted-foreground flex items-center gap-1"><Icon className="h-3 w-3" /> {label}</div>
      <div className="text-2xl font-light">{formatNumber(value)}</div>
    </CardContent>
  </Card>
);

const CategoryMembersDialog: React.FC<{
  category: CrmCategorySummary;
  onClose: () => void;
}> = ({ category, onClose }) => {
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
      const [usersRes, contactsRes, companiesRes] = await Promise.all([
        supabase.from('user_profiles').select('user_id, full_name, email').or(`email.ilike.%${q}%,full_name.ilike.%${q}%`).limit(10),
        supabase.from('crm_contacts').select('id, name, email').or(`email.ilike.%${q}%,name.ilike.%${q}%`).limit(10),
        supabase.from('crm_companies').select('id, name, email').or(`email.ilike.%${q}%,name.ilike.%${q}%`).limit(10),
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
            {category.color_hex && <span className="w-3 h-3 rounded-full" style={{ background: category.color_hex }} />}
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
              placeholder="Search users, contacts, companies by name or email"
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
                No members yet. Search above to add users / contacts / companies, or click "Resync auto" on the categories page if this is a synced category.
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
