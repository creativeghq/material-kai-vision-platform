import React, { useEffect, useState } from 'react';
import { CalendarClock, Loader2, Plus, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { formatMoney } from '@/modules/finance/services/financeService';

interface Planned {
  id: string; title: string; amount: number; currency: string; direction: 'in' | 'out';
  scheduled_for: string; status: string;
}

/**
 * #8 — per-customer expected payments. Lists upcoming/overdue planned payments for a
 * company by due day, lets you add one, and "tick when paid" (records the actual payment
 * + links it via paid_payment_id). Mounted on the company Account tab.
 */
export const PlannedPaymentsCard: React.FC<{ workspaceId: string; companyId: string; isSupplier?: boolean }> = ({ workspaceId, companyId, isSupplier }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<Planned[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [due, setDue] = useState(() => new Date().toISOString().slice(0, 10));

  // Customer → we expect money IN; supplier → we plan money OUT.
  const dir: 'in' | 'out' = isSupplier ? 'out' : 'in';

  const load = async () => {
    try {
      setLoading(true);
      const { data } = await supabase.from('planned_payments')
        .select('id, title, amount, currency, direction, scheduled_for, status')
        .eq('workspace_id', workspaceId).eq('counterparty_company_id', companyId)
        .in('status', ['planned', 'overdue']).order('scheduled_for', { ascending: true });
      setRows((data ?? []) as Planned[]);
    } catch (err: any) {
      toast({ title: 'Failed to load expected payments', description: err?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [workspaceId, companyId]);

  const add = async () => {
    const amt = parseFloat(amount);
    if (!title.trim() || !Number.isFinite(amt) || amt <= 0) { toast({ title: 'Enter a title and amount', variant: 'destructive' }); return; }
    setBusy('add');
    try {
      const { error } = await supabase.from('planned_payments').insert({
        workspace_id: workspaceId, direction: dir, title: title.trim(), amount: amt, currency: 'EUR',
        scheduled_for: due, category: isSupplier ? 'supplier_bill' : 'expected_receipt',
        counterparty_company_id: companyId,
      });
      if (error) throw error;
      setAddOpen(false); setTitle(''); setAmount('');
      await load();
      toast({ title: 'Expected payment added' });
    } catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  const markPaid = async (p: Planned) => {
    setBusy(p.id);
    try {
      // Record the actual payment, then tick the plan + link it.
      const { data: pay, error: payErr } = await supabase.from('payments').insert({
        workspace_id: workspaceId, direction: p.direction, amount: p.amount, currency: p.currency,
        counterparty_company_id: companyId, paid_at: new Date().toISOString(),
      }).select('id').single();
      if (payErr) throw payErr;
      const { error } = await supabase.from('planned_payments').update({ status: 'paid', paid_payment_id: pay.id }).eq('id', p.id);
      if (error) throw error;
      await load();
      toast({ title: 'Marked paid' });
    } catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  const overdue = (d: string) => new Date(d) < new Date(new Date().toISOString().slice(0, 10));

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 py-3">
        <CardTitle className="text-base flex items-center gap-2"><CalendarClock className="h-4 w-4" /> Expected payments</CardTitle>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAddOpen((v) => !v)}><Plus className="h-3.5 w-3.5 mr-1" /> Add expected</Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {addOpen && (
          <div className="flex flex-wrap items-end gap-2 rounded-md border border-border/60 bg-muted/20 p-2">
            <Input className="h-8 text-sm flex-1 min-w-[140px]" placeholder="e.g. Deposit, 2nd instalment" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input className="h-8 w-28 text-right text-sm" type="number" step="0.01" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Input className="h-8 w-40 text-sm" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            <Button size="sm" onClick={add} disabled={busy === 'add'}>{busy === 'add' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}</Button>
          </div>
        )}
        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted-foreground">No expected payments scheduled.</p>
        ) : (
          <div className="divide-y divide-border/40">
            {rows.map((p) => (
              <div key={p.id} className="flex items-center gap-2 py-2 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="truncate">{p.title}</div>
                  <div className={`text-[11px] ${overdue(p.scheduled_for) ? 'text-destructive' : 'text-muted-foreground'}`}>
                    due {new Date(p.scheduled_for).toLocaleDateString()}{overdue(p.scheduled_for) ? ' · overdue' : ''} · {p.direction === 'in' ? 'incoming' : 'outgoing'}
                  </div>
                </div>
                <span className="tabular-nums">{formatMoney(Number(p.amount), p.currency)}</span>
                <Button size="sm" variant="outline" className="h-7" onClick={() => markPaid(p)} disabled={busy === p.id} title="Mark paid">
                  {busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
