/**
 * Shared workspace credits — owner/admin surface. Fund one pool the whole team draws from,
 * and cap each member's monthly spend. Members' AI operations (agent chat, generation, …)
 * debit this pool when it's funded; otherwise each user falls back to their personal wallet.
 */
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Badge } from '@/components/core/ui/badge';
import { Coins, Loader2, ShoppingCart, Check, Infinity as InfinityIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { StripeService, calculateCreditsForAmount } from '@/services/stripe.service';
import {
  workspaceCreditsService,
  type WorkspaceCreditStatus,
  type WorkspaceMemberCredit,
} from '@/services/workspaceCreditsService';

const stripeService = new StripeService();
const FUND_PRESETS = [25, 50, 100, 250];

export const WorkspaceCreditsCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [status, setStatus] = useState<WorkspaceCreditStatus | null>(null);
  const [members, setMembers] = useState<WorkspaceMemberCredit[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState(50);
  const [funding, setFunding] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draftLimits, setDraftLimits] = useState<Record<string, string>>({});

  const quote = calculateCreditsForAmount(amount);

  const load = async () => {
    setLoading(true);
    try {
      const [s, m] = await Promise.all([
        workspaceCreditsService.getStatus(workspaceId),
        workspaceCreditsService.getMemberUsage(workspaceId),
      ]);
      setStatus(s);
      setMembers(m);
      setDraftLimits(Object.fromEntries(m.map((x) => [x.user_id, x.monthly_limit != null ? String(x.monthly_limit) : ''])));
    } catch (err: any) {
      toast({ title: 'Failed to load workspace credits', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [workspaceId]);

  const fund = async () => {
    setFunding(true);
    try {
      const { url } = await stripeService.createCreditCheckoutSession(quote.credits, amount, workspaceId);
      if (url) window.location.href = url;
    } catch (err: any) {
      toast({ title: 'Checkout failed', description: err?.message, variant: 'destructive' });
    } finally {
      setFunding(false);
    }
  };

  const saveLimit = async (userId: string) => {
    setSavingId(userId);
    try {
      const raw = (draftLimits[userId] ?? '').trim();
      const limit = raw === '' ? null : Math.max(0, Number(raw));
      if (raw !== '' && Number.isNaN(limit as number)) throw new Error('Enter a number, or leave blank for unlimited');
      await workspaceCreditsService.setMemberLimit(workspaceId, userId, limit);
      toast({ title: 'Limit updated' });
      await load();
    } catch (err: any) {
      toast({ title: 'Failed to update limit', description: err?.message, variant: 'destructive' });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="text-sm flex items-center gap-2"><Coins className="h-4 w-4" /> Workspace Credit Pool</CardTitle>
        <CardDescription className="text-xs">
          Fund one shared balance the whole team spends from. Members draw from the pool when it has credits; otherwise they use their own personal balance.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 p-5">
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {/* Pool balance + fund */}
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-xs text-muted-foreground">Pool balance</div>
                <div className="text-3xl font-bold text-primary">
                  {(status?.pool_balance ?? 0).toFixed(2)}
                  <span className="ml-1 text-base font-normal text-muted-foreground">credits</span>
                </div>
                {!status?.has_pool && (
                  <p className="mt-1 text-xs text-muted-foreground">Not funded yet — the team is on personal credits until you add some.</p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                {FUND_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setAmount(p)}
                    className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                      amount === p ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'
                    }`}
                  >€{p}</button>
                ))}
                <Input
                  type="number"
                  min={1}
                  value={amount}
                  onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 0))}
                  className="h-8 w-24 text-sm"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  You get <span className="font-semibold text-foreground">{quote.credits.toLocaleString()}</span> credits
                  {quote.discount > 0 && <Badge variant="secondary" className="ml-2 text-[10px]">{quote.discount}% off</Badge>}
                </span>
                <Button size="sm" className="rounded-full" onClick={fund} disabled={funding}>
                  {funding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShoppingCart className="h-4 w-4 mr-2" />}
                  Fund pool
                </Button>
              </div>
            </div>

            {/* Per-member monthly caps + usage */}
            <div>
              <div className="mb-2 text-xs font-medium text-muted-foreground">Monthly limit per member (blank = unlimited)</div>
              <div className="divide-y divide-border/40 rounded-lg border border-border/60">
                {members.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-muted-foreground">No members yet.</div>
                ) : members.map((m) => (
                  <div key={m.user_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{m.name || m.email || m.user_id.slice(0, 8)}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px] capitalize">{m.role}</Badge>
                        <span>spent {m.spent_this_month.toFixed(2)} this month</span>
                        {m.monthly_limit != null
                          ? <span>· {Math.max(0, m.monthly_limit - m.spent_this_month).toFixed(2)} left</span>
                          : <span className="flex items-center gap-0.5"><InfinityIcon className="h-3 w-3" /> unlimited</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        placeholder="∞"
                        value={draftLimits[m.user_id] ?? ''}
                        onChange={(e) => setDraftLimits((d) => ({ ...d, [m.user_id]: e.target.value }))}
                        className="h-8 w-24 text-sm"
                      />
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8"
                        onClick={() => saveLimit(m.user_id)}
                        disabled={savingId === m.user_id}
                      >
                        {savingId === m.user_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
