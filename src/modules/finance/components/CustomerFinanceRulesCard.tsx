/**
 * Per-customer finance rule overrides + Responsible Sales Team, shown on the CRM
 * company/contact Account tab. The numbers override the workspace defaults set in
 * Finance → Settings (blank = inherit the default). Enforcement happens at invoice
 * issuance (buyerRiskBlocks); this card only configures the values + who owns the account.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, ShieldCheck, Users, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { financeService, formatMoney } from '@/modules/finance/services/financeService';

type Target = { companyId?: string; contactId?: string };

// Roles whose members can be a customer's responsible sales owner.
const SALES_ROLES = ['sales', 'admin', 'owner', 'super_admin', 'finance'];

interface SalesUser { user_id: string; name: string }

export const CustomerFinanceRulesCard: React.FC<Target> = ({ companyId, contactId }) => {
  const { toast } = useToast();
  const { activeWorkspaceId } = useWorkspace();
  const table = companyId ? 'crm_companies' : 'crm_contacts';
  const rowId = companyId ?? contactId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creditLimit, setCreditLimit] = useState<string>('');
  const [minOrder, setMinOrder] = useState<string>('');
  const [terms, setTerms] = useState<string>('');
  const [team, setTeam] = useState<string[]>([]);
  const [salesUsers, setSalesUsers] = useState<SalesUser[]>([]);
  const [defaults, setDefaults] = useState<{ credit_limit: number | null; min_order_value: number | null; payment_terms_days: number | null } | null>(null);

  const load = useCallback(async () => {
    if (!rowId || !activeWorkspaceId) return;
    try {
      setLoading(true);
      const [{ data: row }, defs] = await Promise.all([
        (supabase as any).from(table).select('credit_limit, min_order_value, payment_terms_days, responsible_sales_user_ids').eq('id', rowId).maybeSingle(),
        financeService.getBuyerFinanceLimits({ workspaceId: activeWorkspaceId }).catch(() => null),
      ]);
      setCreditLimit(row?.credit_limit != null ? String(row.credit_limit) : '');
      setMinOrder(row?.min_order_value != null ? String(row.min_order_value) : '');
      setTerms(row?.payment_terms_days != null ? String(row.payment_terms_days) : '');
      setTeam(Array.isArray(row?.responsible_sales_user_ids) ? row.responsible_sales_user_ids : []);
      if (defs) setDefaults({ credit_limit: defs.credit_limit, min_order_value: defs.min_order_value, payment_terms_days: defs.payment_terms_days });

      // Sales-eligible members of the workspace → names from user_profiles.
      const { data: members } = await (supabase as any)
        .from('workspace_members').select('user_id, role').eq('workspace_id', activeWorkspaceId).in('role', SALES_ROLES);
      const ids = (members ?? []).map((m: any) => m.user_id);
      if (ids.length) {
        const { data: profs } = await (supabase as any).from('user_profiles').select('user_id, full_name, email').in('user_id', ids);
        const byId = new Map((profs ?? []).map((p: any) => [p.user_id, p.full_name || p.email || p.user_id.slice(0, 8)]));
        setSalesUsers(ids.map((id: string) => ({ user_id: id, name: byId.get(id) ?? id.slice(0, 8) })));
      } else {
        setSalesUsers([]);
      }
    } catch (err: any) {
      toast({ title: 'Failed to load rules', description: err?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, [rowId, table, activeWorkspaceId, toast]);
  useEffect(() => { void load(); }, [load]);

  const toggleMember = (id: string) => setTeam((t) => t.includes(id) ? t.filter((x) => x !== id) : [...t, id]);

  const save = async () => {
    if (!rowId) return;
    setSaving(true);
    try {
      const num = (s: string) => s.trim() === '' ? null : Number(s);
      const { error } = await (supabase as any).from(table).update({
        credit_limit: num(creditLimit),
        min_order_value: num(minOrder),
        payment_terms_days: terms.trim() === '' ? null : parseInt(terms, 10),
        responsible_sales_user_ids: team,
      }).eq('id', rowId);
      if (error) throw error;
      toast({ title: 'Saved' });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const hint = (v: number | null | undefined, money = true) =>
    v == null ? 'no default' : money ? formatMoney(v) : `${v} days`;

  const selectedNames = useMemo(
    () => team.map((id) => salesUsers.find((u) => u.user_id === id)?.name ?? id.slice(0, 8)),
    [team, salesUsers],
  );

  if (loading) return <Card><CardContent className="p-6 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></CardContent></Card>;

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Payment Rules</CardTitle>
        <Button size="sm" onClick={save} disabled={saving}>{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}</Button>
      </CardHeader>
      <CardContent className="p-5 space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="space-y-1">
            <span className="block text-[11px] text-muted-foreground">Credit / balance hold (€)</span>
            <input type="number" step="0.01" min="0" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)}
              placeholder={`Default: ${hint(defaults?.credit_limit)}`} className="h-8 w-full rounded border border-border/60 bg-background px-2 text-right text-sm" />
          </label>
          <label className="space-y-1">
            <span className="block text-[11px] text-muted-foreground">Minimum order value (€)</span>
            <input type="number" step="0.01" min="0" value={minOrder} onChange={(e) => setMinOrder(e.target.value)}
              placeholder={`Default: ${hint(defaults?.min_order_value)}`} className="h-8 w-full rounded border border-border/60 bg-background px-2 text-right text-sm" />
          </label>
          <label className="space-y-1">
            <span className="block text-[11px] text-muted-foreground">Payment terms (days)</span>
            <input type="number" step="1" min="0" value={terms} onChange={(e) => setTerms(e.target.value)}
              placeholder={`Default: ${hint(defaults?.payment_terms_days, false)}`} className="h-8 w-full rounded border border-border/60 bg-background px-2 text-right text-sm" />
          </label>
        </div>
        <p className="text-[11px] text-muted-foreground">Blank = inherit the workspace default from Finance → Settings.</p>

        <div className="space-y-2 pt-2 border-t border-border/60">
          <div className="flex items-center gap-2 text-xs font-medium"><Users className="h-3.5 w-3.5" /> Responsible sales team</div>
          {selectedNames.length > 0 && (
            <div className="flex flex-wrap gap-1.5">{selectedNames.map((n, i) => <Badge key={i} variant="default" className="text-[10px]">{n}</Badge>)}</div>
          )}
          {salesUsers.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No sales-eligible members in this workspace yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {salesUsers.map((u) => {
                const on = team.includes(u.user_id);
                return (
                  <button key={u.user_id} type="button" onClick={() => toggleMember(u.user_id)}
                    className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition ${on ? 'border-primary bg-primary/15 text-primary' : 'border-border/60 text-muted-foreground hover:bg-muted/40'}`}>
                    {on && <Check className="h-3 w-3" />}{u.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
