/**
 * Time-tracking & billing. Log billable hours against a customer, then turn unbilled
 * entries into a draft invoice (one line per entry).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, Clock, Search, FilePlus2, CheckCircle2, BarChart3, Users, Contact } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { CRM_SEARCH_COLUMN, foldedLike } from '@/services/crmSearch';
import { formatMoney } from '@/modules/finance/services/financeService';
import { timeTrackingService, type TimeEntry, type TimeReportUserRow, type TimeReportContactRow } from '@/modules/finance/services/timeTrackingService';
import { parseDecimal } from '@/utils/decimal';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { FilterBar, optionsFromRows, useFilters, type FilterGroupDef } from '@/components/core/filters';

interface Props { workspaceId: string }
type Customer = { type: 'company' | 'contact'; id: string; label: string };

const partyKey = (e: TimeEntry) => e.customer_company_id ? `c:${e.customer_company_id}` : e.customer_contact_id ? `p:${e.customer_contact_id}` : '';
const hoursOf = (m: number) => Math.round((m / 60) * 100) / 100;

export const TimeBillingTab: React.FC<Props> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [vatRate, setVatRate] = useState(24);
  const [names, setNames] = useState<Record<string, string>>({});

  // log form
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<Customer[]>([]);
  const [workDate, setWorkDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [hours, setHours] = useState('1');
  const [rate, setRate] = useState('50');
  const [desc, setDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [billing, setBilling] = useState(false);

  // Time reports — per user / per contact
  const thisYear = new Date().getFullYear();
  const [repFrom, setRepFrom] = useState(`${thisYear}-01-01`);
  const [repTo, setRepTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [report, setReport] = useState<{ byUser: TimeReportUserRow[]; byContact: TimeReportContactRow[] } | null>(null);
  const [repLoading, setRepLoading] = useState(false);
  const [repView, setRepView] = useState<'user' | 'contact'>('user');

  const loadReport = async () => {
    try {
      setRepLoading(true);
      setReport(await timeTrackingService.report(workspaceId, repFrom, repTo));
    } catch (err: any) { toast({ title: 'Failed to load report', description: err?.message, variant: 'destructive' }); }
    finally { setRepLoading(false); }
  };
  useEffect(() => { void loadReport(); /* eslint-disable-next-line */ }, [workspaceId, repFrom, repTo]);

  const load = async () => {
    try {
      setLoading(true);
      const [list, fs] = await Promise.all([
        timeTrackingService.list(workspaceId),
        supabase.from('finance_settings').select('default_vat_rate').eq('workspace_id', workspaceId).maybeSingle(),
      ]);
      setEntries(list);
      if (fs.data?.default_vat_rate != null) setVatRate(Number(fs.data.default_vat_rate));
      // resolve party names for display
      const compIds = [...new Set(list.map((e) => e.customer_company_id).filter(Boolean) as string[])];
      const contIds = [...new Set(list.map((e) => e.customer_contact_id).filter(Boolean) as string[])];
      const nm: Record<string, string> = {};
      await Promise.all([
        compIds.length ? supabase.from('crm_companies').select('id, name').in('id', compIds).then(({ data }) => { for (const c of data ?? []) nm[`c:${c.id}`] = (c as any).name ?? ''; }) : Promise.resolve(),
        contIds.length ? supabase.from('crm_contacts').select('id, name, first_name, last_name').in('id', contIds).then(({ data }) => { for (const c of data ?? []) nm[`p:${c.id}`] = (c as any).name || [(c as any).first_name, (c as any).last_name].filter(Boolean).join(' '); }) : Promise.resolve(),
      ]);
      setNames(nm);
    } catch (err: any) { toast({ title: 'Failed to load', description: err?.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [workspaceId]);

  // Projects available to attribute time to. Queried directly (rather than via projectsService)
  // to keep the finance bundle from pulling in the whole projects service for two columns.
  // Filtered to this workspace because the DB trigger rejects a cross-workspace project_id.
  useEffect(() => {
    if (!workspaceId) { setProjects([]); return; }
    void (async () => {
      const { data } = await supabase
        .from('projects').select('id, name')
        .eq('workspace_id', workspaceId)
        .order('last_activity_at', { ascending: false });
      setProjects((data ?? []) as { id: string; name: string }[]);
    })();
  }, [workspaceId]);

  // customer search
  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) { setOptions([]); return; }
    const t = setTimeout(async () => {
      const [contacts, companies] = await Promise.all([
        supabase.from('crm_contacts').select('id, name, first_name, last_name, email')
          .ilike(CRM_SEARCH_COLUMN, foldedLike(term)).limit(6),
        supabase.from('crm_companies').select('id, name')
          .ilike(CRM_SEARCH_COLUMN, foldedLike(term)).limit(6),
      ]);
      const opts: Customer[] = [];
      for (const c of contacts.data ?? []) opts.push({ type: 'contact', id: (c as any).id, label: (c as any).name || [(c as any).first_name, (c as any).last_name].filter(Boolean).join(' ') || (c as any).email || (c as any).id });
      for (const c of companies.data ?? []) opts.push({ type: 'company', id: (c as any).id, label: `${(c as any).name} (company)` });
      setOptions(opts);
    }, 200);
    return () => clearTimeout(t);
  }, [search]);

  const logEntry = async () => {
    const h = parseDecimal(hours), r = parseDecimal(rate);
    if (!desc.trim()) { toast({ title: 'Description required', variant: 'destructive' }); return; }
    if (!Number.isFinite(h) || h <= 0) { toast({ title: 'Hours must be > 0', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await timeTrackingService.create(workspaceId, {
        customer_company_id: customer?.type === 'company' ? customer.id : null,
        customer_contact_id: customer?.type === 'contact' ? customer.id : null,
        project_id: projectId || null,
        work_date: workDate, minutes: Math.round(h * 60), hourly_rate: Number.isFinite(r) ? r : 0,
        description: desc.trim(),
      });
      setDesc(''); setHours('1');
      await load();
      void loadReport();
      toast({ title: 'Time logged' });
    } catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  const removeEntry = async (e: TimeEntry) => {
    try { await timeTrackingService.remove(e.id); await load(); void loadReport(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };

  const projectNameById = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p.name])), [projects]);

  const unbilled = useMemo(() => entries.filter((e) => e.is_billable && !e.billed_invoice_id), [entries]);
  const billed = useMemo(() => entries.filter((e) => e.billed_invoice_id), [entries]);

  // You bill one customer at a time, so a customer facet (plus date + text) is the key filter here.
  const ubName = (e: TimeEntry) => names[partyKey(e)] || (partyKey(e) ? '—' : 'No customer');
  const unbilledFilterGroups = useMemo<FilterGroupDef[]>(() => [{
    key: 'general', label: 'General', icon: Clock,
    fields: [
      { key: 'q', type: 'text', label: 'Search', placeholder: 'What / customer…', accessor: (e: TimeEntry) => [e.description, ubName(e)] },
      { key: 'customer', type: 'multi', label: 'Customer', options: optionsFromRows(unbilled, ubName), accessor: (e: TimeEntry) => ubName(e) },
      { key: 'work_date', type: 'dateRange', label: 'Date', accessor: (e: TimeEntry) => e.work_date },
    ],
  }], [unbilled, names]);
  const { values: ubFilterValues, setValues: setUbFilterValues, filtered: unbilledView, previewCount: ubPreview } =
    useFilters<TimeEntry>(unbilled, unbilledFilterGroups);

  const [unbilledPage, setUnbilledPage] = useState(1);
  const [billedPage, setBilledPage] = useState(1);
  // Billing or deleting entries moves them between the two lists — clamp both so neither
  // is left showing an empty page. (Selection is by id, so it survives paging.)
  useEffect(() => { setUnbilledPage((p) => clampPage(p, unbilledView.length)); }, [unbilledView.length]);
  useEffect(() => { setBilledPage((p) => clampPage(p, billed.length)); }, [billed.length]);

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const selectedRows = unbilled.filter((e) => selected.has(e.id));
  const selectedCustomerKeys = new Set(selectedRows.map(partyKey));
  const mixedCustomers = selectedCustomerKeys.size > 1;
  const selectedTotal = selectedRows.reduce((s, e) => s + hoursOf(e.minutes) * Number(e.hourly_rate), 0);

  const bill = async () => {
    if (selectedRows.length === 0) return;
    if (mixedCustomers) { toast({ title: 'Select entries for one customer at a time', variant: 'destructive' }); return; }
    const first = selectedRows[0];
    const cust: Customer | null = first.customer_company_id ? { type: 'company', id: first.customer_company_id, label: '' }
      : first.customer_contact_id ? { type: 'contact', id: first.customer_contact_id, label: '' } : null;
    if (!cust) { toast({ title: 'These entries have no customer', description: 'Assign a customer to bill them.', variant: 'destructive' }); return; }
    setBilling(true);
    try {
      const invoiceId = await timeTrackingService.billToInvoice(workspaceId, cust, selectedRows.map((e) => e.id), vatRate);
      setSelected(new Set());
      await load();
      void loadReport();
      toast({ title: 'Draft invoice created', description: `Invoice ${invoiceId.slice(0, 8)} — finalize & issue it in Invoices.` });
    } catch (err: any) { toast({ title: 'Could not bill', description: err?.message, variant: 'destructive' }); }
    finally { setBilling(false); }
  };

  return (
    <div className="space-y-4">
      {/* Log form */}
      <Card>
        <CardHeader className="border-b border-border/60 px-5 py-3">
          <CardTitle className="flex items-center gap-2"><Clock className="h-4 w-4" /> Log time</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 p-5 md:grid-cols-6">
          <div className="space-y-1 md:col-span-2">
            <Label className="text-xs">Customer (optional)</Label>
            {customer ? (
              <div className="flex items-center justify-between rounded-md border border-border/60 px-2 py-1.5 text-sm">
                <span className="truncate">{customer.label}</span>
                <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setCustomer(null)}>Change</button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input className="h-9 pl-7 text-sm" placeholder="Search customer…" value={search} onChange={(e) => setSearch(e.target.value)} />
                {options.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border border-border/60 bg-popover shadow">
                    {options.map((o) => (
                      <button key={`${o.type}-${o.id}`} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { setCustomer(o); setSearch(''); setOptions([]); }}>{o.label}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Date</Label>
            <Input type="date" className="h-9" value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hours</Label>
            <Input type="text" inputMode="decimal" className="h-9" value={hours} onChange={(e) => setHours(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Rate /h</Label>
            <Input type="text" inputMode="decimal" className="h-9" value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button size="sm" className="w-full" onClick={logEntry} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />} Log
            </Button>
          </div>
          <div className="space-y-1 md:col-span-4">
            <Label className="text-xs">What did you do?</Label>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. On-site measurement & consultation" />
          </div>
          {/* Attributing the hours to a project is what makes them show up as labor cost in the
              project's job-cost card. Optional — customer-only billing is unchanged. */}
          <div className="space-y-1 md:col-span-2">
            <Label className="text-xs">Project (optional)</Label>
            <select
              className="h-9 w-full rounded-md border border-border/60 bg-background px-2 text-sm"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">No project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Unbilled + bill action */}
      <Card>
        <CardHeader className="border-b border-border/60 px-5 py-3 flex-row items-center justify-between space-y-0 gap-3 flex-wrap">
          <CardTitle>Unbilled Time</CardTitle>
          <div className="flex items-center gap-3 text-xs">
            {selectedRows.length > 0 && (
              <>
                <span className="text-muted-foreground">{selectedRows.length} selected · {formatMoney(selectedTotal)}</span>
                <Button size="sm" className="rounded-full" disabled={billing || mixedCustomers} onClick={bill}>
                  {billing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FilePlus2 className="h-3.5 w-3.5 mr-1" />} Create invoice
                </Button>
              </>
            )}
            {unbilled.length > 0 && (
              <FilterBar groups={unbilledFilterGroups} values={ubFilterValues} onChange={setUbFilterValues} previewCount={ubPreview} title="Filter unbilled time" />
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : unbilled.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No unbilled time. Log some above.</p>
          ) : unbilledView.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No entries match the filter.</p>
          ) : (
            <>
            <div className="divide-y divide-border/40">
              {mixedCustomers && <p className="px-4 py-1.5 text-[11px] text-amber-500">Selected entries span multiple customers — invoice one customer at a time.</p>}
              {paginate(unbilledView, unbilledPage).map((e) => (
                <label key={e.id} className="flex cursor-pointer items-center gap-3 px-4 py-2 text-sm hover:bg-muted/30">
                  <Checkbox checked={selected.has(e.id)} onCheckedChange={() => toggle(e.id)} />
                  <div className="w-20 text-xs text-muted-foreground">{e.work_date}</div>
                  <div className="min-w-0 flex-1 truncate">
                    {e.description}
                    {e.project_id && (
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        · {projectNameById[e.project_id] ?? 'Project'}
                      </span>
                    )}
                  </div>
                  <div className="w-28 truncate text-xs text-muted-foreground">{names[partyKey(e)] || (partyKey(e) ? '—' : 'No customer')}</div>
                  <div className="w-16 text-right text-xs">{hoursOf(e.minutes)}h</div>
                  <div className="w-20 text-right tabular-nums">{formatMoney(hoursOf(e.minutes) * Number(e.hourly_rate))}</div>
                  <button type="button" className="text-muted-foreground hover:text-destructive" onClick={(ev) => { ev.preventDefault(); removeEntry(e); }}><Trash2 className="h-3.5 w-3.5" /></button>
                </label>
              ))}
            </div>
            <TablePagination page={unbilledPage} total={unbilledView.length} onPageChange={setUnbilledPage} label="entries" />
            </>
          )}
        </CardContent>
      </Card>

      {/* Time reports — per user / per contact */}
      <Card>
        <CardHeader className="border-b border-border/60 px-5 py-3 flex-row items-center justify-between space-y-0 flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Time reports</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border border-border/60 p-0.5">
              <button type="button" onClick={() => setRepView('user')} className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${repView === 'user' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}><Users className="h-3.5 w-3.5" /> By user</button>
              <button type="button" onClick={() => setRepView('contact')} className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${repView === 'contact' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}><Contact className="h-3.5 w-3.5" /> By contact</button>
            </div>
            <input type="date" value={repFrom} max={repTo} onChange={(e) => setRepFrom(e.target.value)} className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs" />
            <span className="text-xs text-muted-foreground">→</span>
            <input type="date" value={repTo} min={repFrom} onChange={(e) => setRepTo(e.target.value)} className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {repLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : repView === 'user' ? (
            (report?.byUser.length ?? 0) === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No time logged in this period.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border/60">
                    <th className="px-4 py-2 text-left">User</th>
                    <th className="px-4 py-2 text-right">Entries</th>
                    <th className="px-4 py-2 text-right">Hours</th>
                    <th className="px-4 py-2 text-right">Billable h</th>
                    <th className="px-4 py-2 text-right">Value</th>
                    <th className="px-4 py-2 text-right">Billed</th>
                  </tr>
                </thead>
                <tbody>
                  {report!.byUser.map((r) => (
                    <tr key={r.user_id ?? 'none'} className="border-b border-border/30">
                      <td className="px-4 py-2">{r.name}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.entries}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium">{r.hours}h</td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{r.billable_hours}h</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatMoney(r.value)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{formatMoney(r.billed_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : (
            (report?.byContact.length ?? 0) === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No time logged in this period.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border/60">
                    <th className="px-4 py-2 text-left">Contact</th>
                    <th className="px-4 py-2 text-right">Entries</th>
                    <th className="px-4 py-2 text-right">Hours</th>
                    <th className="px-4 py-2 text-right">Value</th>
                    <th className="px-4 py-2 text-right">Billed</th>
                    <th className="px-4 py-2 text-right">Unbilled</th>
                  </tr>
                </thead>
                <tbody>
                  {report!.byContact.map((r) => (
                    <tr key={r.key} className="border-b border-border/30">
                      <td className="px-4 py-2">{r.name}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.entries}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium">{r.hours}h</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatMoney(r.value)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{formatMoney(r.billed_value)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-amber-500">{formatMoney(r.unbilled_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </CardContent>
      </Card>

      {/* Billed history */}
      {billed.length > 0 && (
        <Card>
          <CardHeader className="border-b border-border/60 px-5 py-3"><CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Billed</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/40">
              {paginate(billed, billedPage).map((e) => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <div className="w-20 text-xs text-muted-foreground">{e.work_date}</div>
                  <div className="min-w-0 flex-1 truncate text-muted-foreground">{e.description}</div>
                  <span className="text-[10px] capitalize text-muted-foreground">billed</span>
                  <div className="w-16 text-right text-xs">{hoursOf(e.minutes)}h</div>
                  <div className="w-20 text-right tabular-nums">{formatMoney(hoursOf(e.minutes) * Number(e.hourly_rate))}</div>
                </div>
              ))}
            </div>
            <TablePagination page={billedPage} total={billed.length} onPageChange={setBilledPage} label="entries" />
          </CardContent>
        </Card>
      )}
    </div>
  );
};
