// Company Assets — a single shared panel mounted in BOTH the Finance module (cost/ownership angle)
// and the HR module (who-holds-what angle). One data model, one component; the `context` prop only
// shifts the emphasis (subtitle + default column focus). No dedicated /assets page by design.
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, Pencil, UserCheck, Undo2, Car, Smartphone, Laptop, CreditCard, Wrench, Box, Package } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
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
import { HubEmptyState } from '@/components/core/hub';

const CATEGORY_ICON: Record<AssetCategory, React.ComponentType<{ className?: string }>> = {
  vehicle: Car, phone: Smartphone, laptop: Laptop, payment_card: CreditCard, equipment: Wrench, other: Box,
};

const CATEGORIES = Object.keys(ASSET_CATEGORY_LABEL) as AssetCategory[];
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
};

export const CompanyAssetsPanel: React.FC<Props> = ({ workspaceId, canManage = true, context = 'finance' }) => {
  const { toast } = useToast();
  const [assets, setAssets] = useState<CompanyAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [recurring, setRecurring] = useState<RecurringExpenseOption[]>([]);

  const [categoryFilter, setCategoryFilter] = useState<'all' | AssetCategory>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Add/Edit dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyAsset | null>(null);
  const [form, setForm] = useState<AssetInput>(EMPTY_FORM);
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
      const [a, emp, con, co, rec] = await Promise.all([
        assetsService.listAssets(workspaceId),
        assetsService.listEmployees(workspaceId).catch(() => []),
        assetsService.listContacts(workspaceId).catch(() => []),
        assetsService.listCompanies(workspaceId).catch(() => []),
        assetsService.listRecurringExpenses(workspaceId).catch(() => []),
      ]);
      setAssets(a); setEmployees(emp); setContacts(con); setCompanies(co); setRecurring(rec);
    } catch (e: any) {
      toast({ title: 'Could not load assets', description: e?.message || String(e), variant: 'destructive' });
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [workspaceId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((a) => {
      if (categoryFilter !== 'all' && a.category !== categoryFilter) return false;
      if (!q) return true;
      return [a.name, a.identifier, a.current_holder?.assignee_name, a.supplier_name]
        .filter(Boolean).some((s) => s!.toLowerCase().includes(q));
    });
  }, [assets, categoryFilter, search]);

  const pageRows = useMemo(() => paginate(filtered, page, 15), [filtered, page]);
  useEffect(() => { setPage((p) => clampPage(p, filtered.length, 15)); }, [filtered.length]);

  const openAdd = () => { setEditing(null); setForm(EMPTY_FORM); setCostText(''); setSalvageText(''); setFormOpen(true); };
  const openEdit = (a: CompanyAsset) => {
    setEditing(a);
    setForm({
      category: a.category, name: a.name, identifier: a.identifier || '', status: a.status,
      acquisition_type: a.acquisition_type, acquisition_cost: a.acquisition_cost, currency: a.currency,
      acquired_at: a.acquired_at || '', supplier_company_id: a.supplier_company_id,
      recurring_expense_id: a.recurring_expense_id, finance_category_id: a.finance_category_id, notes: a.notes || '',
      depreciation_method: a.depreciation_method, useful_life_months: a.useful_life_months,
      salvage_value: a.salvage_value, depreciation_start: a.depreciation_start || '',
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

  const showLease = form.acquisition_type === 'leased' || form.acquisition_type === 'financed';
  const assignOptions = assignKind === 'employee' ? employees : contacts;

  return (
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
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            placeholder="Search name, plate, holder…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-48"
          />
          <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as any)}>
            <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{ASSET_CATEGORY_LABEL[c]}</SelectItem>)}
            </SelectContent>
          </Select>
          {canManage && <Button size="sm" className="h-8" onClick={openAdd}><Plus className="h-4 w-4 mr-1" /> Add asset</Button>}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-8 flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>
        ) : filtered.length === 0 ? (
          <HubEmptyState
            icon={Package}
            title="No assets yet"
            description="A vehicle, a phone, a card, a piece of equipment — track who is holding it, what it cost and what it still costs to run."
            action={canManage ? <Button size="sm" onClick={openAdd}><Plus /> Add asset</Button> : undefined}
          />
        ) : (
          <>
            <div className="table-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                  <th className="px-5 py-2 font-medium">Asset</th>
                  <th className="px-3 py-2 font-medium">Identifier</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Acquisition</th>
                  <th className="px-3 py-2 font-medium">Held by</th>
                  <th className="px-3 py-2 font-medium">Recurring cost</th>
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((a) => {
                  const Icon = CATEGORY_ICON[a.category] || Box;
                  return (
                    <tr key={a.id} className="border-b border-border/40 hover:bg-muted/30">
                      <td className="px-5 py-2">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div>
                            <div className="font-medium">{a.name}</div>
                            <div className="text-xs text-muted-foreground">{ASSET_CATEGORY_LABEL[a.category]}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{a.identifier || '—'}</td>
                      <td className="px-3 py-2">{ASSET_STATUS_LABEL[a.status]}</td>
                      <td className="px-3 py-2">
                        <div>{ACQUISITION_LABEL[a.acquisition_type]}</div>
                        <div className="text-xs text-muted-foreground">{money(a.acquisition_cost, a.currency)}</div>
                        {a.book_value != null && <div className="text-xs text-muted-foreground">Book: {money(a.book_value, a.currency)}</div>}
                      </td>
                      <td className="px-3 py-2">
                        {a.current_holder?.assignee_name
                          ? <span>{a.current_holder.assignee_name}<span className="text-xs text-muted-foreground"> ({a.current_holder.assignee_kind})</span></span>
                          : <span className="text-muted-foreground">Unassigned</span>}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{a.recurring_expense_label || '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          {canManage && (a.current_holder
                            ? <Button size="sm" variant="ghost" className="h-7 px-2" title="Mark returned" onClick={() => doReturn(a)}><Undo2 className="h-4 w-4" /></Button>
                            : <Button size="sm" variant="ghost" className="h-7 px-2" title="Assign to someone" onClick={() => openAssign(a)}><UserCheck className="h-4 w-4" /></Button>)}
                          {canManage && <Button size="sm" variant="ghost" className="h-7 px-2" title="Edit" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>}
                          {canManage && <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" title="Delete" onClick={() => doDelete(a)}><Trash2 className="h-4 w-4" /></Button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v as AssetCategory }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{ASSET_CATEGORY_LABEL[c]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as AssetStatus }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{ASSET_STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-2">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Ford Transit / iPhone 15 — Sales" />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>Identifier <span className="text-muted-foreground font-normal">(plate / IMEI / card last-4 / serial)</span></Label>
              <Input value={form.identifier || ''} onChange={(e) => setForm((f) => ({ ...f, identifier: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Acquisition</Label>
              <Select value={form.acquisition_type} onValueChange={(v) => setForm((f) => ({ ...f, acquisition_type: v as AcquisitionType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ACQ_TYPES.map((t) => <SelectItem key={t} value={t}>{ACQUISITION_LABEL[t]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Cost</Label>
              <div className="flex gap-1">
                <Input value={costText} onChange={(e) => setCostText(e.target.value)} placeholder="0,00" className="flex-1" />
                <Input value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} className="w-16" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Acquired</Label>
              <Input type="date" value={form.acquired_at || ''} onChange={(e) => setForm((f) => ({ ...f, acquired_at: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Supplier / lessor</Label>
              <Select value={form.supplier_company_id || 'none'} onValueChange={(v) => setForm((f) => ({ ...f, supplier_company_id: v === 'none' ? null : v }))}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {showLease && (
              <div className="space-y-1 col-span-2">
                <Label>Recurring cost <span className="text-muted-foreground font-normal">(links the monthly lease/plan expense)</span></Label>
                <Select value={form.recurring_expense_id || 'none'} onValueChange={(v) => setForm((f) => ({ ...f, recurring_expense_id: v === 'none' ? null : v }))}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Not linked —</SelectItem>
                    {recurring.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {recurring.length === 0 && (
                  <p className="text-xs text-muted-foreground">No recurring expenses yet — create one under Finance → Expenses to link the lease cost.</p>
                )}
              </div>
            )}
            {form.acquisition_type === 'owned' && (
              <div className="col-span-2 rounded-md border border-border/60 p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">Depreciation</Label>
                  <Select value={form.depreciation_method || 'none'} onValueChange={(v) => setForm((f) => ({ ...f, depreciation_method: v as DepreciationMethod }))}>
                    <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="straight_line">Straight-line</SelectItem>
                      <SelectItem value="declining_balance">Declining balance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {depreciates(form.depreciation_method) && (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label>Useful life (months)</Label>
                      <Input type="number" min="1" value={form.useful_life_months ?? ''} onChange={(e) => setForm((f) => ({ ...f, useful_life_months: e.target.value ? parseInt(e.target.value, 10) : null }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>Salvage value</Label>
                      <Input value={salvageText} onChange={(e) => setSalvageText(e.target.value)} placeholder="0,00" />
                    </div>
                    <div className="space-y-1">
                      <Label>Start</Label>
                      <Input type="date" value={form.depreciation_start || ''} onChange={(e) => setForm((f) => ({ ...f, depreciation_start: e.target.value }))} />
                    </div>
                    <p className="col-span-3 text-xs text-muted-foreground">Book value = cost − straight-line depreciation since start (defaults to the acquired date).</p>
                  </div>
                )}
              </div>
            )}
            <div className="space-y-1 col-span-2">
              <Label>Notes</Label>
              <Textarea value={form.notes || ''} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
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
            <div className="space-y-1">
              <Label>Assign to</Label>
              <Select value={assignKind} onValueChange={(v) => { setAssignKind(v as any); setAssignId(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="contact">Contact</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{assignKind === 'employee' ? 'Employee' : 'Contact'}</Label>
              <Select value={assignId} onValueChange={setAssignId}>
                <SelectTrigger><SelectValue placeholder={`Pick a ${assignKind}`} /></SelectTrigger>
                <SelectContent>
                  {assignOptions.length === 0
                    ? <div className="px-2 py-1.5 text-xs text-muted-foreground">None available</div>
                    : assignOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Note <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input value={assignNote} onChange={(e) => setAssignNote(e.target.value)} placeholder="e.g. handed over 2026-07-26" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submitAssign} disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default CompanyAssetsPanel;
