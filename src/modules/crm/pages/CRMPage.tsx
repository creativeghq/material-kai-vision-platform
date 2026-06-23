import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Users, Building2, Trash2, Mail, CreditCard, Key, ExternalLink, Tags } from 'lucide-react';

import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Badge } from '@/components/core/ui/badge';
import { Checkbox } from '@/components/core/ui/checkbox';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';
import { WorkspaceQuotaBadge } from '@/components/core/WorkspaceQuotaBadge';
import { AdminStatCard } from '@/components/Admin/AdminStatCard';
import { usersAPI, contactsAPI, companiesAPI } from '@/services/crm.service';
import { crmCategoriesService, type CrmCategorySummary } from '@/services/crmCategoriesService';
import { CategoriesPanel } from './CategoriesPage';
import { CrmFilters, type FilterDef } from '../components/CrmFilters';
import { CrmBulkBar, type BulkSelectAction } from '../components/CrmBulkBar';
import {
  ANY, PROFESSIONAL_TYPE_OPTIONS, STATUS_OPTIONS, CLIENT_SUPPLIER_OPTIONS,
  professionalTypeLabel, type Option,
} from '../crmConstants';

const TAB_VALUES = ['users', 'contacts', 'companies', 'categories'] as const;
type TabValue = typeof TAB_VALUES[number];

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

interface Contact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  profession?: string;
  status?: string;
  is_client?: boolean;
  is_supplier?: boolean;
  notes?: string;
  created_at: string;
}

interface Role { id: string; name: string; level: number }

/** Toggle a value's presence in a Set (returns a new Set). */
function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value); else next.add(value);
  return next;
}

export const CRMManagement: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();

  const initialTab: TabValue = (() => {
    const t = searchParams.get('tab');
    return (TAB_VALUES as readonly string[]).includes(t || '') ? (t as TabValue) : 'users';
  })();
  const [activeTab, setActiveTab] = useState<TabValue>(initialTab);
  const handleTabChange = (val: string) => {
    const next = (TAB_VALUES as readonly string[]).includes(val) ? (val as TabValue) : 'users';
    setActiveTab(next);
    const params = new URLSearchParams(searchParams);
    if (next === 'users') params.delete('tab'); else params.set('tab', next);
    setSearchParams(params, { replace: true });
  };

  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UserWithAuth[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [categories, setCategories] = useState<CrmCategorySummary[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [userStats, setUserStats] = useState({ total: 0, active: 0, inactive: 0 });

  // Per-tab filters (ANY = no filter)
  const [userF, setUserF] = useState({ role: ANY, status: ANY, subscription: ANY, profession: ANY });
  const [contactF, setContactF] = useState({ profession: ANY, status: ANY, company: ANY, clientSupplier: ANY, category: ANY });
  const [companyF, setCompanyF] = useState({ profession: ANY, status: ANY, customerSupplier: ANY, category: ANY });

  // Category-filter member sets (fetched on demand)
  const [contactCatIds, setContactCatIds] = useState<Set<string> | null>(null);
  const [companyCatIds, setCompanyCatIds] = useState<Set<string> | null>(null);

  // Per-tab selection (users keyed by user_id; contacts/companies by id)
  const [selUsers, setSelUsers] = useState<Set<string>>(new Set());
  const [selContacts, setSelContacts] = useState<Set<string>>(new Set());
  const [selCompanies, setSelCompanies] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // Add-user modal
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserDisplayName, setNewUserDisplayName] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);

  const loadRoles = async () => {
    try {
      const { data, error } = await supabase.from('roles').select('id, name, level').order('level', { ascending: true });
      if (error) throw error;
      setRoles(data || []);
    } catch (error: any) { console.error('Error loading roles:', error); }
  };

  const loadCategories = async () => {
    try { setCategories(await crmCategoriesService.list()); }
    catch (error: any) { console.error('Error loading categories:', error); }
  };

  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await usersAPI.listUsers();
      setUsers(response.data || []);
      setUserStats({
        total: response.data?.length || 0,
        active: response.data?.filter((u) => u.status === 'active').length || 0,
        inactive: response.data?.filter((u) => u.status === 'inactive').length || 0,
      });
    } catch (error: any) {
      toast({ title: 'Error', description: `Failed to load users: ${error.message}`, variant: 'destructive' });
    } finally { setLoading(false); }
  };

  const loadContacts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('crm_contacts').select('*').order('created_at', { ascending: false }).limit(500);
      if (error) throw error;
      setContacts(data || []);
    } catch (error: any) {
      toast({ title: 'Error', description: `Failed to load contacts: ${error.message}`, variant: 'destructive' });
    } finally { setLoading(false); }
  };

  const loadCompanies = async () => {
    try {
      setLoading(true);
      const response = await companiesAPI.listCompanies(500, 0);
      setCompanies(response.data || []);
    } catch (error: any) {
      toast({ title: 'Error', description: `Failed to load companies: ${error.message}`, variant: 'destructive' });
    } finally { setLoading(false); }
  };

  useEffect(() => {
    loadRoles(); loadCategories(); loadUsers(); loadContacts(); loadCompanies();
  }, []);

  // Fetch member ids when the contacts category filter changes
  useEffect(() => {
    if (!contactF.category || contactF.category === ANY) { setContactCatIds(null); return; }
    let cancelled = false;
    crmCategoriesService.listMembers(contactF.category).then((members) => {
      if (cancelled) return;
      setContactCatIds(new Set(members.filter((m) => m.crm_contact_id).map((m) => m.crm_contact_id as string)));
    }).catch(() => setContactCatIds(new Set()));
    return () => { cancelled = true; };
  }, [contactF.category]);

  useEffect(() => {
    if (!companyF.category || companyF.category === ANY) { setCompanyCatIds(null); return; }
    let cancelled = false;
    crmCategoriesService.listMembers(companyF.category).then((members) => {
      if (cancelled) return;
      setCompanyCatIds(new Set(members.filter((m) => m.crm_company_id).map((m) => m.crm_company_id as string)));
    }).catch(() => setCompanyCatIds(new Set()));
    return () => { cancelled = true; };
  }, [companyF.category]);

  // ── option lists ──────────────────────────────────────────────────────────
  const roleOptions: Option[] = useMemo(() => roles.map((r) => ({ value: r.id, label: r.name })), [roles]);
  const categoryOptions: Option[] = useMemo(() => categories.map((c) => ({ value: c.id, label: c.name })), [categories]);
  const companyNameOptions: Option[] = useMemo(() =>
    [...new Set(companies.map((c) => c.name).filter(Boolean))].sort().map((n) => ({ value: n as string, label: n as string })),
    [companies]);
  const subscriptionOptions: Option[] = useMemo(() =>
    [...new Set(users.map((u) => u.subscription_tier).filter(Boolean))].sort().map((s) => ({ value: s as string, label: s as string })),
    [users]);

  // ── filtered lists ────────────────────────────────────────────────────────
  const q = searchTerm.toLowerCase();
  const filteredUsers = useMemo(() => users.filter((u) =>
    (u.email.toLowerCase().includes(q) || u.user_id.toLowerCase().includes(q)) &&
    (userF.role === ANY || u.role_id === userF.role) &&
    (userF.status === ANY || u.status === userF.status) &&
    (userF.subscription === ANY || u.subscription_tier === userF.subscription) &&
    (userF.profession === ANY || u.professional_type === userF.profession),
  ), [users, q, userF]);

  const filteredContacts = useMemo(() => contacts.filter((c) =>
    (c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q)) &&
    (contactF.profession === ANY || c.profession === contactF.profession) &&
    (contactF.status === ANY || c.status === contactF.status) &&
    (contactF.company === ANY || c.company === contactF.company) &&
    (contactF.clientSupplier === ANY ||
      (contactF.clientSupplier === 'client' && c.is_client) ||
      (contactF.clientSupplier === 'supplier' && c.is_supplier) ||
      (contactF.clientSupplier === 'neither' && !c.is_client && !c.is_supplier)) &&
    (!contactCatIds || contactCatIds.has(c.id)),
  ), [contacts, q, contactF, contactCatIds]);

  const filteredCompanies = useMemo(() => companies.filter((c) =>
    (c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.website?.toLowerCase().includes(q)) &&
    (companyF.profession === ANY || c.profession === companyF.profession) &&
    (companyF.status === ANY || c.status === companyF.status) &&
    (companyF.customerSupplier === ANY ||
      (companyF.customerSupplier === 'client' && c.is_customer) ||
      (companyF.customerSupplier === 'supplier' && c.is_supplier) ||
      (companyF.customerSupplier === 'neither' && !c.is_customer && !c.is_supplier)) &&
    (!companyCatIds || companyCatIds.has(c.id)),
  ), [companies, q, companyF, companyCatIds]);

  // ── selection helpers ─────────────────────────────────────────────────────
  const allUsersSelected = filteredUsers.length > 0 && filteredUsers.every((u) => selUsers.has(u.user_id));
  const allContactsSelected = filteredContacts.length > 0 && filteredContacts.every((c) => selContacts.has(c.id));
  const allCompaniesSelected = filteredCompanies.length > 0 && filteredCompanies.every((c) => selCompanies.has(c.id));

  // ── bulk runner ───────────────────────────────────────────────────────────
  const runBulk = async (ids: string[], op: (id: string) => Promise<unknown>, verb: string, after: () => Promise<void>, clear: () => void) => {
    setBulkBusy(true);
    try {
      const results = await Promise.allSettled(ids.map(op));
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      const fail = results.length - ok;
      toast({
        title: fail ? `${verb}: ${ok} done, ${fail} failed` : `${verb} ${ok}`,
        description: fail ? 'Some records could not be updated (e.g. already in that category).' : undefined,
        variant: fail && ok === 0 ? 'destructive' : 'default',
      });
      clear();
      await after();
    } finally { setBulkBusy(false); }
  };

  const applyUserBulk = async (action: string, value: string) => {
    const ids = [...selUsers];
    if (action === 'category') return runBulk(ids, (uid) => crmCategoriesService.addMember(value, { user_id: uid }), 'Added to category', loadCategories, () => setSelUsers(new Set()));
    const patch = action === 'role' ? { role_id: value } : action === 'status' ? { status: value } : { professional_type: value };
    return runBulk(ids, (uid) => usersAPI.updateUser(uid, patch), 'Updated', loadUsers, () => setSelUsers(new Set()));
  };
  const applyContactBulk = async (action: string, value: string) => {
    const ids = [...selContacts];
    if (action === 'category') return runBulk(ids, (id) => crmCategoriesService.addMember(value, { crm_contact_id: id }), 'Added to category', loadCategories, () => setSelContacts(new Set()));
    const patch = action === 'company' ? { company: value } : action === 'status' ? { status: value } : { profession: value };
    return runBulk(ids, (id) => contactsAPI.updateContact(id, patch), 'Updated', loadContacts, () => setSelContacts(new Set()));
  };
  const applyCompanyBulk = async (action: string, value: string) => {
    const ids = [...selCompanies];
    if (action === 'category') return runBulk(ids, (id) => crmCategoriesService.addMember(value, { crm_company_id: id }), 'Added to category', loadCategories, () => setSelCompanies(new Set()));
    const patch = action === 'status' ? { status: value } : { profession: value };
    return runBulk(ids, (id) => companiesAPI.updateCompany(id, patch), 'Updated', loadCompanies, () => setSelCompanies(new Set()));
  };

  const userBulkActions: BulkSelectAction[] = [
    { key: 'role', label: 'Assign role', placeholder: 'Pick a role', options: roleOptions },
    { key: 'status', label: 'Set status', placeholder: 'Pick a status', options: STATUS_OPTIONS },
    { key: 'profession', label: 'Professional type', placeholder: 'Pick a type', options: PROFESSIONAL_TYPE_OPTIONS },
    { key: 'category', label: 'Add to category', placeholder: 'Pick a category', options: categoryOptions },
  ];
  const contactBulkActions: BulkSelectAction[] = [
    { key: 'company', label: 'Assign company', placeholder: 'Pick a company', options: companyNameOptions },
    { key: 'status', label: 'Set status', placeholder: 'Pick a status', options: STATUS_OPTIONS },
    { key: 'profession', label: 'Professional type', placeholder: 'Pick a type', options: PROFESSIONAL_TYPE_OPTIONS },
    { key: 'category', label: 'Add to category', placeholder: 'Pick a category', options: categoryOptions },
  ];
  const companyBulkActions: BulkSelectAction[] = [
    { key: 'status', label: 'Set status', placeholder: 'Pick a status', options: STATUS_OPTIONS },
    { key: 'profession', label: 'Professional type', placeholder: 'Pick a type', options: PROFESSIONAL_TYPE_OPTIONS },
    { key: 'category', label: 'Add to category', placeholder: 'Pick a category', options: categoryOptions },
  ];

  // ── single-row handlers (unchanged behaviour) ─────────────────────────────
  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try { await usersAPI.deleteUser(userId); toast({ title: 'Success', description: 'User deleted' }); loadUsers(); }
    catch (e) { toast({ title: 'Error', description: e instanceof Error ? e.message : 'Failed to delete user', variant: 'destructive' }); }
  };
  const handleDeleteContact = async (contactId: string) => {
    if (!window.confirm('Are you sure you want to delete this contact?')) return;
    try { setLoading(true); await contactsAPI.deleteContact(contactId); toast({ title: 'Success', description: 'Contact deleted' }); await loadContacts(); }
    catch (e) { toast({ title: 'Error', description: e instanceof Error ? e.message : 'Failed to delete contact', variant: 'destructive' }); }
    finally { setLoading(false); }
  };
  const handleDeleteCompany = async (companyId: string) => {
    if (!confirm('Are you sure you want to delete this company?')) return;
    try { await companiesAPI.deleteCompany(companyId); toast({ title: 'Success', description: 'Company deleted' }); loadCompanies(); }
    catch (e) { toast({ title: 'Error', description: e instanceof Error ? e.message : 'Failed to delete company', variant: 'destructive' }); }
  };

  const handleAddUser = () => { setNewUserEmail(''); setNewUserPassword(''); setNewUserDisplayName(''); setShowAddUserModal(true); };
  const handleCreateUser = async () => {
    if (!newUserEmail || !newUserPassword) { toast({ title: 'Validation Error', description: 'Email and password are required', variant: 'destructive' }); return; }
    try {
      setCreatingUser(true);
      const { error } = await supabase.auth.signUp({ email: newUserEmail, password: newUserPassword, options: { data: { display_name: newUserDisplayName } } });
      if (error) throw error;
      toast({ title: 'Success', description: 'User created. They will receive a confirmation email.' });
      setShowAddUserModal(false); await loadUsers();
    } catch (error: any) { toast({ title: 'Error', description: error.message || 'Failed to create user', variant: 'destructive' }); }
    finally { setCreatingUser(false); }
  };
  // Assign a platform user's account role inline from the Users tab (this is the
  // home for role/permission management — not the per-user CRM detail entry).
  const handleRoleChange = async (userId: string, roleId: string) => {
    const prevUsers = users;
    const nextRole = roles.find((r) => r.id === roleId);
    setUsers((list) => list.map((u) => (u.user_id === userId ? { ...u, role_id: roleId, roles: nextRole } : u)));
    try {
      await usersAPI.updateUser(userId, { role_id: roleId });
      toast({ title: 'Role updated', description: nextRole ? `Set to ${nextRole.name}` : undefined });
    } catch (error: any) {
      setUsers(prevUsers);
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

  // ── filter defs ───────────────────────────────────────────────────────────
  const userFilters: FilterDef[] = [
    { key: 'role', label: 'role', value: userF.role, options: roleOptions, onChange: (v) => setUserF((f) => ({ ...f, role: v })) },
    { key: 'status', label: 'status', value: userF.status, options: STATUS_OPTIONS, onChange: (v) => setUserF((f) => ({ ...f, status: v })) },
    { key: 'subscription', label: 'plan', value: userF.subscription, options: subscriptionOptions, onChange: (v) => setUserF((f) => ({ ...f, subscription: v })) },
    { key: 'profession', label: 'type', value: userF.profession, options: PROFESSIONAL_TYPE_OPTIONS, onChange: (v) => setUserF((f) => ({ ...f, profession: v })) },
  ];
  const contactFilters: FilterDef[] = [
    { key: 'profession', label: 'type', value: contactF.profession, options: PROFESSIONAL_TYPE_OPTIONS, onChange: (v) => setContactF((f) => ({ ...f, profession: v })) },
    { key: 'status', label: 'status', value: contactF.status, options: STATUS_OPTIONS, onChange: (v) => setContactF((f) => ({ ...f, status: v })) },
    { key: 'company', label: 'company', value: contactF.company, options: companyNameOptions, onChange: (v) => setContactF((f) => ({ ...f, company: v })) },
    { key: 'clientSupplier', label: 'kind', value: contactF.clientSupplier, options: CLIENT_SUPPLIER_OPTIONS, onChange: (v) => setContactF((f) => ({ ...f, clientSupplier: v })) },
    { key: 'category', label: 'category', value: contactF.category, options: categoryOptions, onChange: (v) => setContactF((f) => ({ ...f, category: v })) },
  ];
  const companyFilters: FilterDef[] = [
    { key: 'profession', label: 'type', value: companyF.profession, options: PROFESSIONAL_TYPE_OPTIONS, onChange: (v) => setCompanyF((f) => ({ ...f, profession: v })) },
    { key: 'status', label: 'status', value: companyF.status, options: STATUS_OPTIONS, onChange: (v) => setCompanyF((f) => ({ ...f, status: v })) },
    { key: 'customerSupplier', label: 'kind', value: companyF.customerSupplier, options: CLIENT_SUPPLIER_OPTIONS, onChange: (v) => setCompanyF((f) => ({ ...f, customerSupplier: v })) },
    { key: 'category', label: 'category', value: companyF.category, options: categoryOptions, onChange: (v) => setCompanyF((f) => ({ ...f, category: v })) },
  ];

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader title="CRM Management" description="Manage users and customer contacts" badge="Admin" />

      <div className="p-3 sm:p-6 space-y-6">
        <div className="flex justify-end">
          <WorkspaceQuotaBadge table="crm_contacts" quotaKey="max_contacts" label="contacts" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <AdminStatCard title="Total Users" value={userStats.total} icon={Users} description="Registered users" variant="glass" />
          <AdminStatCard title="Active Users" value={userStats.active} icon={Users} description="Currently active" variant="glass" />
          <AdminStatCard title="Total Contacts" value={contacts.length} icon={Building2} description="CRM contacts" variant="glass" />
          <AdminStatCard title="Total Companies" value={companies.length} icon={Building2} description="CRM companies" variant="glass" />
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 p-2">
            <TabsTrigger value="users"><Users className="h-4 w-4 mr-2" />Users</TabsTrigger>
            <TabsTrigger value="contacts"><Building2 className="h-4 w-4 mr-2" />Contacts</TabsTrigger>
            <TabsTrigger value="companies"><Building2 className="h-4 w-4 mr-2" />Companies</TabsTrigger>
            <TabsTrigger value="categories"><Tags className="h-4 w-4 mr-2" />Categories</TabsTrigger>
          </TabsList>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-4 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>User Management</CardTitle>
                <CardDescription>Manage platform users, roles, and subscriptions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <CrmFilters
                  search={searchTerm} onSearch={setSearchTerm} searchPlaceholder="Search by email…"
                  filters={userFilters} onAdd={handleAddUser} addLabel="Add User"
                />
                {selUsers.size > 0 && (
                  <CrmBulkBar
                    count={selUsers.size} actions={userBulkActions} busy={bulkBusy}
                    onApply={applyUserBulk}
                    onDelete={() => runBulk([...selUsers], (uid) => usersAPI.deleteUser(uid), 'Deleted', loadUsers, () => setSelUsers(new Set()))}
                    onClear={() => setSelUsers(new Set())}
                  />
                )}
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox checked={allUsersSelected} onCheckedChange={(v) =>
                            setSelUsers(v ? new Set(filteredUsers.map((u) => u.user_id)) : new Set())} aria-label="Select all" />
                        </TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Subscription</TableHead>
                        <TableHead>Credits</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow><TableCell colSpan={8} className="text-center py-4">Loading...</TableCell></TableRow>
                      ) : filteredUsers.length === 0 ? (
                        <TableRow><TableCell colSpan={8} className="text-center py-4">No users found</TableCell></TableRow>
                      ) : filteredUsers.map((user) => (
                        <TableRow key={user.id} data-state={selUsers.has(user.user_id) ? 'selected' : undefined}>
                          <TableCell>
                            <Checkbox checked={selUsers.has(user.user_id)} onCheckedChange={() => setSelUsers((s) => toggle(s, user.user_id))} aria-label="Select row" />
                          </TableCell>
                          <TableCell className="font-medium">
                            <button onClick={() => navigate(`/admin/crm/users/${user.user_id}`)} className="text-primary hover:underline flex items-center gap-2">
                              <Mail className="h-4 w-4 text-muted-foreground" />{user.email}<ExternalLink className="h-3 w-3" />
                            </button>
                          </TableCell>
                          <TableCell>
                            <Select value={user.role_id || ''} onValueChange={(v) => handleRoleChange(user.user_id, v)}>
                              <SelectTrigger className="h-8 w-[140px] capitalize"><SelectValue placeholder="No role" /></SelectTrigger>
                              <SelectContent>
                                {roles.map((r) => <SelectItem key={r.id} value={r.id} className="capitalize">{r.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{professionalTypeLabel(user.professional_type) || '-'}</TableCell>
                          <TableCell><Badge variant="secondary">{user.subscription_tier}</Badge></TableCell>
                          <TableCell><div className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-muted-foreground" />{user.credits || 0}</div></TableCell>
                          <TableCell><Badge variant={user.status === 'active' ? 'default' : 'secondary'}>{user.status}</Badge></TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="ghost" size="sm" onClick={() => handleResetPassword(user.email)} title="Reset password"><Key className="h-4 w-4 text-blue-500" /></Button>
                              <Button variant="ghost" size="sm" onClick={() => handleDeleteUser(user.user_id)} title="Delete user"><Trash2 className="h-4 w-4 text-red-500" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Contacts Tab */}
          <TabsContent value="contacts" className="space-y-4 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>CRM Contacts</CardTitle>
                <CardDescription>Manage non-user contacts and relationships</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <CrmFilters
                  search={searchTerm} onSearch={setSearchTerm} searchPlaceholder="Search contacts…"
                  filters={contactFilters} onAdd={() => navigate('/admin/crm/contacts/new')} addLabel="Add Contact"
                />
                {selContacts.size > 0 && (
                  <CrmBulkBar
                    count={selContacts.size} actions={contactBulkActions} busy={bulkBusy}
                    onApply={applyContactBulk}
                    onDelete={() => runBulk([...selContacts], (id) => contactsAPI.deleteContact(id), 'Deleted', loadContacts, () => setSelContacts(new Set()))}
                    onClear={() => setSelContacts(new Set())}
                  />
                )}
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox checked={allContactsSelected} onCheckedChange={(v) =>
                            setSelContacts(v ? new Set(filteredContacts.map((c) => c.id)) : new Set())} aria-label="Select all" />
                        </TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-4">Loading...</TableCell></TableRow>
                      ) : filteredContacts.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-4">No contacts found</TableCell></TableRow>
                      ) : filteredContacts.map((contact) => (
                        <TableRow key={contact.id} data-state={selContacts.has(contact.id) ? 'selected' : undefined}>
                          <TableCell>
                            <Checkbox checked={selContacts.has(contact.id)} onCheckedChange={() => setSelContacts((s) => toggle(s, contact.id))} aria-label="Select row" />
                          </TableCell>
                          <TableCell className="font-medium">
                            <button onClick={() => navigate(`/crm/contacts/${contact.id}`)} className="text-primary hover:underline flex items-center gap-1">
                              {contact.name}<ExternalLink className="h-3 w-3" />
                            </button>
                          </TableCell>
                          <TableCell>{contact.email ? <a href={`mailto:${contact.email}`} className="text-blue-600 hover:underline">{contact.email}</a> : '-'}</TableCell>
                          <TableCell>{contact.phone ? <a href={`tel:${contact.phone}`} className="text-blue-600 hover:underline">{contact.phone}</a> : '-'}</TableCell>
                          <TableCell>{contact.company || '-'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{professionalTypeLabel(contact.profession) || contact.profession || '-'}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteContact(contact.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Companies Tab */}
          <TabsContent value="companies" className="space-y-4 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>CRM Companies</CardTitle>
                <CardDescription>Manage company accounts and business relationships</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <CrmFilters
                  search={searchTerm} onSearch={setSearchTerm} searchPlaceholder="Search companies…"
                  filters={companyFilters} onAdd={() => navigate('/admin/crm/companies/new')} addLabel="Add Company"
                />
                {selCompanies.size > 0 && (
                  <CrmBulkBar
                    count={selCompanies.size} actions={companyBulkActions} busy={bulkBusy}
                    onApply={applyCompanyBulk}
                    onDelete={() => runBulk([...selCompanies], (id) => companiesAPI.deleteCompany(id), 'Deleted', loadCompanies, () => setSelCompanies(new Set()))}
                    onClear={() => setSelCompanies(new Set())}
                  />
                )}
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox checked={allCompaniesSelected} onCheckedChange={(v) =>
                            setSelCompanies(v ? new Set(filteredCompanies.map((c) => c.id)) : new Set())} aria-label="Select all" />
                        </TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Website</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-4">Loading...</TableCell></TableRow>
                      ) : filteredCompanies.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-4">No companies found</TableCell></TableRow>
                      ) : filteredCompanies.map((company) => (
                        <TableRow key={company.id} data-state={selCompanies.has(company.id) ? 'selected' : undefined}>
                          <TableCell>
                            <Checkbox checked={selCompanies.has(company.id)} onCheckedChange={() => setSelCompanies((s) => toggle(s, company.id))} aria-label="Select row" />
                          </TableCell>
                          <TableCell className="font-medium">
                            <button onClick={() => navigate(`/crm/companies/${company.id}`)} className="text-primary hover:underline flex items-center gap-1">
                              {company.name}<ExternalLink className="h-3 w-3" />
                            </button>
                          </TableCell>
                          <TableCell>{company.email ? <a href={`mailto:${company.email}`} className="text-blue-600 hover:underline">{company.email}</a> : '-'}</TableCell>
                          <TableCell>{company.phone ? <a href={`tel:${company.phone}`} className="text-blue-600 hover:underline">{company.phone}</a> : '-'}</TableCell>
                          <TableCell>{company.website ? <a href={company.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{company.website}</a> : '-'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{professionalTypeLabel(company.profession) || company.profession || company.industry || '-'}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteCompany(company.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Categories Tab */}
          <TabsContent value="categories" className="space-y-4 mt-6">
            <CategoriesPanel />
          </TabsContent>
        </Tabs>

        {/* Add User Modal */}
        <Dialog open={showAddUserModal} onOpenChange={setShowAddUserModal}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Add New User</DialogTitle>
              <DialogDescription>Create a new user account. They will receive a confirmation email.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="new-email">Email *</Label>
                <Input id="new-email" type="email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} placeholder="user@example.com" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="new-password">Password *</Label>
                <Input id="new-password" type="password" value={newUserPassword} onChange={(e) => setNewUserPassword(e.target.value)} placeholder="Minimum 6 characters" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="new-displayName">Display Name</Label>
                <Input id="new-displayName" value={newUserDisplayName} onChange={(e) => setNewUserDisplayName(e.target.value)} placeholder="John Doe" className="mt-1" />
              </div>
              <p className="text-sm text-muted-foreground">After creating the user, you can edit their role, subscription, and other details from their profile page.</p>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setShowAddUserModal(false)} disabled={creatingUser}>Cancel</Button>
                <Button onClick={handleCreateUser} disabled={creatingUser}>{creatingUser ? 'Creating...' : 'Create User'}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default CRMManagement;
