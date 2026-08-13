import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Users, Building2, Trash2, Mail, CreditCard, Key, ExternalLink, Tags, Plus, Kanban } from 'lucide-react';

import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Badge } from '@/components/core/ui/badge';
import { statusTone } from '@/utils/statusTone';
import { leadScoreTint } from '@/modules/crm/services/leadScoring';
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
import { usersAPI, contactsAPI, companiesAPI, type CrmListFilters } from '@/services/crm.service';
import { crmCategoriesService, isHandAssignableKind, type CrmCategorySummary } from '@/services/crmCategoriesService';
import { humanizeLabel } from '@/utils/humanize';
import { CategoriesPanel } from './CategoriesPage';
import { AddCompanyModal } from '../components/AddCompanyModal';
import { CrmBulkBar, type BulkSelectAction } from '../components/CrmBulkBar';
import { TablePagination, paginate, clampPage, TABLE_PAGE_SIZE } from '@/components/core/ui/table-pagination';
import { FilterBar, optionsFromRows, useFilters, type FilterOption, type FilterValues } from '@/components/core/filters';
import { buildCompanyFilters, buildContactFilters, buildUserFilters, categoryFacetOptions } from './crmFilters';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { ModuleTabGate } from '@/components/core/ModuleTabGate';
import { PipelineBoard } from '@/components/business/crm/PipelineBoard';
import {
  PROFESSIONAL_TYPE_OPTIONS, STATUS_OPTIONS,
  professionalTypeLabel, roleLabel, type Option,
} from '../crmConstants';

// Pipeline renders FIRST, but 'users' stays the landing tab: bare `/crm` is the main nav
// target, and defaulting to a module-gated tab would show an upsell as the front door of a
// free module. Deep link with ?tab=pipeline.
const TAB_VALUES = ['pipeline', 'users', 'contacts', 'companies', 'categories'] as const;
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
  /** Attached businesses via the crm_company_contacts junction (flattened by the API). */
  companies?: Array<{ company_id: string; company_name: string | null; is_primary?: boolean }>;
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

/**
 * Intersect the active membership-id allowlists into the `ids` filter the list API takes.
 *
 * `null` entries mean "that filter is off". Returns `undefined` when no filter is active,
 * and an EMPTY ARRAY when the active filters overlap on nothing — which the service sends
 * as an explicit empty `ids=` so the server returns an empty page instead of everything.
 */
/** Read a single-valued filter out of the values bag; '' / unset both mean "no filter". */
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}

/** ~300ms debounce for a free-text filter value that drives a server request. */
function useDebouncedText(value: unknown, delay = 300): string | undefined {
  const [debounced, setDebounced] = useState<string | undefined>(str(value));
  useEffect(() => {
    const t = setTimeout(() => setDebounced(str(value)?.trim()), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

function intersectIds(...sets: Array<Set<string> | null>): string[] | undefined {
  const active = sets.filter((s): s is Set<string> => s !== null);
  if (active.length === 0) return undefined;
  return [...active.reduce((a, b) => new Set([...a].filter((id) => b.has(id))))];
}

export const CRMManagement: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { activeWorkspaceId, workspaceRole } = useWorkspace();
  // Reps and above create/move cards; a `client` is read-only. RLS on crm_deals is the real
  // boundary (admin OR the deal's owner) — this only decides whether to offer the controls,
  // and offering them to someone RLS will reject is a worse experience than hiding them.
  const canManageDeals = !!activeWorkspaceId && workspaceRole !== 'client';
  // Deal types are workspace configuration, not day-to-day work — owner/admin only, matching
  // the RLS on crm_deal_types.
  const isWsAdmin = workspaceRole === 'owner' || workspaceRole === 'admin';

  const initialTab: TabValue = (() => {
    const t = searchParams.get('tab');
    return (TAB_VALUES as readonly string[]).includes(t || '') ? (t as TabValue) : 'users';
  })();
  const [activeTab, setActiveTab] = useState<TabValue>(initialTab);
  const handleTabChange = (val: string) => {
    const next = (TAB_VALUES as readonly string[]).includes(val) ? (val as TabValue) : 'users';
    setActiveTab(next);
    setUsersPage(1); setContactsPage(1); setCompaniesPage(1);
    const params = new URLSearchParams(searchParams);
    if (next === 'users') params.delete('tab'); else params.set('tab', next);
    setSearchParams(params, { replace: true });
  };

  // Per-tab loading flags. A single shared flag caused the Users tab to flash
  // "No users found" because the faster contacts/companies loaders cleared it
  // while the slower users edge-function call was still in flight. Init true so
  // the first paint shows "Loading…" rather than an empty state.
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [users, setUsers] = useState<UserWithAuth[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  // Total row counts for the CURRENT filter set, straight off the API's exact count.
  // `contacts`/`companies` now hold one page only, so they can't be counted locally.
  const [contactsTotal, setContactsTotal] = useState(0);
  const [companiesTotal, setCompaniesTotal] = useState(0);
  const [roles, setRoles] = useState<Role[]>([]);
  const [categories, setCategories] = useState<CrmCategorySummary[]>([]);
  const [userStats, setUserStats] = useState({ total: 0, active: 0, inactive: 0 });

  // Users are client-paginated (single edge-function payload). Contacts + companies are
  // SERVER-paged: the page number feeds the request's offset.
  const [usersPage, setUsersPage] = useState(1);
  const [contactsPage, setContactsPage] = useState(1);
  const [companiesPage, setCompaniesPage] = useState(1);

  // Per-tab filter values. Each tab owns its own bag, so a term typed for contacts no
  // longer leaks into the users list.
  const [contactValues, setContactValues] = useState<FilterValues>({});
  const [companyValues, setCompanyValues] = useState<FilterValues>({});
  // Contacts/companies search hits the server, so the raw box is debounced before it
  // reaches the request — otherwise it is one fetch per keystroke.
  const contactSearch = useDebouncedText(contactValues.q);
  const companySearch = useDebouncedText(companyValues.q);

  // Category-filter member sets (fetched on demand)
  const [contactCatIds, setContactCatIds] = useState<Set<string> | null>(null);
  const [companyCatIds, setCompanyCatIds] = useState<Set<string> | null>(null);
  // Industry is a `kind='industry'` CRM category; filtering by it is the same
  // membership lookup as the generic category filter, kept in its own set.
  const [companyIndustryIds, setCompanyIndustryIds] = useState<Set<string> | null>(null);
  // The contacts "company" filter is by attached-business NAME, which lives across the
  // crm_company_contacts junction. Resolve it to a contact-id allowlist and reuse the
  // same server-side `ids` param as the category filters, rather than teaching the list
  // endpoint a junction join.
  // Bounded lookup backing the company dropdowns (the contacts "company" filter, the bulk
  // "Assign company" action, and the companies "Business activity" facet). Separate from the
  // paged table feed, which no longer holds every company — this is a picker, not the data set.
  const [companyLookup, setCompanyLookup] = useState<Array<{ id: string; name: string; profession: string | null }>>([]);

  // Per-tab selection (users keyed by user_id; contacts/companies by id)
  const [selUsers, setSelUsers] = useState<Set<string>>(new Set());
  const [selContacts, setSelContacts] = useState<Set<string>>(new Set());
  const [selCompanies, setSelCompanies] = useState<Set<string>>(new Set());
  const [showAddCompany, setShowAddCompany] = useState(false);

  // App Launcher deep-links: /crm?new=contact | /crm?new=company open the create flow.
  useEffect(() => {
    const n = searchParams.get('new');
    if (n !== 'contact' && n !== 'company') return;
    const params = new URLSearchParams(searchParams);
    params.delete('new');
    setSearchParams(params, { replace: true });
    if (n === 'contact') navigate('/admin/crm/contacts/new');
    else setShowAddCompany(true);
  }, [searchParams, setSearchParams, navigate]);
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
      setLoadingUsers(true);
      const response = await usersAPI.listUsers();
      setUsers(response.data || []);
      setUserStats({
        total: response.data?.length || 0,
        active: response.data?.filter((u) => u.status === 'active').length || 0,
        inactive: response.data?.filter((u) => u.status === 'inactive').length || 0,
      });
    } catch (error: any) {
      toast({ title: 'Error', description: `Failed to load users: ${error.message}`, variant: 'destructive' });
    } finally { setLoadingUsers(false); }
  };

  // The `ids` allowlists sent to the server, one per tab. `undefined` = no membership
  // filter active; `[]` = the active filters matched nothing (→ empty page).
  const contactIdsFilter = useMemo(
    () => intersectIds(contactCatIds),
    [contactCatIds]);
  const companyIdsFilter = useMemo(
    () => intersectIds(companyCatIds, companyIndustryIds),
    [companyCatIds, companyIndustryIds]);

  // The pass-through filter fields (no accessor, no column) are read straight out of the
  // values bag here — this is the only place they are interpreted.
  const contactQuery: CrmListFilters = useMemo(() => ({
    search: contactSearch,
    status: str(contactValues.status),
    lifecycleStage: str(contactValues.lifecycle_stage),
    kind: str(contactValues.kind) as CrmListFilters['kind'],
    companyName: str(contactValues.company),
    ids: contactIdsFilter,
  }), [contactSearch, contactValues.status, contactValues.lifecycle_stage, contactValues.kind,
       contactValues.company, contactIdsFilter]);

  const companyQuery: CrmListFilters = useMemo(() => ({
    search: companySearch,
    profession: str(companyValues.profession),
    kind: str(companyValues.kind) as CrmListFilters['kind'],
    ids: companyIdsFilter,
  }), [companySearch, companyValues.profession, companyValues.kind, companyIdsFilter]);

  // Load through the crm-api edge function (same path as users/companies) rather than a
  // direct supabase query. The direct query is bound by the `is_workspace_member` RLS on
  // crm_contacts, so a global operator on the /admin/crm surface who isn't an active
  // member of the tenant workspace that owns the contacts sees an empty table. The API
  // also flattens the attached-company junction into the `companies` array the table
  // renders, and applies the filters + exact count server-side so this fetches ONE page.
  const loadContacts = useCallback(async () => {
    try {
      setLoadingContacts(true);
      const res = await contactsAPI.listContacts(
        TABLE_PAGE_SIZE, (contactsPage - 1) * TABLE_PAGE_SIZE, contactQuery,
      );
      setContacts(res.data || []);
      setContactsTotal(res.count ?? 0);
    } catch (error: any) {
      toast({ title: 'Error', description: `Failed to load contacts: ${error.message}`, variant: 'destructive' });
    } finally { setLoadingContacts(false); }
  }, [contactsPage, contactQuery, toast]);

  const loadCompanies = useCallback(async () => {
    try {
      setLoadingCompanies(true);
      const res = await companiesAPI.listCompanies(
        TABLE_PAGE_SIZE, (companiesPage - 1) * TABLE_PAGE_SIZE, undefined, companyQuery,
      );
      setCompanies(res.data || []);
      setCompaniesTotal(res.count ?? 0);
    } catch (error: any) {
      toast({ title: 'Error', description: `Failed to load companies: ${error.message}`, variant: 'destructive' });
    } finally { setLoadingCompanies(false); }
  }, [companiesPage, companyQuery, toast]);

  const loadCompanyLookup = async () => {
    try {
      const res = await companiesAPI.listCompanies(500, 0);
      setCompanyLookup(((res.data || []) as Array<{ id: string; name: string; profession?: string | null }>)
        .filter((c) => c.id && c.name)
        .map((c) => ({ id: c.id, name: c.name, profession: c.profession ?? null })));
    } catch { /* picker data only — never block the page on it */ }
  };

  useEffect(() => {
    loadRoles(); loadCategories(); loadUsers(); loadCompanyLookup();
  }, []);

  // Re-fetch whenever the page or any server-side filter changes.
  useEffect(() => { loadContacts(); }, [loadContacts]);
  useEffect(() => { loadCompanies(); }, [loadCompanies]);

  // Membership dimensions are resolved client-side into the server's `ids[]` allowlist —
  // the list endpoint knows nothing about category membership.
  useEffect(() => {
    const catId = str(contactValues.category);
    if (!catId) { setContactCatIds(null); return; }
    let cancelled = false;
    crmCategoriesService.listMembers(catId).then((members) => {
      if (cancelled) return;
      setContactCatIds(new Set(members.filter((m) => m.crm_contact_id).map((m) => m.crm_contact_id as string)));
    }).catch(() => setContactCatIds(new Set()));
    return () => { cancelled = true; };
  }, [contactValues.category]);

  useEffect(() => {
    const catId = str(companyValues.category);
    if (!catId) { setCompanyCatIds(null); return; }
    let cancelled = false;
    crmCategoriesService.listMembers(catId).then((members) => {
      if (cancelled) return;
      setCompanyCatIds(new Set(members.filter((m) => m.crm_company_id).map((m) => m.crm_company_id as string)));
    }).catch(() => setCompanyCatIds(new Set()));
    return () => { cancelled = true; };
  }, [companyValues.category]);

  useEffect(() => {
    const industryId = str(companyValues.industry);
    if (!industryId) { setCompanyIndustryIds(null); return; }
    let cancelled = false;
    crmCategoriesService.listMembers(industryId).then((members) => {
      if (cancelled) return;
      setCompanyIndustryIds(new Set(members.filter((m) => m.crm_company_id).map((m) => m.crm_company_id as string)));
    }).catch(() => setCompanyIndustryIds(new Set()));
    return () => { cancelled = true; };
  }, [companyValues.industry]);

  // ── option lists ──────────────────────────────────────────────────────────
  const roleOptions: Option[] = useMemo(() => roles.map((r) => ({ value: r.id, label: roleLabel(r.name) })), [roles]);

  // Membership facets — see `categoryFacetOptions`. Industries get their own company field, so
  // they are excluded from the generic company "category" one: otherwise the same nine options
  // are listed twice in the same modal.
  const industryOptions = useMemo(
    () => categoryFacetOptions(categories, 'company', {
      kindAllowed: (k) => k === 'industry', keep: str(companyValues.industry),
    }), [categories, companyValues.industry]);
  const companyCategoryOptions = useMemo(
    () => categoryFacetOptions(categories, 'company', {
      kindAllowed: (k) => k !== 'industry', keep: str(companyValues.category),
    }), [categories, companyValues.category]);
  const contactCategoryOptions = useMemo(
    () => categoryFacetOptions(categories, 'contact', { keep: str(contactValues.category) }),
    [categories, contactValues.category]);

  /**
   * Categories offered for MANUAL assignment (the bulk "Add to category" action). NOT the same
   * set as the filter facets: an empty category is a perfectly good assignment target, but the
   * AUTO kinds are not — their members are derived by `crm_resync_auto_category_members`, and a
   * hand-added row is never reclaimed (the resync only deletes `source='auto'`), so it would sit
   * there forever contradicting the roster it exists to mirror.
   */
  const assignableCategoryOptions: Option[] = useMemo(
    () => categories
      .filter((c) => c.is_active && isHandAssignableKind(c.kind))
      .map((c) => ({ value: c.id, label: c.name })),
    [categories]);

  // Sourced from the bounded lookup, not the table feed — the companies table now holds
  // one page, so deriving the picker from it would list only 20 names.
  const companyNameOptions: Option[] = useMemo(() =>
    [...new Set(companyLookup.map((c) => c.name))].sort().map((n) => ({ value: n, label: n })),
    [companyLookup]);
  // Company `profession` holds the ΑΑΔΕ ΚΑΔ activity text, not the professional-type enum —
  // derive the options from what is actually stored (with counts) instead of offering five
  // values the column never contains. Same bounded lookup as the name picker.
  const companyProfessionOptions: FilterOption[] = useMemo(
    () => optionsFromRows(companyLookup, (c) => c.profession ?? ''),
    [companyLookup]);
  const subscriptionOptions: Option[] = useMemo(() =>
    [...new Set(users.map((u) => u.subscription_tier).filter(Boolean))].sort().map((s) => ({ value: s as string, label: s as string })),
    [users]);

  // ── filter groups ─────────────────────────────────────────────────────────
  const userGroups = useMemo(
    () => buildUserFilters({ roleOptions, subscriptionOptions }), [roleOptions, subscriptionOptions]);
  const contactGroups = useMemo(
    () => buildContactFilters({ categoryOptions: contactCategoryOptions, companyNameOptions }),
    [contactCategoryOptions, companyNameOptions]);
  const companyGroups = useMemo(
    () => buildCompanyFilters({
      categoryOptions: companyCategoryOptions,
      industryOptions,
      professionOptions: companyProfessionOptions,
    }),
    [companyCategoryOptions, industryOptions, companyProfessionOptions]);

  // ── filtered lists ────────────────────────────────────────────────────────
  // Users are the only client-side tab, so they get the full hook (matching + preview).
  const {
    values: userValues, setValues: setUserValues,
    filtered: filteredUsers, previewCount: userPreviewCount,
  } = useFilters(users, userGroups);

  // The attached business: prefer the primary junction company, then any junction
  // company, falling back to the legacy free-text `company` field.
  const contactCompanyName = (c: Contact): string => {
    const list = c.companies ?? [];
    const primary = list.find((x) => x.is_primary) ?? list[0];
    return primary?.company_name ?? c.company ?? '';
  };

  // Contacts + companies are filtered SERVER-side (see contactQuery / companyQuery)
  // — `contacts` / `companies` already hold exactly the rows for the current page.

  // ── pagination ────────────────────────────────────────────────────────────
  // Users only: reset to page 1 whenever their client-side result set changes. The
  // contacts/companies reset lands in their filter onChange, so it commits with the change
  // and doesn't cost an extra fetch.
  useEffect(() => { setUsersPage(1); }, [userValues]);

  // A delete or a reload can shrink the list under the current page — clamp instead of
  // stranding the user on an empty table.
  useEffect(() => { setUsersPage((p) => clampPage(p, filteredUsers.length)); }, [filteredUsers.length]);
  useEffect(() => { setContactsPage((p) => clampPage(p, contactsTotal)); }, [contactsTotal]);
  useEffect(() => { setCompaniesPage((p) => clampPage(p, companiesTotal)); }, [companiesTotal]);

  const pagedUsers = useMemo(() => paginate(filteredUsers, usersPage), [filteredUsers, usersPage]);

  // ── selection helpers ─────────────────────────────────────────────────────
  // Contacts/companies "select all" covers the CURRENT PAGE only — the other pages were
  // never fetched, so a whole-result-set select would be selecting rows nobody has seen
  // (and bulk delete would act on them).
  const allUsersSelected = filteredUsers.length > 0 && filteredUsers.every((u) => selUsers.has(u.user_id));
  const allContactsSelected = contacts.length > 0 && contacts.every((c) => selContacts.has(c.id));
  const allCompaniesSelected = companies.length > 0 && companies.every((c) => selCompanies.has(c.id));

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
    const patch = action === 'company' ? { company: value } : { status: value };
    return runBulk(ids, (id) => contactsAPI.updateContact(id, patch), 'Updated', loadContacts, () => setSelContacts(new Set()));
  };
  // Category is the only bulk edit a company has — see companyBulkActions for why the other
  // two went: one wrote a column that does not exist, the other wrote a fiscal field.
  const applyCompanyBulk = async (_action: string, value: string) =>
    runBulk([...selCompanies], (id) => crmCategoriesService.addMember(value, { crm_company_id: id }), 'Added to category', loadCategories, () => setSelCompanies(new Set()));

  const userBulkActions: BulkSelectAction[] = [
    // Account TIER — global, platform-wide. Team roles are per-workspace (Profile → Team).
    { key: 'role', label: 'Set account tier', placeholder: 'Pick a tier', options: roleOptions },
    { key: 'status', label: 'Set status', placeholder: 'Pick a status', options: STATUS_OPTIONS },
    { key: 'profession', label: 'Professional type', placeholder: 'Pick a type', options: PROFESSIONAL_TYPE_OPTIONS },
    { key: 'category', label: 'Add to category', placeholder: 'Pick a category', options: assignableCategoryOptions },
  ];
  /*
   * No "Professional type" on contacts or companies. `profession` on those two tables is the
   * FISCAL activity: `partyFromCrm` copies it onto the myDATA counterpart and the invoice PDF
   * prints it as "Δραστηριότητα". Writing the five-value app enum there puts the literal string
   * `supplier` on a legal document, and on a company it also overwrites the ΑΑΔΕ ΚΑΔ activity
   * the lookup filled in. Segmentation belongs to `contact_group`, the categories, and
   * is_client / is_supplier — all of which are already offered.
   *
   * The users bar keeps it: `user_profiles.professional_type` is a genuine enum column with no
   * fiscal role, and it is the one the professional-type categories auto-sync from.
   */
  const contactBulkActions: BulkSelectAction[] = [
    { key: 'company', label: 'Assign company', placeholder: 'Pick a company', options: companyNameOptions },
    { key: 'status', label: 'Set status', placeholder: 'Pick a status', options: STATUS_OPTIONS },
    { key: 'category', label: 'Add to category', placeholder: 'Pick a category', options: assignableCategoryOptions },
  ];
  // No "Set status" either: crm_companies has no status column, so the PATCH dropped it at the
  // writable-columns allowlist and the bar still toasted "Updated N" — a button that reported
  // success and changed nothing. Same reason the status FILTER isn't offered.
  const companyBulkActions: BulkSelectAction[] = [
    { key: 'category', label: 'Add to category', placeholder: 'Pick a category', options: assignableCategoryOptions },
  ];

  // ── single-row handlers (unchanged behaviour) ─────────────────────────────
  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try { await usersAPI.deleteUser(userId); toast({ title: 'Success', description: 'User deleted' }); loadUsers(); }
    catch (e) { toast({ title: 'Error', description: e instanceof Error ? e.message : 'Failed to delete user', variant: 'destructive' }); }
  };
  const handleDeleteContact = async (contactId: string) => {
    if (!window.confirm('Are you sure you want to delete this contact?')) return;
    try { setLoadingContacts(true); await contactsAPI.deleteContact(contactId); toast({ title: 'Success', description: 'Contact deleted' }); await loadContacts(); }
    catch (e) { toast({ title: 'Error', description: e instanceof Error ? e.message : 'Failed to delete contact', variant: 'destructive' }); }
    finally { setLoadingContacts(false); }
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

  // Contacts/companies filters drive a server query, so each change also drops back to
  // page 1 — otherwise a narrower result set leaves the user on an out-of-range offset.
  const onContactFilters = (v: FilterValues) => { setContactsPage(1); setContactValues(v); };
  const onCompanyFilters = (v: FilterValues) => { setCompaniesPage(1); setCompanyValues(v); };

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader title="CRM Management" description="Manage users and customer contacts" badge="Admin" />
      <AddCompanyModal open={showAddCompany} onOpenChange={setShowAddCompany} />

      <div className="p-3 sm:p-6 space-y-6">
        <div className="flex justify-end">
          <WorkspaceQuotaBadge table="crm_contacts" quotaKey="max_contacts" label="contacts" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <AdminStatCard title="Total Users" value={userStats.total} icon={Users} description="Registered users" variant="glass" />
          <AdminStatCard title="Active Users" value={userStats.active} icon={Users} description="Currently active" variant="glass" />
          {/* Totals come from the API's exact count — the arrays hold one page now. */}
          <AdminStatCard title="Total Contacts" value={contactsTotal} icon={Building2} description="CRM contacts" variant="glass" />
          <AdminStatCard title="Total Companies" value={companiesTotal} icon={Building2} description="CRM companies" variant="glass" />
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 p-2">
            <TabsTrigger value="pipeline"><Kanban className="h-4 w-4 mr-2" />Pipeline</TabsTrigger>
            <TabsTrigger value="users"><Users className="h-4 w-4 mr-2" />Users</TabsTrigger>
            <TabsTrigger value="contacts"><Building2 className="h-4 w-4 mr-2" />Contacts</TabsTrigger>
            <TabsTrigger value="companies"><Building2 className="h-4 w-4 mr-2" />Companies</TabsTrigger>
            <TabsTrigger value="categories"><Tags className="h-4 w-4 mr-2" />Categories</TabsTrigger>
          </TabsList>

          {/* Pipeline — the deal board. One object across CRM and Real Estate, segmented by deal
              type; the gate is UX only, RLS on crm_deals is the boundary. */}
          <TabsContent value="pipeline" className="space-y-4 mt-6">
            <ModuleTabGate moduleSlug="deals" moduleName="Deals & Pipeline"
              blurb="Track opportunities from first contact to won — across real estate, projects, construction or your own deal types.">
              <Card>
                <CardHeader>
                  <CardTitle>Pipeline</CardTitle>
                  <CardDescription>Deals in flight, by stage. Stages follow each deal type.</CardDescription>
                </CardHeader>
                <CardContent>
                  <PipelineBoard ws={activeWorkspaceId} canManage={canManageDeals} canManageTypes={isWsAdmin} />
                </CardContent>
              </Card>
            </ModuleTabGate>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-4 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>User Management</CardTitle>
                <CardDescription>Manage platform users, roles, and subscriptions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <FilterBar
                    groups={userGroups} values={userValues} onChange={setUserValues}
                    previewCount={userPreviewCount}
                    title="Filter users" searchPlaceholder="Search by email…" className="flex-1"
                  />
                  <Button size="sm" onClick={handleAddUser}>
                    <Plus className="h-4 w-4 mr-2" /> Add user
                  </Button>
                </div>
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
                        {/* The GLOBAL account tier, not a team role. Team roles (Sales, HR,
                            Warehouse, Marketing, Accountant…) are per-workspace and live in
                            Profile → Team; setting one here would make it true in every workspace
                            the user belongs to. */}
                        <TableHead>Account tier</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Subscription</TableHead>
                        <TableHead>Credits</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingUsers ? (
                        <TableRow><TableCell colSpan={8} className="text-center py-4">Loading...</TableCell></TableRow>
                      ) : filteredUsers.length === 0 ? (
                        <TableRow><TableCell colSpan={8} className="text-center py-4">No users found</TableCell></TableRow>
                      ) : pagedUsers.map((user) => (
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
                              <SelectTrigger className="h-8 w-[150px]"><SelectValue placeholder="No role" /></SelectTrigger>
                              <SelectContent>
                                {roles.map((r) => <SelectItem key={r.id} value={r.id}>{roleLabel(r.name)}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{professionalTypeLabel(user.professional_type) || '-'}</TableCell>
                          <TableCell><span className="text-xs text-muted-foreground capitalize">{humanizeLabel(user.subscription_tier)}</span></TableCell>
                          <TableCell><div className="flex items-center gap-2"><CreditCard className="h-4 w-4 text-muted-foreground" />{user.credits || 0}</div></TableCell>
                          <TableCell><span className={`text-xs capitalize ${statusTone(user.status)}`}>{humanizeLabel(user.status)}</span></TableCell>
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
                  <TablePagination page={usersPage} total={filteredUsers.length} onPageChange={setUsersPage} label="users" />
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
                <div className="flex flex-wrap items-center gap-2">
                  <FilterBar
                    groups={contactGroups} values={contactValues} onChange={onContactFilters}
                    title="Filter contacts" searchPlaceholder="Search contacts…" className="flex-1"
                  />
                  <Button size="sm" onClick={() => navigate('/admin/crm/contacts/new')}>
                    <Plus className="h-4 w-4 mr-2" /> Add contact
                  </Button>
                </div>
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
                          {/* Page-scoped: selecting rows from pages that were never fetched
                              would let bulk delete act on records the user hasn't seen. */}
                          <Checkbox checked={allContactsSelected} onCheckedChange={(v) =>
                            setSelContacts(v ? new Set(contacts.map((c) => c.id)) : new Set())}
                            aria-label="Select all on this page" title="Select all on this page" />
                        </TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Company</TableHead>
                        {/* `profession` — the party's declared activity, not an app type. */}
                        <TableHead>Activity</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingContacts ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-4">Loading...</TableCell></TableRow>
                      ) : contacts.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-4">No contacts found</TableCell></TableRow>
                      ) : contacts.map((contact) => (
                        <TableRow key={contact.id} data-state={selContacts.has(contact.id) ? 'selected' : undefined}>
                          <TableCell>
                            <Checkbox checked={selContacts.has(contact.id)} onCheckedChange={() => setSelContacts((s) => toggle(s, contact.id))} aria-label="Select row" />
                          </TableCell>
                          <TableCell className="font-medium max-w-[24rem]">
                            <div className="flex items-center gap-2 min-w-0">
                              <button onClick={() => navigate(`/crm/contacts/${contact.id}`)} title={contact.name} className="text-primary hover:underline inline-flex items-center gap-1 max-w-full text-left">
                                <span className="truncate min-w-0">{contact.name}</span>
                                <ExternalLink className="h-3 w-3 shrink-0" />
                              </button>
                              {(contact as any).lead_score != null && (
                                <Badge className={`${leadScoreTint((contact as any).lead_score)} rounded-full border-0 text-[10px]`} title="Lead score">{(contact as any).lead_score}</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{contact.email ? <a href={`mailto:${contact.email}`} className="text-primary hover:underline">{contact.email}</a> : '-'}</TableCell>
                          <TableCell>{contact.phone ? <a href={`tel:${contact.phone}`} className="text-primary hover:underline">{contact.phone}</a> : '-'}</TableCell>
                          <TableCell>{contactCompanyName(contact) || '-'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{professionalTypeLabel(contact.profession) || contact.profession || '-'}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteContact(contact.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <TablePagination page={contactsPage} total={contactsTotal} onPageChange={setContactsPage} label="contacts" />
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
                <div className="flex flex-wrap items-center gap-2">
                  <FilterBar
                    groups={companyGroups} values={companyValues} onChange={onCompanyFilters}
                    title="Filter companies" searchPlaceholder="Search companies…" className="flex-1"
                  />
                  <Button size="sm" onClick={() => setShowAddCompany(true)}>
                    <Plus className="h-4 w-4 mr-2" /> Add company
                  </Button>
                </div>
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
                          {/* Page-scoped — see the contacts table note. */}
                          <Checkbox checked={allCompaniesSelected} onCheckedChange={(v) =>
                            setSelCompanies(v ? new Set(companies.map((c) => c.id)) : new Set())}
                            aria-label="Select all on this page" title="Select all on this page" />
                        </TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Website</TableHead>
                        {/* ΑΑΔΕ ΚΑΔ activity (falls back to industry when unresolved). */}
                        <TableHead>Activity</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingCompanies ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-4">Loading...</TableCell></TableRow>
                      ) : companies.length === 0 ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-4">No companies found</TableCell></TableRow>
                      ) : companies.map((company) => (
                        <TableRow key={company.id} data-state={selCompanies.has(company.id) ? 'selected' : undefined}>
                          <TableCell>
                            <Checkbox checked={selCompanies.has(company.id)} onCheckedChange={() => setSelCompanies((s) => toggle(s, company.id))} aria-label="Select row" />
                          </TableCell>
                          <TableCell className="font-medium max-w-[24rem]">
                            <button onClick={() => navigate(`/crm/companies/${company.id}`)} title={company.name} className="text-primary hover:underline inline-flex items-center gap-1 max-w-full text-left">
                              <span className="truncate min-w-0">{company.name}</span>
                              <ExternalLink className="h-3 w-3 shrink-0" />
                            </button>
                          </TableCell>
                          <TableCell>{company.email ? <a href={`mailto:${company.email}`} className="text-primary hover:underline">{company.email}</a> : '-'}</TableCell>
                          <TableCell>{company.phone ? <a href={`tel:${company.phone}`} className="text-primary hover:underline">{company.phone}</a> : '-'}</TableCell>
                          <TableCell>{company.website ? <a href={company.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{company.website}</a> : '-'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{professionalTypeLabel(company.profession) || company.profession || company.industry || '-'}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteCompany(company.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <TablePagination page={companiesPage} total={companiesTotal} onPageChange={setCompaniesPage} label="companies" />
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
