import { useCallback, useEffect, useState } from 'react';
import { Plus, Loader2, Wallet, ChevronLeft, CheckCircle2, Banknote, ArrowUpRight } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Skeleton } from '@/components/core/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { hrService, type PayrollRun, type PayrollItem, type PayrollStatus } from '../services/hrService';
import { SectionHeader, EmptyState } from './_shared';

const statusVariant: Record<PayrollStatus, 'secondary' | 'default' | 'outline'> = { draft: 'secondary', approved: 'default', paid: 'outline' };
const money = (n: number, c: string) => `${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${c}`;

export function PayrollSection({ workspaceId, canManage }: { workspaceId: string | null; canManage: boolean }) {
  const { toast } = useToast();
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [openRun, setOpenRun] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) { setLoading(false); return; }
    setLoading(true);
    try { setRuns((await hrService.listPayrollRuns(workspaceId)).runs); }
    catch (e) { toast({ title: 'Failed to load payroll', description: (e as Error).message, variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [workspaceId, toast]);
  useEffect(() => { void load(); }, [load]);

  if (loading) return <Skeleton className="h-64 w-full" />;
  if (!workspaceId) return null;
  if (openRun) return <PayrollRunDetail workspaceId={workspaceId} runId={openRun} canManage={canManage} onBack={() => { setOpenRun(null); load(); }} />;

  return (
    <div className="space-y-4">
      <SectionHeader title="Payroll" subtitle="Monthly runs, posted to Finance as planned payments" actions={canManage ? <NewRunDialog workspaceId={workspaceId} onDone={load} /> : undefined} />
      <Card>
        <CardContent className="p-0">
          {runs.length === 0 ? <EmptyState icon={Wallet} title="No payroll runs yet" hint={canManage ? 'Create a run — it pulls active employees + their monthly salary.' : undefined} /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Period</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Gross</TableHead><TableHead className="text-right">Net</TableHead><TableHead>Finance</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setOpenRun(r.id)}>
                    <TableCell className="font-medium">{r.period}</TableCell>
                    <TableCell><Badge variant={statusVariant[r.status]}>{r.status}</Badge></TableCell>
                    <TableCell className="text-right">{money(r.total_gross, r.currency)}</TableCell>
                    <TableCell className="text-right">{money(r.total_net, r.currency)}</TableCell>
                    <TableCell>{r.posted_finance_ref ? <Badge variant="outline" className="gap-1"><ArrowUpRight className="h-3 w-3" />Posted</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right text-muted-foreground text-xs">Open →</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PayrollRunDetail({ workspaceId, runId, canManage, onBack }: { workspaceId: string; runId: string; canManage: boolean; onBack: () => void }) {
  const { toast } = useToast();
  const [run, setRun] = useState<PayrollRun | null>(null);
  const [items, setItems] = useState<PayrollItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await hrService.getPayrollRun(workspaceId, runId); setRun(r.run); setItems(r.items); }
    catch (e) { toast({ title: 'Failed to load run', description: (e as Error).message, variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [workspaceId, runId, toast]);
  useEffect(() => { void load(); }, [load]);

  const saveItem = async (item: PayrollItem, gross: number, deductions: number) => {
    try { const r = await hrService.updatePayrollItem(workspaceId, item.id, { gross, deductions }); if (run) setRun({ ...run, total_gross: r.total_gross, total_net: r.total_net }); load(); }
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
    try { await hrService.postPayrollToFinance(workspaceId, runId); toast({ title: 'Posted to Finance', description: 'A planned payment was created.' }); load(); }
    catch (e) { toast({ title: 'Posting failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  if (loading || !run) return <Skeleton className="h-64 w-full" />;
  const editable = run.status === 'draft' && canManage;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}><ChevronLeft className="h-4 w-4 mr-1" />Payroll</Button>
          <div>
            <h2 className="text-base font-display font-semibold">Payroll {run.period}</h2>
            <p className="text-xs text-muted-foreground">Gross {money(run.total_gross, run.currency)} · Net {money(run.total_net, run.currency)}{items[0]?.days_worked != null ? ` · ${items[0].days_worked} working days` : ''}</p>
          </div>
          <Badge variant={statusVariant[run.status]}>{run.status}</Badge>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            {run.status === 'draft' && <Button size="sm" className="rounded-full" disabled={busy} onClick={() => setStatus('approved')}><CheckCircle2 className="h-4 w-4 mr-1" />Approve</Button>}
            {run.status === 'approved' && <Button size="sm" className="rounded-full" disabled={busy} onClick={() => setStatus('paid')}><Banknote className="h-4 w-4 mr-1" />Mark paid</Button>}
            {run.status !== 'draft' && !run.posted_finance_ref && <Button size="sm" variant="outline" className="rounded-full" disabled={busy} onClick={postFinance}><ArrowUpRight className="h-4 w-4 mr-1" />Post to Finance</Button>}
            {run.posted_finance_ref && <Badge variant="outline" className="gap-1"><ArrowUpRight className="h-3 w-3" />In Finance</Badge>}
          </div>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? <EmptyState title="No active employees to pay" /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Basis</TableHead><TableHead className="text-right">Gross</TableHead><TableHead className="text-right">Deductions</TableHead><TableHead className="text-right">Net</TableHead></TableRow></TableHeader>
              <TableBody>
                {items.map((it) => <PayrollItemRow key={it.id} item={it} editable={editable} currency={run.currency} onSave={saveItem} />)}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PayrollItemRow({ item, editable, currency, onSave }: { item: PayrollItem; editable: boolean; currency: string; onSave: (i: PayrollItem, gross: number, deductions: number) => void }) {
  const [gross, setGross] = useState(String(item.gross));
  const [ded, setDed] = useState(String(item.deductions));
  const net = Math.max(0, (Number(gross) || 0) - (Number(ded) || 0));
  const commit = () => { if (Number(gross) !== item.gross || Number(ded) !== item.deductions) onSave(item, Number(gross) || 0, Number(ded) || 0); };
  const basisLabel = item.basis === 'hourly'
    ? `${money(item.rate ?? 0, currency)}/h × ${item.hours_per_day ?? 8}h × ${item.days_worked ?? 0}d`
    : 'Monthly';
  return (
    <TableRow>
      <TableCell className="font-medium">{item.employee?.contact?.name || 'Employee'}</TableCell>
      <TableCell className="text-xs text-muted-foreground">{basisLabel}</TableCell>
      <TableCell className="text-right">{editable ? <Input type="number" min={0} value={gross} onChange={(e) => setGross(e.target.value)} onBlur={commit} className="h-8 w-28 ml-auto text-right" /> : money(item.gross, currency)}</TableCell>
      <TableCell className="text-right">{editable ? <Input type="number" min={0} value={ded} onChange={(e) => setDed(e.target.value)} onBlur={commit} className="h-8 w-28 ml-auto text-right" /> : money(item.deductions, currency)}</TableCell>
      <TableCell className="text-right font-medium">{money(editable ? net : item.net, currency)}</TableCell>
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
    try { const r = await hrService.createPayrollRun(workspaceId, { period }); toast({ title: 'Payroll run created', description: `${r.items} employee item(s) added.` }); setOpen(false); setPeriod(''); onDone(); }
    catch (e) { toast({ title: 'Could not create', description: (e as Error).message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" className="rounded-full"><Plus className="h-4 w-4 mr-2" />New run</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New payroll run</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Month *</Label><Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} /></div>
          <p className="text-xs text-muted-foreground">Pulls all active employees and pre-fills gross from their monthly salary. You can adjust each line before approving.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button className="rounded-full" onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
