import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import { Plus, Loader2, Wallet, ChevronLeft, CheckCircle2, Banknote, ArrowUpRight, Settings2, FileText } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Skeleton } from '@/components/core/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Switch } from '@/components/core/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { hrService, type PayrollRun, type PayrollItem, type PayrollStatus, type PayrollSummary, type PayrollSettings, type BracketReductions } from '../services/hrService';
import { SectionHeader, EmptyState, hrMoney } from './_shared';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { parseDecimal, parseDecimalOr } from '@/utils/decimal';
import { statusTone } from '@/utils/statusTone';

const statusVariant: Record<PayrollStatus, 'secondary' | 'default' | 'outline'> = { draft: 'secondary', approved: 'default', paid: 'outline' };
const money = (n: number | null | undefined, c: string) => hrMoney(n, c, { minDecimals: 0 });

/**
 * Locale-tolerant numeric field for number-backed state (EU decimals like `13,87` / `7.572,00`).
 * Keeps a free-text draft while focused so `parseDecimal` can normalise any format on blur without
 * cursor-jumping. `scale` handles percentage state (store 0.1387, show 13.87 with scale=100).
 */
function NumField({ value, onChange, scale = 1, decimals = 2, allowNull = false, ...rest }: {
  value: number | null | undefined; onChange: (n: number | null) => void;
  scale?: number; decimals?: number | null; allowNull?: boolean;
} & Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'>) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState('');
  const shown = value == null || Number.isNaN(value) ? null : (value as number) * scale;
  const display = focused ? draft : shown == null ? '' : decimals == null ? String(shown) : shown.toFixed(decimals);
  return (
    <Input
      {...rest} type="text" inputMode="decimal" value={display}
      onFocus={(e) => { setFocused(true); setDraft(shown == null ? '' : String(shown)); rest.onFocus?.(e); }}
      onChange={(e) => { setDraft(e.target.value); const p = parseDecimal(e.target.value); onChange(p == null ? (allowNull ? null : 0) : p / scale); }}
      onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }}
    />
  );
}

export function PayrollSection({ workspaceId, canManage }: { workspaceId: string | null; canManage: boolean }) {
  const { toast } = useToast();
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [openRun, setOpenRun] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!workspaceId) { setLoading(false); return; }
    setLoading(true);
    try { const { runs: next } = await hrService.listPayrollRuns(workspaceId); setRuns(next); setPage((p) => clampPage(p, next.length)); }
    catch (e) { toast({ title: 'Failed to load payroll', description: (e as Error).message, variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [workspaceId, toast]);
  useEffect(() => { void load(); }, [load]);

  if (loading) return <Skeleton className="h-64 w-full" />;
  if (!workspaceId) return null;
  if (openRun) return <PayrollRunDetail workspaceId={workspaceId} runId={openRun} canManage={canManage} onBack={() => { setOpenRun(null); load(); }} />;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Payroll"
        subtitle="Runs compute EFKA + income tax; posting fans out to Finance (net → employees, tax → AADE, EFKA → EFKA)"
        actions={canManage ? (
          <div className="flex items-center gap-2">
            <PayrollSettingsDialog workspaceId={workspaceId} />
            <NewRunDialog workspaceId={workspaceId} onDone={load} />
          </div>
        ) : undefined}
      />
      <Card>
        <CardContent className="p-0">
          {runs.length === 0 ? <EmptyState icon={Wallet} title="No payroll runs yet" hint={canManage ? 'Create a run — it pulls active employees, computes deductions, and fills gross from salary.' : undefined} /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Period</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Gross</TableHead><TableHead className="text-right">Net</TableHead><TableHead>Finance</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {paginate(runs, page).map((r) => (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setOpenRun(r.id)}>
                    <TableCell className="font-medium">{r.period}</TableCell>
                    <TableCell><span className={`text-sm capitalize ${statusTone(r.status)}`}>{r.status}</span></TableCell>
                    <TableCell className="text-right">{money(r.total_gross, r.currency)}</TableCell>
                    <TableCell className="text-right">{money(r.total_net, r.currency)}</TableCell>
                    <TableCell>{r.posted_finance_ref ? <span className="text-sm text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1"><ArrowUpRight className="h-3 w-3" />Posted</span> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right text-muted-foreground text-xs">Open →</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <TablePagination page={page} total={runs.length} onPageChange={setPage} label="runs" />
        </CardContent>
      </Card>
    </div>
  );
}

function PayrollRunDetail({ workspaceId, runId, canManage, onBack }: { workspaceId: string; runId: string; canManage: boolean; onBack: () => void }) {
  const { toast } = useToast();
  const [run, setRun] = useState<PayrollRun | null>(null);
  const [items, setItems] = useState<PayrollItem[]>([]);
  const [summary, setSummary] = useState<PayrollSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [itemPage, setItemPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await hrService.getPayrollRun(workspaceId, runId); setRun(r.run); setItems(r.items); setSummary(r.summary); setItemPage((p) => clampPage(p, r.items.length)); }
    catch (e) { toast({ title: 'Failed to load run', description: (e as Error).message, variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [workspaceId, runId, toast]);
  useEffect(() => { void load(); }, [load]);

  const saveGross = async (item: PayrollItem, gross: number) => {
    try { await hrService.updatePayrollItem(workspaceId, item.id, { gross }); load(); }
    catch (e) { toast({ title: 'Save failed', description: (e as Error).message, variant: 'destructive' }); }
  };
  const setStatus = async (status: PayrollStatus) => {
    setBusy(true);
    try { const r = await hrService.setPayrollStatus(workspaceId, runId, status); setRun(r.run); toast({ title: `Run ${status}` }); }
    catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  const postFinance = async () => {
    setBusy(true);
    try {
      const { posted } = await hrService.postPayrollToFinance(workspaceId, runId);
      toast({ title: 'Posted to Finance', description: `${posted.net_payment_ids.length} net payment(s)${posted.income_tax_payment_id ? ' + income tax' : ''}${posted.efka_payment_id ? ' + EFKA' : ''} scheduled.` });
      load();
    } catch (e) { toast({ title: 'Posting failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  const makePayslips = async () => {
    setBusy(true);
    try { const r = await hrService.generatePayslips(workspaceId, runId); toast({ title: 'Payslips generated', description: `${r.payslips} payslip(s) filed — employees can see them in My HR → Documents.` }); }
    catch (e) { toast({ title: 'Payslip generation failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  if (loading || !run) return <Skeleton className="h-64 w-full" />;
  const editable = run.status === 'draft' && canManage;
  const cur = run.currency;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}><ChevronLeft className="h-4 w-4 mr-1" />Payroll</Button>
          <div>
            <h2 className="text-base font-display font-semibold">Payroll {run.period}</h2>
            <p className="text-xs text-muted-foreground">Gross {money(run.total_gross, cur)} · Net {money(run.total_net, cur)}{items[0]?.days_worked != null ? ` · ${items[0].days_worked} working days` : ''}</p>
          </div>
          <Badge variant={statusVariant[run.status]}>{run.status}</Badge>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            {run.status === 'draft' && <Button size="sm" className="rounded-full" disabled={busy} onClick={() => setStatus('approved')}><CheckCircle2 className="h-4 w-4 mr-1" />Approve</Button>}
            {run.status === 'approved' && <Button size="sm" className="rounded-full" disabled={busy} onClick={() => setStatus('paid')}><Banknote className="h-4 w-4 mr-1" />Mark paid</Button>}
            {run.status !== 'draft' && !run.posted_finance_ref && <Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={postFinance}><ArrowUpRight className="h-4 w-4 mr-1" />Post to finance</Button>}
            {run.posted_finance_ref && <Badge variant="outline" className="gap-1"><ArrowUpRight className="h-3 w-3" />In Finance</Badge>}
            {run.status !== 'draft' && <Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={makePayslips}><FileText className="h-4 w-4 mr-1" />Payslips</Button>}
          </div>
        )}
      </div>

      {/* Summary — the distinct money streams */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <SummaryTile label="Total gross" value={money(summary.total_gross, cur)} />
          <SummaryTile label="Net → employees" value={money(summary.total_net, cur)} strong />
          <SummaryTile label="Income tax → AADE" value={money(summary.total_income_tax, cur)} />
          <SummaryTile label="Employee EFKA (withheld)" value={money(summary.total_employee_contributions, cur)} />
          <SummaryTile label="Employer EFKA → EFKA" value={money(summary.total_employer_contributions, cur)} strong />
          <SummaryTile label="Total employer cost" value={money(summary.total_employer_cost, cur)} />
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? <EmptyState title="No active employees to pay" /> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Empl. EFKA</TableHead>
                <TableHead className="text-right">Income tax</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead className="text-right">Employer EFKA</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {paginate(items, itemPage).map((it) => <PayrollItemRow key={it.id} item={it} editable={editable} currency={cur} onSaveGross={saveGross} />)}
              </TableBody>
            </Table>
          )}
          <TablePagination page={itemPage} total={items.length} onPageChange={setItemPage} label="employees" />
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Edit an employee's <strong>gross</strong> and the deductions recompute from your payroll settings. Manual override is available when auto-rules are off.
        Income tax + EFKA are withheld from gross; employer EFKA is the company's own cost on top.
      </p>
    </div>
  );
}

function SummaryTile({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="dashboard-card rounded-2xl border-0 shadow-sm p-4">
      <div className="text-[11px] text-muted-foreground leading-tight">{label}</div>
      <div className={`mt-1 text-sm tabular-nums ${strong ? 'font-semibold' : ''}`}>{value}</div>
    </div>
  );
}

function PayrollItemRow({ item, editable, currency, onSaveGross }: { item: PayrollItem; editable: boolean; currency: string; onSaveGross: (i: PayrollItem, gross: number) => void }) {
  const [gross, setGross] = useState(String(item.gross));
  const commit = () => { const g = parseDecimal(gross); if (g !== null && g !== item.gross) onSaveGross(item, g); };
  const basisLabel = item.basis === 'hourly'
    ? `${money(item.rate ?? 0, currency)}/h × ${item.hours_per_day ?? 8}h × ${item.days_worked ?? 0}d`
    : 'Monthly';
  return (
    <TableRow>
      <TableCell className="font-medium">
        {item.employee?.contact?.name || 'Employee'}
        <span className="block text-xs text-muted-foreground">{basisLabel}</span>
      </TableCell>
      <TableCell className="text-right">{editable ? <Input type="text" inputMode="decimal" value={gross} onChange={(e) => setGross(e.target.value)} onBlur={commit} className="h-8 w-28 ml-auto text-right" /> : money(item.gross, currency)}</TableCell>
      <TableCell className="text-right text-muted-foreground">{money(item.employee_contributions, currency)}</TableCell>
      <TableCell className="text-right text-muted-foreground">{money(item.income_tax, currency)}</TableCell>
      <TableCell className="text-right font-medium">{money(item.net, currency)}</TableCell>
      <TableCell className="text-right text-muted-foreground">{money(item.employer_contributions, currency)}</TableCell>
    </TableRow>
  );
}

function NewRunDialog({ workspaceId, onDone }: { workspaceId: string; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [period, setPeriod] = useState('');

  const submit = async () => {
    if (!/^\d{4}-\d{2}$/.test(period)) { toast({ title: 'Pick a month', variant: 'destructive' }); return; }
    setSaving(true);
    try { const r = await hrService.createPayrollRun(workspaceId, { period }); toast({ title: 'Payroll run created', description: `${r.items} employee item(s), deductions computed.` }); setOpen(false); setPeriod(''); onDone(); }
    catch (e) { toast({ title: 'Could not create', description: (e as Error).message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" className="rounded-full"><Plus className="h-4 w-4 mr-2" />New run</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New Payroll Run</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Month *</Label><Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} /></div>
          <p className="text-xs text-muted-foreground">Pulls all active employees, fills gross from their salary, and computes EFKA + income tax from your payroll settings. Adjust each line before approving.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button className="rounded-full" onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PayrollSettingsDialog({ workspaceId }: { workspaceId: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [s, setS] = useState<PayrollSettings | null>(null);
  const [gr2026Preset, setGr2026Preset] = useState<BracketReductions | null>(null);
  const upd = (k: keyof PayrollSettings, v: unknown) => setS((p) => (p ? { ...p, [k]: v } : p));

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await hrService.getPayrollSettings(workspaceId);
      setS(res.settings);
      setGr2026Preset(res.presets?.greek_2026_bracket_reductions ?? null);
    }
    catch (e) { toast({ title: 'Failed to load settings', description: (e as Error).message, variant: 'destructive' }); }
    finally { setLoading(false); }
  };

  // Young-worker / family band reductions are ON when any age/child band is configured.
  const reliefsOn = !!(s?.bracket_reductions && (
    (s.bracket_reductions.age_bands?.length ?? 0) > 0 || (s.bracket_reductions.child_bands?.length ?? 0) > 0
  ));

  const save = async () => {
    if (!s) return;
    setSaving(true);
    try {
      await hrService.updatePayrollSettings(workspaceId, {
        country_code: s.country_code, currency: s.currency, salaries_per_year: Number(s.salaries_per_year),
        employee_contribution_rate: parseDecimalOr(s.employee_contribution_rate, 0), employer_contribution_rate: parseDecimalOr(s.employer_contribution_rate, 0),
        contribution_monthly_ceiling: s.contribution_monthly_ceiling == null || String(s.contribution_monthly_ceiling) === '' ? null : parseDecimalOr(s.contribution_monthly_ceiling, 0),
        income_tax_brackets: s.income_tax_brackets, tax_credit_base: parseDecimalOr(s.tax_credit_base, 0),
        tax_credit_per_child: s.tax_credit_per_child, tax_credit_taper_per_1000: parseDecimalOr(s.tax_credit_taper_per_1000, 0), tax_credit_taper_floor: parseDecimalOr(s.tax_credit_taper_floor, 0),
        bracket_reductions: s.bracket_reductions ?? {},
      });
      toast({ title: 'Payroll settings saved' }); setOpen(false);
    } catch (e) { toast({ title: 'Save failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };


  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) loadSettings(); }}>
      <DialogTrigger asChild><Button size="sm" variant="outline" className="rounded-full"><Settings2 className="h-4 w-4 mr-2" />Settings</Button></DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Payroll Settings</DialogTitle></DialogHeader>
        {loading || !s ? <Skeleton className="h-40 w-full" /> : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Defaults are the Greek 2026 rates. These change yearly — adjust as needed. Set country to “None” to disable auto-tax and enter deductions manually.</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Country / Mode</Label>
                <Select value={s.country_code} onValueChange={(v) => upd('country_code', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="GR">Greece (auto)</SelectItem><SelectItem value="none">None (manual)</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Salaries / year</Label><Input type="number" value={s.salaries_per_year} onChange={(e) => upd('salaries_per_year', Number(e.target.value))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Employee EFKA %</Label><NumField scale={100} value={s.employee_contribution_rate} onChange={(n) => upd('employee_contribution_rate', n ?? 0)} /></div>
              <div className="space-y-1"><Label>Employer EFKA %</Label><NumField scale={100} value={s.employer_contribution_rate} onChange={(n) => upd('employer_contribution_rate', n ?? 0)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>EFKA monthly ceiling</Label><NumField allowNull value={s.contribution_monthly_ceiling} onChange={(n) => upd('contribution_monthly_ceiling', n)} placeholder="none" /></div>
              <div className="space-y-1"><Label>Currency</Label><Input value={s.currency} onChange={(e) => upd('currency', e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1"><Label>Tax credit (base)</Label><NumField value={s.tax_credit_base} onChange={(n) => upd('tax_credit_base', n ?? 0)} /></div>
              <div className="space-y-1"><Label>Taper /€1,000</Label><NumField value={s.tax_credit_taper_per_1000} onChange={(n) => upd('tax_credit_taper_per_1000', n ?? 0)} /></div>
              <div className="space-y-1"><Label>Taper floor</Label><NumField value={s.tax_credit_taper_floor} onChange={(n) => upd('tax_credit_taper_floor', n ?? 0)} /></div>
            </div>
            <div className="space-y-1">
              <Label>Income-tax brackets (annual) — JSON</Label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono min-h-[90px]"
                value={JSON.stringify(s.income_tax_brackets)}
                onChange={(e) => { try { upd('income_tax_brackets', JSON.parse(e.target.value)); } catch { /* keep typing */ } }}
              />
              <p className="text-[11px] text-muted-foreground">Array of {'{up_to, rate}'}; last entry uses <code>up_to: null</code> for the top band. Rates are fractions (0.09 = 9%).</p>
            </div>
            {s.country_code !== 'none' && (
              <div className="space-y-2 rounded-md border border-input p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label className="text-sm">Young-worker &amp; family tax reliefs</Label>
                    <p className="text-[11px] text-muted-foreground">GR 2026 reform: under-25 → 0% up to €20k · 26–30 → 9% on the 10–20k band · reduced band by children. Age is read from each employee’s date of birth.</p>
                  </div>
                  <Switch
                    checked={reliefsOn}
                    disabled={!gr2026Preset}
                    onCheckedChange={(on) => upd('bracket_reductions', on ? (gr2026Preset ?? {}) : {})}
                  />
                </div>
                {reliefsOn && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-500">⚠ Verify these rates against the enacted 2026 law before running production payroll — edit the JSON below to adjust.</p>
                )}
                {reliefsOn && (
                  <textarea
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono min-h-[90px]"
                    value={JSON.stringify(s.bracket_reductions ?? {}, null, 0)}
                    onChange={(e) => { try { upd('bracket_reductions', JSON.parse(e.target.value)); } catch { /* keep typing */ } }}
                  />
                )}
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button className="rounded-full" onClick={save} disabled={saving || !s}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save settings</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
