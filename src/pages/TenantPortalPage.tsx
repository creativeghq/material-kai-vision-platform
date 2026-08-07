// Tenant portal: a tenancy's own rent view plus a way to report a fault. The tenant opens
// /tenant/:token — no account, because a person who needs three screens should not need a password.
// The token is the capability; rotating or revoking it from the Lettings tab kills the link.
import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { formatMoney } from '@/utils/decimal';
import { Home, Loader2, Wrench, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { realEstatePublic, type TenantPortal } from '@/modules/real-estate/services/realEstateService';
import { statusTone } from '@/utils/statusTone';

const money = (n: number | null | undefined, ccy: string) => formatMoney(n ?? 0, ccy || 'EUR', { decimals: 2 });

export default function TenantPortalPage() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [data, setData] = useState<TenantPortal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', description: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try { setData(await realEstatePublic.tenantPortal(token)); }
    catch (e) { setError((e as Error).message || 'This link is no longer active.'); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  const raise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !form.title.trim()) return;
    setSending(true);
    try {
      await realEstatePublic.tenantRaiseIssue(token, form.title.trim(), form.description.trim() || undefined);
      setSent(true); setForm({ title: '', description: '' }); await load();
      toast({ title: 'Reported', description: 'Your agent has been notified.' });
    } catch (e2) { toast({ title: 'Could not send', description: (e2 as Error).message, variant: 'destructive' }); }
    finally { setSending(false); }
  };

  if (error) return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="dashboard-card max-w-sm p-8 text-center"><Home className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><div className="text-sm text-muted-foreground">{error}</div></div>
    </div>
  );
  if (!data) return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const ccy = data.tenancy.currency || 'EUR';
  const where = [data.property?.address, data.property?.town].filter(Boolean).join(', ');

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-display font-semibold">{data.property?.title || 'Your tenancy'}</h1>
        {where && <p className="mt-0.5 text-sm text-muted-foreground">{where}</p>}

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-xl border bg-card px-3 py-2.5">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Rent</div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums">{money(data.tenancy.rent_amount, ccy)}</div>
            <div className="text-[11px] capitalize text-muted-foreground">{data.tenancy.rent_frequency}</div>
          </div>
          <div className="rounded-xl border bg-card px-3 py-2.5">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Outstanding</div>
            <div className={`mt-0.5 text-lg font-semibold tabular-nums ${data.outstanding > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {money(data.outstanding, ccy)}
            </div>
          </div>
          <div className="rounded-xl border bg-card px-3 py-2.5">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Deposit</div>
            <div className="mt-0.5 text-lg font-semibold tabular-nums">{money(data.tenancy.deposit, ccy)}</div>
          </div>
          <div className="rounded-xl border bg-card px-3 py-2.5">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Term ends</div>
            <div className="mt-0.5 text-lg font-semibold">{data.tenancy.end_date ? new Date(data.tenancy.end_date).toLocaleDateString() : '—'}</div>
          </div>
        </div>

        <h2 className="mt-8 text-sm font-semibold">Rent</h2>
        <div className="mt-2 divide-y divide-border rounded-xl border">
          {data.charges.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">No rent charges yet.</div>}
          {data.charges.map((c) => (
            <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="w-24 shrink-0 text-muted-foreground">{new Date(c.due_date).toLocaleDateString()}</span>
              <span className="font-medium tabular-nums">{money(c.amount, c.currency)}</span>
              {/* The DERIVED status — the same number the agent sees. A tenant told they still owe
                  rent they have already paid is the worst thing this page could do. */}
              <span className={`ml-auto text-xs capitalize ${statusTone(c.payment_status)}`}>{c.payment_status}</span>
            </div>
          ))}
        </div>

        <h2 className="mt-8 text-sm font-semibold">Repairs</h2>
        <div className="mt-2 divide-y divide-border rounded-xl border">
          {data.maintenance.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Nothing reported.</div>}
          {data.maintenance.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <Wrench className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span>{m.title}</span>
              <span className="ml-auto text-xs text-muted-foreground">{new Date(m.reported_at).toLocaleDateString()}</span>
              <span className={`text-xs capitalize ${statusTone(m.status)}`}>{m.status.replace('_', ' ')}</span>
            </div>
          ))}
        </div>

        <form onSubmit={raise} className="mt-4 space-y-3 rounded-xl border p-4">
          <h3 className="text-sm font-semibold">Report something</h3>
          {sent && <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Sent — you can report something else below.</p>}
          <Input required placeholder="What's wrong? (e.g. boiler not heating)" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Textarea rows={3} placeholder="Any detail that would help (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Button type="submit" className="w-full rounded-full" disabled={sending || !form.title.trim()}>
            {sending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Report to my agent
          </Button>
          <p className="text-[11px] text-muted-foreground">Urgent safety issues — gas, electricity, flooding — should be phoned in, not reported here.</p>
        </form>
      </div>
    </div>
  );
}
