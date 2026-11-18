import React, { useEffect, useMemo, useState } from 'react';
import { CreditCard, Key, Mail, Plus, Trash2, Users } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Checkbox } from '@/components/core/ui/checkbox';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import { TablePagination, clampPage, paginate } from '@/components/core/ui/table-pagination';
import { FilterBar, useFilters } from '@/components/core/filters';
import {
  HubCellEmpty, HubCellLink, HubEmptyState, HubSortButton, useHubTable, type HubTableField,
} from '@/components/core/hub';
import { HubStatGrid, HubStatTile } from '@/components/core/hub/HubStatTile';
import { PageHeader } from '@/components/shared/PageHeader';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { usersAPI } from '@/services/crm.service';
import { crmCategoriesService, isHandAssignableKind, type CrmCategorySummary } from '@/services/crmCategoriesService';
import { humanizeLabel } from '@/utils/humanize';
import { statusTone } from '@/utils/statusTone';
import { CrmBulkBar, type BulkSelectAction } from '@/modules/crm/components/CrmBulkBar';
import { PROFESSIONAL_TYPE_OPTIONS, STATUS_OPTIONS, professionalTypeLabel, roleLabel, type Option } from '@/modules/crm/crmConstants';
import { buildUserFilters } from '@/modules/crm/pages/crmFilters';
import { CRM_USER_FILTER_KEY } from '@/modules/crm/routes';

interface UserWithAuth {
  id: string;
  user_id: string;
  email: string;
  role_id?: string;
  subscription_tier?: string;
  status?: string;
  professional_type?: string;
  credits?: number;
  created_at: string;
  roles?: { id: string; name: string; level: number };
}

interface Role { id: string; name: string; level: number }

const USER_FIELDS: HubTableField<UserWithAuth>[] = [
  { id: 'email', sortValue: (u) => u.email },
  { id: 'tier', sortValue: (u) => (u.roles?.name ? roleLabel(u.roles.name) : null) },
  { id: 'type', sortValue: (u) => professionalTypeLabel(u.professional_type) || null },
  { id: 'subscription', sortValue: (u) => u.subscription_tier },
  { id: 'credits', sortValue: (u) => u.credits ?? 0 },
  { id: 'status', sortValue: (u) => u.status },
];

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value); else next.add(value);
  return next;
}

/** Platform accounts — the global account tier, never a per-workspace team role (that is Profile → Team). */
const UsersPage: React.FC = () => {
  const { toast } = useToast();
  const { activeWorkspaceId } = useWorkspace();

  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserWithAuth[]>([]);
  const [unreadable, setUnreadable] = useState(false);
  const [roles, setRoles] = useState<Role[]>([]);
  const [categories, setCategories] = useState<CrmCategorySummary[]>([]);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [creating, setCreating] = useState(false);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await usersAPI.listUsers();
      setUsers(response.data || []);
      setUnreadable(false);
    } catch (error: any) {
      // A refusal is a permission state, not "0 users" — the tiles are withheld rather than reading as a fact.
      if (error?.status === 401 || error?.status === 403) {
        setUsers([]);
        setUnreadable(true);
        return;
      }
      toast({ title: 'Error', description: `Failed to load users: ${error.message}`, variant: 'destructive' });
    } finally { setLoading(false); }
  };

  const loadRoles = async () => {
    const { data, error } = await supabase.from('roles').select('id, name, level').order('level', { ascending: true });
    if (error) console.error('Error loading roles:', error);
    else setRoles(data || []);
  };

  const loadCategories = async () => {
    try { setCategories(await crmCategoriesService.list(activeWorkspaceId)); }
    catch (error) { console.error('Error loading categories:', error); }
  };

  useEffect(() => { void loadUsers(); void loadRoles(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void loadCategories(); }, [activeWorkspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const roleOptions: Option[] = useMemo(() => roles.map((r) => ({ value: r.id, label: roleLabel(r.name) })), [roles]);
  const subscriptionOptions: Option[] = useMemo(() =>
    [...new Set(users.map((u) => u.subscription_tier).filter(Boolean))].sort().map((s) => ({ value: s as string, label: s as string })),
    [users]);
  // A workspace's own categories hold contacts and companies only — never platform users.
  const categoryOptions: Option[] = useMemo(
    () => categories
      .filter((c) => c.is_active && !c.workspace_id && isHandAssignableKind(c.kind))
      .map((c) => ({ value: c.id, label: c.name })),
    [categories]);

  const groups = useMemo(() => buildUserFilters({ roleOptions, subscriptionOptions }), [roleOptions, subscriptionOptions]);
  const { values, setValues, filtered, previewCount } = useFilters(users, groups, { urlKey: CRM_USER_FILTER_KEY });
  const filterActive = Object.keys(values).length > 0;

  useEffect(() => { setPage(1); }, [values]);
  useEffect(() => { setPage((p) => clampPage(p, filtered.length)); }, [filtered.length]);

  const table = useHubTable(filtered, USER_FIELDS);
  const paged = useMemo(() => paginate(table.rows, page), [table.rows, page]);
  const sortHead = (id: string, label: string, align?: 'right') => (
    <HubSortButton align={align} active={table.sort?.columnId === id ? table.sort.direction : undefined} onClick={() => table.toggleSort(id)}>
      {label}
    </HubSortButton>
  );
  const ariaSort = (id: string) =>
    table.sort?.columnId === id ? (table.sort.direction === 'asc' ? 'ascending' : 'descending') : undefined;
  const allSelected = filtered.length > 0 && filtered.every((u) => selected.has(u.user_id));

  const stats = useMemo(() => ({
    total: users.length,
    active: users.filter((u) => u.status === 'active').length,
    inactive: users.filter((u) => u.status === 'inactive').length,
  }), [users]);

  const runBulk = async (ids: string[], op: (id: string) => Promise<unknown>, verb: string, after: () => Promise<void>) => {
    setBulkBusy(true);
    try {
      // Sequential on purpose: parallel user deletes (each cascades a workspace) exhaust the lock table.
      const failures: string[] = [];
      let ok = 0;
      for (const id of ids) {
        try { await op(id); ok += 1; } catch (e) { failures.push(e instanceof Error ? e.message : String(e)); }
      }
      const fail = failures.length;
      toast({
        title: fail ? `${verb}: ${ok} done, ${fail} failed` : `${verb} ${ok}`,
        description: fail ? [...new Set(failures)].slice(0, 2).join(' · ') : undefined,
        variant: fail && ok === 0 ? 'destructive' : 'default',
      });
      setSelected(new Set());
      await after();
    } finally { setBulkBusy(false); }
  };

  const applyBulk = async (action: string, value: string) => {
    const ids = [...selected];
    if (action === 'category') return runBulk(ids, (uid) => crmCategoriesService.addMember(value, { user_id: uid }), 'Added to category', loadCategories);
    const patch = action === 'role' ? { role_id: value } : action === 'status' ? { status: value } : { professional_type: value };
    return runBulk(ids, (uid) => usersAPI.updateUser(uid, patch), 'Updated', loadUsers);
  };

  const bulkActions: BulkSelectAction[] = [
    { key: 'role', label: 'Set account tier', placeholder: 'Pick a tier', options: roleOptions },
    { key: 'status', label: 'Set status', placeholder: 'Pick a status', options: STATUS_OPTIONS },
    { key: 'profession', label: 'Professional Type', placeholder: 'Pick a type', options: PROFESSIONAL_TYPE_OPTIONS },
    { key: 'category', label: 'Add to category', placeholder: 'Pick a category', options: categoryOptions },
  ];

  const handleDelete = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try { await usersAPI.deleteUser(userId); toast({ title: 'Success', description: 'User deleted' }); void loadUsers(); }
    catch (e) { toast({ title: 'Error', description: e instanceof Error ? e.message : 'Failed to delete user', variant: 'destructive' }); }
  };

  const openAdd = () => { setNewEmail(''); setNewPassword(''); setNewDisplayName(''); setShowAdd(true); };
  const handleCreate = async () => {
    if (!newEmail || !newPassword) { toast({ title: 'Validation Error', description: 'Email and password are required', variant: 'destructive' }); return; }
    try {
      setCreating(true);
      const { error } = await supabase.auth.signUp({ email: newEmail, password: newPassword, options: { data: { display_name: newDisplayName } } });
      if (error) throw error;
      toast({ title: 'Success', description: 'User created. They will receive a confirmation email.' });
      setShowAdd(false); await loadUsers();
    } catch (error: any) { toast({ title: 'Error', description: error.message || 'Failed to create user', variant: 'destructive' }); }
    finally { setCreating(false); }
  };

  const handleRoleChange = async (userId: string, roleId: string) => {
    const prev = users;
    const nextRole = roles.find((r) => r.id === roleId);
    setUsers((list) => list.map((u) => (u.user_id === userId ? { ...u, role_id: roleId, roles: nextRole } : u)));
    try {
      await usersAPI.updateUser(userId, { role_id: roleId });
      toast({ title: 'Role updated', description: nextRole ? `Set to ${nextRole.name}` : undefined });
    } catch (error: any) {
      setUsers(prev);
      toast({ title: 'Failed to update role', description: error?.message, variant: 'destructive' });
    }
  };

  const handleResetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth?reset=true` });
      if (error) throw error;
      toast({ title: 'Success', description: 'Password reset email sent' });
    } catch (error: any) { toast({ title: 'Error', description: error.message || 'Failed to send reset email', variant: 'destructive' }); }
  };

  return (
    <div>
      <PageHeader
        icon={Users}
        title="Users"
        subtitle="Platform accounts: account tier, subscription, credits and status. Team roles are per workspace and live in Profile → Team."
        actions={<Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-2" /> Add user</Button>}
      />

      <div className="space-y-4 p-3 sm:p-6">
        {!unreadable && (
          <HubStatGrid>
            <HubStatTile label="Total Users" value={loading ? '—' : stats.total} category="Registered accounts" />
            <HubStatTile label="Active" value={loading ? '—' : stats.active} category="Status active" />
            <HubStatTile label="Inactive" value={loading ? '—' : stats.inactive} category="Status inactive" />
          </HubStatGrid>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Accounts</CardTitle>
            <CardDescription>Set the global account tier inline; open an account for its full record.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <FilterBar
              groups={groups} values={values} onChange={setValues} previewCount={previewCount}
              title="Filter users" searchPlaceholder="Search by email…"
            />
            {selected.size > 0 && (
              <CrmBulkBar
                count={selected.size} actions={bulkActions} busy={bulkBusy}
                onApply={applyBulk}
                onDelete={() => runBulk([...selected], (uid) => usersAPI.deleteUser(uid), 'Deleted', loadUsers)}
                onClear={() => setSelected(new Set())}
              />
            )}
            <div className="rounded-md border border-hairline">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox checked={allSelected} onCheckedChange={(v) =>
                        setSelected(v ? new Set(filtered.map((u) => u.user_id)) : new Set())} aria-label="Select all" />
                    </TableHead>
                    <TableHead aria-sort={ariaSort('email')}>{sortHead('email', 'Email')}</TableHead>
                    <TableHead aria-sort={ariaSort('tier')}>{sortHead('tier', 'Account Tier')}</TableHead>
                    <TableHead aria-sort={ariaSort('type')} className="hidden lg:table-cell">{sortHead('type', 'Type')}</TableHead>
                    <TableHead aria-sort={ariaSort('subscription')} className="hidden md:table-cell">{sortHead('subscription', 'Subscription')}</TableHead>
                    <TableHead aria-sort={ariaSort('credits')} className="hidden text-right sm:table-cell">{sortHead('credits', 'Credits', 'right')}</TableHead>
                    <TableHead aria-sort={ariaSort('status')}>{sortHead('status', 'Status')}</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-4">Loading...</TableCell></TableRow>
                  ) : unreadable ? (
                    <TableRow className="hover:bg-transparent"><TableCell colSpan={8} className="p-0">
                      <HubEmptyState icon={Users} title="The account list could not be read" description="This session is not allowed to list platform accounts." />
                    </TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow className="hover:bg-transparent"><TableCell colSpan={8} className="p-0">
                      <HubEmptyState
                        variant={filterActive ? 'filtered' : 'empty'}
                        icon={Users}
                        title={filterActive ? 'No users match your filters' : 'No users yet'}
                        description={filterActive
                          ? 'Widen the filter to see the rest of the account list.'
                          : 'Platform accounts appear here once somebody signs up or is invited.'}
                        action={filterActive
                          ? <Button size="sm" variant="outline" onClick={() => setValues({})}>Clear filters</Button>
                          : <Button size="sm" onClick={openAdd}><Plus /> Add user</Button>}
                      />
                    </TableCell></TableRow>
                  ) : paged.map((user) => (
                    <TableRow key={user.id} data-state={selected.has(user.user_id) ? 'selected' : undefined}>
                      <TableCell>
                        <Checkbox checked={selected.has(user.user_id)} onCheckedChange={() => setSelected((s) => toggle(s, user.user_id))} aria-label="Select row" />
                      </TableCell>
                      <TableCell className="max-w-[20rem] font-medium">
                        <HubCellLink to={`/admin/users/${user.user_id}`} className="inline-flex max-w-full items-center gap-2">
                          <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="block min-w-0 max-w-[16rem] truncate" title={user.email}>{user.email}</span>
                        </HubCellLink>
                      </TableCell>
                      <TableCell>
                        <Select value={user.role_id || ''} onValueChange={(v) => handleRoleChange(user.user_id, v)}>
                          <SelectTrigger className="h-8 w-[150px]"><SelectValue placeholder="No role" /></SelectTrigger>
                          <SelectContent>
                            {roles.map((r) => <SelectItem key={r.id} value={r.id}>{roleLabel(r.name)}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{professionalTypeLabel(user.professional_type) || <HubCellEmpty />}</TableCell>
                      <TableCell className="hidden md:table-cell"><span className="text-xs text-muted-foreground capitalize">{humanizeLabel(user.subscription_tier)}</span></TableCell>
                      <TableCell className="hidden sm:table-cell"><div className="flex items-center justify-end gap-2 tabular-nums"><CreditCard className="h-4 w-4 text-muted-foreground" />{user.credits || 0}</div></TableCell>
                      <TableCell><span className={`text-xs capitalize ${statusTone(user.status)}`}>{humanizeLabel(user.status)}</span></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => handleResetPassword(user.email)} title="Reset password"><Key className="h-4 w-4 text-blue-500" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(user.user_id)} title="Delete user"><Trash2 className="h-4 w-4 text-red-500" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination page={page} total={filtered.length} onPageChange={setPage} label="users" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>Create a new user account. They will receive a confirmation email.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="new-email">Email *</Label>
              <Input id="new-email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="user@example.com" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="new-password">Password *</Label>
              <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Minimum 6 characters" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="new-displayName">Display Name</Label>
              <Input id="new-displayName" value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} placeholder="John Doe" className="mt-1" />
            </div>
            <p className="text-sm text-muted-foreground">After creating the user, you can edit their role, subscription, and other details from their profile page.</p>
            <div className="flex flex-wrap justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowAdd(false)} disabled={creating}>Cancel</Button>
              <Button onClick={handleCreate} disabled={creating}>{creating ? 'Creating...' : 'Create User'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UsersPage;
