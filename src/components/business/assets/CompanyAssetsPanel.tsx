// Company Assets — a single shared panel mounted in BOTH the Finance module (cost/ownership angle)
// and the HR module (who-holds-what angle). One data model, one component; the `context` prop only
// shifts the emphasis (subtitle + default column focus). No dedicated /assets page by design.
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, Pencil, UserCheck, Undo2, Car, Smartphone, Laptop, CreditCard, Wrench, Box, Package } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { FormField, FormGrid, FormSection } from '@/components/core/ui/form-layout';
import { Textarea } from '@/components/core/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { useToast } from '@/hooks/use-toast';
import { parseDecimal, formatMoney } from '@/utils/decimal';
import {
  assetsService, ASSET_CATEGORY_LABEL, ASSET_STATUS_LABEL, ACQUISITION_LABEL,
  type CompanyAsset, type AssetCategory, type AssetStatus, type AcquisitionType, type DepreciationMethod,
  type AssetInput, type EmployeeOption, type ContactOption, type RecurringExpenseOption, type CompanyOption,
} from '@/services/assetsService';
import {
  HubDataTable, HubCellLink, HubCellEmpty, HubEmptyState, HubToolbar, HubFilterSelect, HubResetFilters,
  useHubTable, HUB_FILTER_ALL, type HubColumn, type HubTableField,
} from '@/components/core/hub';
import { Badge } from '@/components/core/ui/badge';
import { TaxDepreciationCard } from './TaxDepreciationCard';
import {
  taxDepreciationService, TAX_STATUS_LABEL, taxBasisIsUnknown,
  type TaxRateRow, type AssetTaxDepreciation,
} from '@/modules/finance/services/taxDepreciationService';

const CATEGORY_ICON: Record<AssetCategory, React.ComponentType<{ className?: string }>> = {
  vehicle: Car, phone: Smartphone, laptop: Laptop, payment_card: CreditCard, equipment: Wrench, other: Box,
};

const CATEGORIES = Object.keys(ASSET_CATEGORY_LABEL) as AssetCategory[];

const STATUS_VARIANT: Record<AssetStatus, 'success' | 'warning' | 'neutral'> = {
  active: 'success', in_repair: 'warning', retired: 'neutral', returned: 'neutral',
};

const ASSET_FIELDS: HubTableField<CompanyAsset>[] = [
  {
    id: 'name', sortValue: (a) => a.name,
    searchText: (a) => [a.name, a.identifier, a.current_holder?.assignee_name, a.supplier_name].filter(Boolean).join(' '),
  },
  { id: 'identifier', sortValue: (a) => a.identifier },
  {
    id: 'category', filterValue: (a) => a.category, filterLabel: 'Category',
    filterOptionLabel: (v) => ASSET_CATEGORY_LABEL[v as AssetCategory] ?? v,
  },
  {
    id: 'status', sortValue: (a) => ASSET_STATUS_LABEL[a.status], filterValue: (a) => a.status, filterLabel: 'Status',
    filterOptionLabel: (v) => ASSET_STATUS_LABEL[v as AssetStatus] ?? v,
  },
  {
    id: 'acquisition', sortValue: (a) => a.acquisition_cost, filterValue: (a) => a.acquisition_type,
    filterLabel: 'Acquisition', filterOptionLabel: (v) => ACQUISITION_LABEL[v as AcquisitionType] ?? v,
  },
  { id: 'holder', sortValue: (a) => a.current_holder?.assignee_name },
  { id: 'recurring', sortValue: (a) => a.recurring_expense_label },
];

const FILTER_IDS = [['category', 'Category'], ['status', 'Status'], ['acquisition', 'Acquisition']] as const;
const STATUSES = Object.keys(ASSET_STATUS_LABEL) as AssetStatus[];
const ACQ_TYPES = Object.keys(ACQUISITION_LABEL) as AcquisitionType[];

function money(n: number | null, currency: string): string {
  if (n == null) return '—';
  return formatMoney(n, currency || 'EUR');
}

interface Props {
  workspaceId: string | null;
  canManage?: boolean;
  /** Which module is hosting the panel — only shifts emphasis, not data. */
  context?: 'finance' | 'hr';
}

/** Methods that actually depreciate — i.e. that need a life / salvage / start date. */
const depreciates = (m: DepreciationMethod | undefined) =>
  m === 'straight_line' || m === 'declining_balance';

const EMPTY_FORM: AssetInput = {
  category: 'vehicle', name: '', identifier: '', status: 'active',
  acquisition_type: 'owned', acquisition_cost: null, currency: 'EUR', acquired_at: '',
  supplier_company_id: null, recurring_expense_id: null, finance_category_id: null, notes: '',
  depreciation_method: 'none', useful_life_months: null, salvage_value: null, depreciation_start: '',
  tax_category_code: null, tax_placed_in_service_on: '',
};

export const CompanyAssetsPanel: React.FC<Props> = ({ workspaceId, canManage = true, context = 'finance' }) => {
  const { toast } = useToast();
  const [assets, setAssets] = useState<CompanyAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [recurring, setRecurring] = useState<RecurringExpenseOption[]>([]);

  const t = useHubTable(assets, ASSET_FIELDS, { columnId: 'name', direction: 'asc' });
  const categoryFilter = CATEGORIES.find((c) => c === t.filters.category);
  const [page, setPage] = useState(1);

  // Add/Edit dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyAsset | null>(null);
  const [form, setForm] = useState<AssetInput>(EMPTY_FORM);
  const [taxCategories, setTaxCategories] = useState<TaxRateRow[]>([]);
  const [taxBasis, setTaxBasis] = useState<Record<string, AssetTaxDepreciation>>({});
  const [costText, setCostText] = useState('');
  const [salvageText, setSalvageText] = useState('');
  const [busy, setBusy] = useState(false);

  // Assign dialog state
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<CompanyAsset | null>(null);
  const [assignKind, setAssignKind] = useState<'employee' | 'contact'>('employee');
  const [assignId, setAssignId] = useState<string>('');
  const [assignNote, setAssignNote] = useState('');

  const load = async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const [a, emp, con, co, rec, tax] = await Promise.all([
        assetsService.listAssets(workspaceId),
        assetsService.listEmployees(workspaceId).catch(() => []),
        assetsService.listContacts(workspaceId).catch(() => []),
        assetsService.listCompanies(workspaceId).catch(() => []),
        assetsService.listRecurringExpenses(workspaceId).catch(() => []),
        taxDepreciationService.rateTable(workspaceId).catch(() => [] as TaxRateRow[]),
      ]);
      setAssets(a); setEmployees(emp); setContacts(con); setCompanies(co); setRecurring(rec);
      setTaxCategories(tax);
      // The tax schedule for the same assets. Derived server-side against the rate in force in
      // each month, so this is a read -- never a second computation of the same money.
      const basis = await taxDepreciationService
        .forAssets(a.map((x) => x.id))
        .catch(() => [] as AssetTaxDepreciation[]);
      setTaxBasis(Object.fromEntries(basis.map((b) => [b.asset_id, b])));
    } catch (e: any) {
      toast({ title: 'Could not load assets', description: e?.message || String(e), variant: 'destructive' });
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [workspaceId]);

  const filtered = t.rows;

  const pageRows = useMemo(() => paginate(filtered, page, 15), [filtered, page]);
  useEffect(() => { setPage((p) => clampPage(p, filtered.length, 15)); }, [filtered.length]);

  const openAdd = () => { setEditing(null); setForm(categoryFilter ? { ...EMPTY_FORM, category: categoryFilter } : EMPTY_FORM); setCostText(''); setSalvageText(''); setFormOpen(true); };
  const openEdit = (a: CompanyAsset) => {
    setEditing(a);
    setForm({
      category: a.category, name: a.name, identifier: a.identifier || '', status: a.status,
      acquisition_type: a.acquisition_type, acquisition_cost: a.acquisition_cost, currency: a.currency,
      acquired_at: a.acquired_at || '', supplier_company_id: a.supplier_company_id,
      recurring_expense_id: a.recurring_expense_id, finance_category_id: a.finance_category_id, notes: a.notes || '',
      depreciation_method: a.depreciation_method, useful_life_months: a.useful_life_months,
      salvage_value: a.salvage_value, depreciation_start: a.depreciation_start || '',
      tax_category_code: a.tax_category_code,
      tax_placed_in_service_on: a.tax_placed_in_service_on || '',
    });
    setCostText(a.acquisition_cost != null ? String(a.acquisition_cost) : '');
    setSalvageText(a.salvage_value ? String(a.salvage_value) : '');
    setFormOpen(true);
  };

  const submitForm = async () => {
    if (!workspaceId) return;
    if (!form.name.trim()) { toast({ title: 'Name is required', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      // Depreciation only applies to owned assets; leased/financed are pure expenses.
      const owned = form.acquisition_type === 'owned';
      const payload: AssetInput = {
        ...form,
        acquisition_cost: costText.trim() ? parseDecimal(costText) : null,
        depreciation_method: owned ? (form.depreciation_method || 'none') : 'none',
        useful_life_months: owned && depreciates(form.depreciation_method) ? (form.useful_life_months || null) : null,
        salvage_value: owned && depreciates(form.depreciation_method) && salvageText.trim() ? parseDecimal(salvageText) : 0,
        depreciation_start: owned && depreciates(form.depreciation_method) ? (form.depreciation_start || null) : null,
        // The tax basis is independent of the book method: an asset the books do not depreciate
        // can still carry a statutory rate, and vice versa.
        tax_category_code: owned ? (form.tax_category_code || null) : null,
        tax_placed_in_service_on: owned ? (form.tax_placed_in_service_on || null) : null,
      };
      if (editing) { await assetsService.updateAsset(editing.id, payload); toast({ title: 'Asset updated' }); }
      else { await assetsService.createAsset(workspaceId, payload); toast({ title: 'Asset added' }); }
      setFormOpen(false); await load();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message || String(e), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const openAssign = (a: CompanyAsset) => {
    setAssignTarget(a); setAssignKind('employee'); setAssignId(''); setAssignNote(''); setAssignOpen(true);
  };
  const submitAssign = async () => {
    if (!workspaceId || !assignTarget) return;
    if (!assignId) { toast({ title: 'Pick who to assign to', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      await assetsService.assignAsset(workspaceId, assignTarget.id, {
        employeeId: assignKind === 'employee' ? assignId : null,
        contactId: assignKind === 'contact' ? assignId : null,
        note: assignNote || null,
      });
      toast({ title: 'Assigned' }); setAssignOpen(false); await load();
    } catch (e: any) {
      toast({ title: 'Assign failed', description: e?.message || String(e), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const doReturn = async (a: CompanyAsset) => {
    setBusy(true);
    try { await assetsService.returnAsset(a.id); toast({ title: 'Marked returned' }); await load(); }
    catch (e: any) { toast({ title: 'Failed', description: e?.message || String(e), variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const doDelete = async (a: CompanyAsset) => {
    if (!window.confirm(`Delete "${a.name}"? This removes the asset and its assignment history.`)) return;
    setBusy(true);
    try { await assetsService.deleteAsset(a.id); toast({ title: 'Deleted' }); await load(); }
    catch (e: any) { toast({ title: 'Delete failed', description: e?.message || String(e), variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const columns: HubColumn<CompanyAsset>[] = [
    {
      id: 'name', header: 'Asset', sortable: true,
      cell: (a) => {
        const Icon = CATEGORY_ICON[a.category] || Box;
        return (
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              {canManage ? (
                <button type="button" onClick={() => openEdit(a)} className="block max-w-[16rem] truncate text-left" title={a.name}>
                  <HubCellLink>{a.name}</HubCellLink>
                </button>
              ) : (
                <div className="max-w-[16rem] truncate font-medium" title={a.name}>{a.name}</div>
              )}
              <div className="text-xs text-muted-foreground">{ASSET_CATEGORY_LABEL[a.category]}</div>
            </div>
          </div>
        );
      },
    },
    {
      id: 'identifier', header: 'Identifier', sortable: true, hideBelow: 'md',
      cell: (a) => (a.identifier ? <span className="text-muted-foreground">{a.identifier}</span> : <HubCellEmpty />),
    },
    {
      id: 'status', header: 'Status', sortable: true,
      cell: (a) => <Badge variant={STATUS_VARIANT[a.status] ?? 'neutral'}>{ASSET_STATUS_LABEL[a.status]}</Badge>,
    },
    {
      id: 'acquisition', header: 'Acquisition', sortable: true, hideBelow: 'sm',
      cell: (a) => (
        <>
          <div>{ACQUISITION_LABEL[a.acquisition_type]}</div>
          <div className="text-xs text-muted-foreground tabular-nums">{money(a.acquisition_cost, a.currency)}</div>
          {a.book_value != null && <div className="text-xs text-muted-foreground tabular-nums">Book: {money(a.book_value, a.currency)}</div>}
          {taxBasis[a.id] && (taxBasisIsUnknown(taxBasis[a.id].status)
            ? <div className="text-xs text-amber-800 dark:text-amber-300">Tax: {TAX_STATUS_LABEL[taxBasis[a.id].status]}</div>
            : <div className="text-xs text-muted-foreground tabular-nums">Tax: {money(taxBasis[a.id].written_down_value, a.currency)}</div>)}
        </>
      ),
    },
    {
      id: 'holder', header: 'Held by', sortable: true, hideBelow: 'md',
      cell: (a) => (a.current_holder?.assignee_name
        ? <span>{a.current_holder.assignee_name}<span className="text-xs text-muted-foreground"> ({a.current_holder.assignee_kind})</span></span>
        : <span className="text-muted-foreground">Unassigned</span>),
    },
    {
      id: 'recurring', header: 'Recurring cost', sortable: true, hideBelow: 'lg',
      cell: (a) => (a.recurring_expense_label
        ? <span className="block max-w-[14rem] truncate text-xs text-muted-foreground" title={a.recurring_expense_label}>{a.recurring_expense_label}</span>
        : <HubCellEmpty />),
    },
    {
      id: 'actions', header: <span className="sr-only">Actions</span>, align: 'right',
      cell: (a) => (
        <div className="flex items-center justify-end gap-1">
          {canManage && (a.current_holder
            ? <Button size="sm" variant="ghost" className="h-7 px-2" title="Mark returned" onClick={() => doReturn(a)}><Undo2 className="h-4 w-4" /></Button>
            : <Button size="sm" variant="ghost" className="h-7 px-2" title="Assign to someone" onClick={() => openAssign(a)}><UserCheck className="h-4 w-4" /></Button>)}
          {canManage && <Button size="sm" variant="ghost" className="h-7 px-2" title="Edit" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>}
          {canManage && <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" title="Delete" onClick={() => doDelete(a)}><Trash2 className="h-4 w-4" /></Button>}
        </div>
      ),
    },
  ];

  const showLease = form.acquisition_type === 'leased' || form.acquisition_type === 'financed';
  const assignOptions = assignKind === 'employee' ? employees : contacts;

  return (
    <div className="space-y-4">
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3 flex-row items-center justify-between gap-3 flex-wrap space-y-0">
        <div>
          <CardTitle>Company Assets</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {context === 'hr'
              ? 'Equipment, phones, cards and vehicles issued to staff — who holds what.'
              : 'Vehicles, phones, cards & equipment the company owns or leases — cost and holder.'}
          </p>
        </div>
        {canManage && <Button size="sm" className="h-8" onClick={openAdd}><Plus className="h-4 w-4 mr-1" /> Add asset</Button>}
      </CardHeader>
      <CardContent className="p-0">
        {assets.length > 0 && (
          <HubToolbar
            search={t.search}
            onSearchChange={t.setSearch}
            searchPlaceholder="Search name, plate, holder…"
            filters={<>
              {FILTER_IDS.map(([id, label]) => (
                <HubFilterSelect
                  key={id}
                  label={label}
                  value={t.filters[id] ?? HUB_FILTER_ALL}
                  options={t.filterOptions[id] ?? []}
                  onChange={(v) => t.setFilter(id, v)}
                />
              ))}
              <HubResetFilters count={t.activeFilterCount} onReset={t.reset} />
            </>}
          />
        )}
        {loading ? (
          <div className="p-8 flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
        ) : filtered.length === 0 && assets.length > 0 ? (
          <HubEmptyState
            variant="filtered"
            title="No assets match these filters"
            action={<Button size="sm" variant="outline" onClick={t.reset}>Clear filters</Button>}
          />
        ) : filtered.length === 0 ? (
          <HubEmptyState
            icon={Package}
            title="No assets yet"
            description="A vehicle, a phone, a card, a piece of equipment — track who is holding it, what it cost and what it still costs to run."
            action={canManage ? <Button size="sm" onClick={openAdd}><Plus /> Add asset</Button> : undefined}
          />
        ) : (
          <>
            <HubDataTable
              className="rounded-none border-0"
              rows={pageRows}
              columns={columns}
              rowId={(a) => a.id}
              sort={t.sort}
              onSortChange={t.setSort}
            />
            <TablePagination page={page} total={filtered.length} pageSize={15} onPageChange={setPage} />
          </>
        )}
      </CardContent>

      {/* Add / Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit asset' : 'Add asset'}</DialogTitle>
            <DialogDescription>Company property tracked across Finance and HR.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <FormSection title="Asset">
              <FormGrid>
                <FormField label="Category">
                  <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v as AssetCategory }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{ASSET_CATEGORY_LABEL[c]}</SelectItem>)}</SelectContent>
                  </Select>
                </FormField>
                <FormField label="Status">
                  <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as AssetStatus }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{ASSET_STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
                  </Select>
                </FormField>
                <FormField label="Name" className="sm:col-span-2">
                  <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Ford Transit / iPhone 15 — Sales" />
                </FormField>
                <FormField label="Identifier" optional hint="Plate, IMEI, card last-4 or serial." className="sm:col-span-2">
                  <Input value={form.identifier || ''} onChange={(e) => setForm((f) => ({ ...f, identifier: e.target.value }))} />
                </FormField>
              </FormGrid>
            </FormSection>

            <FormSection title="Acquisition">
              <FormGrid>
                <FormField label="Acquisition">
                  <Select value={form.acquisition_type} onValueChange={(v) => setForm((f) => ({ ...f, acquisition_type: v as AcquisitionType }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ACQ_TYPES.map((t) => <SelectItem key={t} value={t}>{ACQUISITION_LABEL[t]}</SelectItem>)}</SelectContent>
                  </Select>
                </FormField>
                <FormField label="Cost">
                  <div className="flex gap-1">
                    <Input value={costText} onChange={(e) => setCostText(e.target.value)} placeholder="0,00" className="flex-1" />
                    <Input value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} className="w-16" />
                  </div>
                </FormField>
                <FormField label="Acquired">
                  <Input type="date" value={form.acquired_at || ''} onChange={(e) => setForm((f) => ({ ...f, acquired_at: e.target.value }))} />
                </FormField>
                <FormField label="Supplier / lessor" optional>
                  <Select value={form.supplier_company_id || 'none'} onValueChange={(v) => setForm((f) => ({ ...f, supplier_company_id: v === 'none' ? null : v }))}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormField>
                {showLease && (
                  <FormField
                    label="Recurring cost"
                    optional
                    hint={recurring.length === 0
                      ? 'Links the monthly lease/plan expense. No recurring expenses yet — create one under Finance → Expenses to link the lease cost.'
                      : 'Links the monthly lease/plan expense.'}
                    className="sm:col-span-2"
                  >
                    <Select value={form.recurring_expense_id || 'none'} onValueChange={(v) => setForm((f) => ({ ...f, recurring_expense_id: v === 'none' ? null : v }))}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Not linked —</SelectItem>
                        {recurring.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormField>
                )}
              </FormGrid>
            </FormSection>

            {form.acquisition_type === 'owned' && (
              <FormSection title="Depreciation">
                <FormGrid cols={3}>
                  <FormField label="Book method">
                    <Select value={form.depreciation_method || 'none'} onValueChange={(v) => setForm((f) => ({ ...f, depreciation_method: v as DepreciationMethod }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="straight_line">Straight-line</SelectItem>
                        <SelectItem value="declining_balance">Declining balance</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                  {depreciates(form.depreciation_method) && (
                    <>
                      <FormField label="Useful life (months)" className="sm:col-start-1">
                        <Input type="number" min="1" value={form.useful_life_months ?? ''} onChange={(e) => setForm((f) => ({ ...f, useful_life_months: e.target.value ? parseInt(e.target.value, 10) : null }))} />
                      </FormField>
                      <FormField label="Salvage value">
                        <Input value={salvageText} onChange={(e) => setSalvageText(e.target.value)} placeholder="0,00" />
                      </FormField>
                      <FormField label="Start">
                        <Input type="date" value={form.depreciation_start || ''} onChange={(e) => setForm((f) => ({ ...f, depreciation_start: e.target.value }))} />
                      </FormField>
                      <p className="text-xs text-muted-foreground sm:col-span-3">Book value = cost − straight-line depreciation since start (defaults to the acquired date).</p>
                    </>
                  )}
                </FormGrid>
                <FormGrid className="border-t border-hairline pt-3">
                  <FormField label="Tax category (άρθρο 24)">
                    <Select
                      value={form.tax_category_code || 'none'}
                      onValueChange={(v) => setForm((f) => ({ ...f, tax_category_code: v === 'none' ? null : v }))}
                    >
                      <SelectTrigger><SelectValue placeholder="Not set" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not set</SelectItem>
                        {taxCategories.map((c) => (
                          <SelectItem key={c.code} value={c.code}>{c.label_en}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                  <FormField label="Put into use on">
                    <Input
                      type="date" value={form.tax_placed_in_service_on || ''}
                      onChange={(e) => setForm((f) => ({ ...f, tax_placed_in_service_on: e.target.value }))}
                    />
                  </FormField>
                  <p className="text-xs text-muted-foreground sm:col-span-2">
                    Tax depreciation is a statutory percentage of cost and runs from the month AFTER
                    the asset was put into use — which is why this is not the book start date.
                  </p>
                </FormGrid>
              </FormSection>
            )}

            <FormField label="Notes" optional>
              <Textarea value={form.notes || ''} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submitForm} disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}{editing ? 'Save' : 'Add'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign “{assignTarget?.name}”</DialogTitle>
            <DialogDescription>Hand this asset to an employee or a contact. Any current holder is released.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <FormField label="Assign to">
              <Select value={assignKind} onValueChange={(v) => { setAssignKind(v as any); setAssignId(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="contact">Contact</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={assignKind === 'employee' ? 'Employee' : 'Contact'}>
              <Select value={assignId} onValueChange={setAssignId}>
                <SelectTrigger><SelectValue placeholder={`Pick a ${assignKind}`} /></SelectTrigger>
                <SelectContent>
                  {assignOptions.length === 0
                    ? <div className="px-2 py-1.5 text-xs text-muted-foreground">None available</div>
                    : assignOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Note" optional>
              <Input value={assignNote} onChange={(e) => setAssignNote(e.target.value)} placeholder="e.g. handed over 2026-07-26" />
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submitAssign} disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
    {/* #451 -- the book basis above is one of TWO. The tax one is a statutory rate on cost, and
        the difference between them is a real adjustment on the income-tax return. */}
    {context === 'finance' && <TaxDepreciationCard workspaceId={workspaceId} canManage={canManage} />}
    </div>
  );
};

export default CompanyAssetsPanel;
