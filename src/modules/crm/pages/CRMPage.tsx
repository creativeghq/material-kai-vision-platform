import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { inboxComposeEmailUrl } from '@/pages/Inbox/composeLink';
import { Users, Building2, Trash2, Tags, Plus, Kanban, UserPlus } from 'lucide-react';

import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { leadScoreTint } from '@/modules/crm/services/leadScoring';
import { Checkbox } from '@/components/core/ui/checkbox';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';
import { WorkspaceQuotaBadge } from '@/components/core/WorkspaceQuotaBadge';
import { AdminStatCard } from '@/components/Admin/AdminStatCard';
import { contactsAPI, companiesAPI, type CrmListFilters } from '@/services/crm.service';
import { crmCategoriesService, isHandAssignableKind, type CrmCategorySummary } from '@/services/crmCategoriesService';
import { CategoriesPanel } from './CategoriesPage';
import { AddPartyModal, type PartyRelationship } from '../components/AddPartyModal';
import { CrmBulkBar, type BulkSelectAction } from '../components/CrmBulkBar';
import { TablePagination, clampPage, TABLE_PAGE_SIZE } from '@/components/core/ui/table-pagination';
import { FilterBar, optionsFromRows, scopedFilterValue, useFilterValues, type FilterOption, type FilterValues } from '@/components/core/filters';
import { CRM_TAB, CRM_COMPANY_FILTER_KEY, CRM_CONTACT_FILTER_KEY } from '@/modules/crm/routes';
import { buildCompanyFilters, buildContactFilters, categoryFacetOptions } from './crmFilters';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { ModuleTabGate } from '@/components/core/ModuleTabGate';
import { PipelineBoard } from '@/components/business/crm/PipelineBoard';
import { LeadsPanel } from '../components/LeadsPanel';
import { TeamPanel } from '@/components/core/Team/TeamPanel';
import { PlatformAccountsPanel } from './CrmUsersTab';
import {
  LIFECYCLE_STAGE_OPTIONS, STATUS_OPTIONS, professionalTypeLabel, type Option,
} from '../crmConstants';
import { HubCellEmpty, HubCellLink, HubEmptyState } from '@/components/core/hub';

// Pipeline renders FIRST, but contacts is the landing tab: bare `/crm` is the main nav target,
// and defaulting to a module-gated tab would show an upsell as the front door of a free module.
const TAB_VALUES = [
  CRM_TAB.pipeline, CRM_TAB.leads, CRM_TAB.users, CRM_TAB.contacts, CRM_TAB.companies, CRM_TAB.categories,
] as const;
type TabValue = typeof TAB_VALUES[number];

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
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { activeWorkspaceId, activeWorkspace, workspaceRole, isPlatformOperator } = useWorkspace();
  const defaultTab: TabValue = CRM_TAB.contacts;
  // Reps and above create/move cards; a `client` is read-only. RLS on crm_deals is the real
  // boundary (admin OR the deal's owner) — this only decides whether to offer the controls,
  // and offering them to someone RLS will reject is a worse experience than hiding them.
  const canManageDeals = !!activeWorkspaceId && workspaceRole !== 'client';
  // Deal types are workspace configuration, not day-to-day work — owner/admin only, matching
  // the RLS on crm_deal_types.
  const isWsAdmin = workspaceRole === 'owner' || workspaceRole === 'admin';

  // The URL IS the tab — not a seed for it. Held in `useState` this read the param once, at
  // mount, so a `?tab=companies` link followed from a page that already had CRM mounted (the
  // dashboard's Customers block, a notification, the app launcher) changed the address bar and
  // left the operator staring at whichever tab was already open. Nothing failed; the link just
  // did nothing. Same reason FinancePage drives its tab off `?tab=` directly.
  const activeTab: TabValue = (() => {
    const t = searchParams.get('tab');
    return (TAB_VALUES as readonly string[]).includes(t || '') ? (t as TabValue) : defaultTab;
  })();
  const handleTabChange = (val: string) => {
    const next = (TAB_VALUES as readonly string[]).includes(val) ? (val as TabValue) : defaultTab;
    setContactsPage(1); setCompaniesPage(1);
    const params = new URLSearchParams(searchParams);
    if (next === defaultTab) params.delete('tab'); else params.set('tab', next);
    setSearchParams(params, { replace: true });
  };

  // Per-tab loading flags, initialised true so the first paint shows "Loading…" not an empty state.
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  // Total row counts for the CURRENT filter set, straight off the API's exact count.
  // `contacts`/`companies` now hold one page only, so they can't be counted locally.
  const [contactsTotal, setContactsTotal] = useState(0);
  const [companiesTotal, setCompaniesTotal] = useState(0);
  const [categories, setCategories] = useState<CrmCategorySummary[]>([]);

  // Contacts + companies are SERVER-paged: the page number feeds the request's offset.
  const [contactsPage, setContactsPage] = useState(1);
  const [companiesPage, setCompaniesPage] = useState(1);

  // Per-tab filter values. Each tab owns its own bag, so a term typed for contacts no
  // longer leaks into the companies list — and each bag is mirrored into its own URL param, so a
  // filtered list is shareable AND addressable. The dashboard's Customers block links straight
  // to `?tab=companies` filtered to clients; without the URL half that link would open the
  // companies tab showing all 44 and look exactly like it had worked.
  const { values: contactValues, setValues: setContactValues } =
    useFilterValues({ urlKey: CRM_CONTACT_FILTER_KEY });
  const { values: companyValues, setValues: setCompanyValues } =
    useFilterValues({ urlKey: CRM_COMPANY_FILTER_KEY });
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
  // "Assign company" action, and the companies "Business activity" facet).
  const [companyLookup, setCompanyLookup] = useState<Array<{ id: string; name: string; profession: string | null }>>([]);

  // Per-tab selection, keyed by id.
  const [selContacts, setSelContacts] = useState<Set<string>>(new Set());
  const [selCompanies, setSelCompanies] = useState<Set<string>>(new Set());
  const [showAddParty, setShowAddParty] = useState(false);

  // App Launcher deep-links: /crm?new=contact | /crm?new=company both open the one picker.
  useEffect(() => {
    const n = searchParams.get('new');
    if (n !== 'contact' && n !== 'company') return;
    const params = new URLSearchParams(searchParams);
    params.delete('new');
    setSearchParams(params, { replace: true });
    setShowAddParty(true);
  }, [searchParams, setSearchParams]);
  const [bulkBusy, setBulkBusy] = useState(false);

  const loadCategories = async () => {
    try { setCategories(await crmCategoriesService.list(activeWorkspaceId)); }
    catch (error: any) { console.error('Error loading categories:', error); }
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

  // Load through the crm-api edge function (same path as companies) rather than a
  // direct supabase query. The direct query is bound by the `is_workspace_member` RLS on
  // crm_contacts, so a global operator on the /crm surface who isn't an active
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
    loadCompanyLookup();
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadCategories(); }, [activeWorkspaceId]);

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
  // ── filter groups ─────────────────────────────────────────────────────────
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

  const newPartyScope = useMemo(() => {
    const onCompanies = activeTab === CRM_TAB.companies;
    const values = onCompanies ? companyValues : contactValues;
    const pick = (key: string, options: Option[]) => {
      const v = scopedFilterValue(values, key);
      return v && options.some((o) => o.value === v) ? v : undefined;
    };
    const relationship = scopedFilterValue(values, 'kind');
    const contactScope: Record<string, string> = {};
    const companyScope: Record<string, string> = {};
    const companyCategoryIds: string[] = [];
    let companyId: string | undefined;
    if (onCompanies) {
      const industryId = scopedFilterValue(companyValues, 'industry');
      const industry = categories.find((c) => c.id === industryId && c.kind === 'industry');
      if (industry) { companyCategoryIds.push(industry.id); companyScope.industry = industry.name; }
      const profession = scopedFilterValue(companyValues, 'profession');
      if (profession) companyScope.profession = profession;
    } else {
      const status = pick('status', STATUS_OPTIONS);
      if (status) contactScope.status = status;
      const stage = pick('lifecycle_stage', LIFECYCLE_STAGE_OPTIONS);
      if (stage) contactScope.lifecycle_stage = stage;
      const companyName = scopedFilterValue(contactValues, 'company');
      const matches = companyName ? companyLookup.filter((c) => c.name === companyName) : [];
      if (matches.length === 1) companyId = matches[0].id;
    }
    return {
      categoryId: scopedFilterValue(values, 'category'),
      relationship: relationship === 'client' || relationship === 'supplier' ? relationship as PartyRelationship : undefined,
      contactScope, companyScope, companyCategoryIds, companyId,
    };
  }, [activeTab, companyValues, contactValues, categories, companyLookup]);

  // ── filtered lists ────────────────────────────────────────────────────────
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
  // A delete or a reload can shrink the list under the current page — clamp instead of
  // stranding the user on an empty table.
  useEffect(() => { setContactsPage((p) => clampPage(p, contactsTotal)); }, [contactsTotal]);
  useEffect(() => { setCompaniesPage((p) => clampPage(p, companiesTotal)); }, [companiesTotal]);

  // ── selection helpers ─────────────────────────────────────────────────────
  // Contacts/companies "select all" covers the CURRENT PAGE only — the other pages were
  // never fetched, so a whole-result-set select would be selecting rows nobody has seen
  // (and bulk delete would act on them).
  const allContactsSelected = contacts.length > 0 && contacts.every((c) => selContacts.has(c.id));
  const allCompaniesSelected = companies.length > 0 && companies.every((c) => selCompanies.has(c.id));

  // ── bulk runner ───────────────────────────────────────────────────────────
  const runBulk = async (ids: string[], op: (id: string) => Promise<unknown>, verb: string, after: () => Promise<void>, clear: () => void) => {
    setBulkBusy(true);
    try {
      // Sequential on purpose: parallel deletes cascade and exhaust the lock table.
      const failures: string[] = [];
      let ok = 0;
      for (const id of ids) {
        try { await op(id); ok += 1; } catch (e) { failures.push(e instanceof Error ? e.message : String(e)); }
      }
      const fail = failures.length;
      const reasons = [...new Set(failures)].slice(0, 2).join(' · ');
      toast({
        title: fail ? `${verb}: ${ok} done, ${fail} failed` : `${verb} ${ok}`,
        description: fail ? reasons : undefined,
        variant: fail && ok === 0 ? 'destructive' : 'default',
      });
      clear();
      await after();
    } finally { setBulkBusy(false); }
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

  /*
   * No "Professional type" on contacts or companies. `profession` on those two tables is the
   * FISCAL activity: `partyFromCrm` copies it onto the myDATA counterpart and the invoice PDF
   * prints it as "Δραστηριότητα". Writing the five-value app enum there puts the literal string
   * `supplier` on a legal document, and on a company it also overwrites the ΑΑΔΕ ΚΑΔ activity
   * the lookup filled in. Segmentation belongs to `contact_group`, the categories, and
   * is_client / is_supplier — all of which are already offered.
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

  // Contacts/companies filters drive a server query, so each change also drops back to
  // page 1 — otherwise a narrower result set leaves the user on an out-of-range offset.
  const onContactFilters = (v: FilterValues) => { setContactsPage(1); setContactValues(v); };
  const onCompanyFilters = (v: FilterValues) => { setCompaniesPage(1); setCompanyValues(v); };

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader title="CRM Management" description="Manage customer contacts, companies and deals" badge="Admin" />
      <AddPartyModal
        open={showAddParty}
        onOpenChange={setShowAddParty}
        {...newPartyScope}
      />

      <div className="p-3 sm:p-6 space-y-6">
        <div className="flex justify-end">
          <WorkspaceQuotaBadge table="crm_contacts" quotaKey="max_contacts" label="contacts" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Totals come from the API's exact count — the arrays hold one page now. */}
          <AdminStatCard title="Total Contacts" value={contactsTotal} icon={Building2} description="CRM contacts" variant="glass" />
          <AdminStatCard title="Total Companies" value={companiesTotal} icon={Building2} description="CRM companies" variant="glass" />
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 p-2">
            <TabsTrigger value="pipeline"><Kanban className="h-4 w-4 mr-2" />Pipeline</TabsTrigger>
            <TabsTrigger value="leads"><UserPlus className="h-4 w-4 mr-2" />Leads</TabsTrigger>
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
                  <PipelineBoard ws={activeWorkspaceId} canManage={canManageDeals} canManageTypes={isWsAdmin} analyticsHref="/crm/pipeline/analytics" />
                </CardContent>
              </Card>
            </ModuleTabGate>
          </TabsContent>

          <TabsContent value="leads" className="space-y-4 mt-6">
            <LeadsPanel workspaceId={activeWorkspaceId} />
          </TabsContent>

          {/* Contacts Tab */}
          <TabsContent value="users" className="space-y-6 mt-6">
            {activeWorkspaceId && <TeamPanel workspaceId={activeWorkspaceId} workspaceName={activeWorkspace?.name} />}
            {isPlatformOperator && <PlatformAccountsPanel />}
          </TabsContent>

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
                  <Button size="sm" onClick={() => setShowAddParty(true)}>
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
                <div className="rounded-md border border-hairline">
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
                        <TableHead className="hidden md:table-cell">Email</TableHead>
                        <TableHead className="hidden lg:table-cell">Phone</TableHead>
                        <TableHead className="hidden sm:table-cell">Company</TableHead>
                        {/* `profession` — the party's declared activity, not an app type. */}
                        <TableHead className="hidden xl:table-cell">Activity</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingContacts ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-4">Loading...</TableCell></TableRow>
                      ) : contacts.length === 0 ? (
                        <TableRow className="hover:bg-transparent"><TableCell colSpan={7} className="p-0">
                          <HubEmptyState
                            variant={Object.keys(contactValues).length ? 'filtered' : 'empty'}
                            icon={Users}
                            title={Object.keys(contactValues).length ? 'No contacts match your filters' : 'No contacts yet'}
                            description={Object.keys(contactValues).length
                              ? 'Contacts are filtered on the server, so this is the whole matching set — widen the filter to see more.'
                              : 'A contact is a person you deal with. Add one directly, or let an inbound lead, quote request or imported list create them for you.'}
                            action={Object.keys(contactValues).length
                              ? <Button size="sm" variant="outline" onClick={() => onContactFilters({})}>Clear filters</Button>
                              : <Button size="sm" onClick={() => setShowAddParty(true)}><Plus /> Add contact</Button>}
                          />
                        </TableCell></TableRow>
                      ) : contacts.map((contact) => (
                        <TableRow key={contact.id} data-state={selContacts.has(contact.id) ? 'selected' : undefined}>
                          <TableCell>
                            <Checkbox checked={selContacts.has(contact.id)} onCheckedChange={() => setSelContacts((s) => toggle(s, contact.id))} aria-label="Select row" />
                          </TableCell>
                          <TableCell className="font-medium max-w-[24rem]">
                            <div className="flex items-center gap-2 min-w-0">
                              <HubCellLink to={`/crm/contacts/${contact.id}`} className="block min-w-0 max-w-full truncate">
                                <span title={contact.name}>{contact.name}</span>
                              </HubCellLink>
                              {(contact as any).lead_score != null && (
                                <Badge className={`${leadScoreTint((contact as any).lead_score)} border-0 text-[10px]`} title="Lead score">{(contact as any).lead_score}</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="hidden max-w-[18rem] break-all md:table-cell">{contact.email ? <HubCellLink to={inboxComposeEmailUrl({ to: contact.email, contactId: contact.id })}>{contact.email}</HubCellLink> : <HubCellEmpty />}</TableCell>
                          <TableCell className="hidden whitespace-nowrap lg:table-cell">{contact.phone ? <a href={`tel:${contact.phone}`} className="text-primary hover:underline">{contact.phone}</a> : <HubCellEmpty />}</TableCell>
                          <TableCell className="hidden max-w-[16rem] break-words sm:table-cell">{contactCompanyName(contact) || <HubCellEmpty />}</TableCell>
                          <TableCell className="hidden text-sm text-muted-foreground xl:table-cell">{professionalTypeLabel(contact.profession) || contact.profession || <HubCellEmpty />}</TableCell>
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
                  <Button size="sm" onClick={() => setShowAddParty(true)}>
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
                <div className="rounded-md border border-hairline">
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
                        <TableHead className="hidden md:table-cell">Email</TableHead>
                        <TableHead className="hidden lg:table-cell">Phone</TableHead>
                        <TableHead className="hidden xl:table-cell">Website</TableHead>
                        {/* ΑΑΔΕ ΚΑΔ activity (falls back to industry when unresolved). */}
                        <TableHead className="hidden sm:table-cell">Activity</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingCompanies ? (
                        <TableRow><TableCell colSpan={7} className="text-center py-4">Loading...</TableCell></TableRow>
                      ) : companies.length === 0 ? (
                        <TableRow className="hover:bg-transparent"><TableCell colSpan={7} className="p-0">
                          <HubEmptyState
                            variant={Object.keys(companyValues).length ? 'filtered' : 'empty'}
                            icon={Building2}
                            title={Object.keys(companyValues).length ? 'No companies match your filters' : 'No companies yet'}
                            description={Object.keys(companyValues).length
                              ? 'Companies are filtered on the server, so this is the whole matching set — widen the filter to see more.'
                              : 'A company is the business behind your contacts — the party a quote, an order or an invoice is actually addressed to.'}
                            action={Object.keys(companyValues).length
                              ? <Button size="sm" variant="outline" onClick={() => onCompanyFilters({})}>Clear filters</Button>
                              : <Button size="sm" onClick={() => setShowAddParty(true)}><Plus /> Add company</Button>}
                          />
                        </TableCell></TableRow>
                      ) : companies.map((company) => (
                        <TableRow key={company.id} data-state={selCompanies.has(company.id) ? 'selected' : undefined}>
                          <TableCell>
                            <Checkbox checked={selCompanies.has(company.id)} onCheckedChange={() => setSelCompanies((s) => toggle(s, company.id))} aria-label="Select row" />
                          </TableCell>
                          <TableCell className="font-medium max-w-[24rem]">
                            <HubCellLink to={`/crm/companies/${company.id}`} className="block max-w-full truncate">
                              <span title={company.name}>{company.name}</span>
                            </HubCellLink>
                            {company.commercial_title && company.commercial_title.trim().toLowerCase() !== (company.name || '').trim().toLowerCase() && (
                              <div className="truncate text-xs font-normal text-muted-foreground">{company.commercial_title}</div>
                            )}
                          </TableCell>
                          <TableCell className="hidden max-w-[18rem] break-all md:table-cell">{company.email ? <a href={`mailto:${company.email}`} className="text-primary hover:underline">{company.email}</a> : <HubCellEmpty />}</TableCell>
                          <TableCell className="hidden whitespace-nowrap lg:table-cell">{company.phone ? <a href={`tel:${company.phone}`} className="text-primary hover:underline">{company.phone}</a> : <HubCellEmpty />}</TableCell>
                          <TableCell className="hidden max-w-[16rem] break-all xl:table-cell">{company.website ? <a href={company.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{company.website}</a> : <HubCellEmpty />}</TableCell>
                          <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{professionalTypeLabel(company.profession) || company.profession || company.industry || <HubCellEmpty />}</TableCell>
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

      </div>
    </div>
  );
};

export default CRMManagement;
