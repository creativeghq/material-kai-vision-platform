// #251 — operator view of module add-on activation. Per module: active/canceling subscriber
// counts, total entitled (incl. plan-included), add-on MRR, and the workspace list. Data comes
// from the operator-guarded admin_module_subscription_overview() RPC.
import React, { useCallback, useEffect, useState } from 'react';
import { CreditCard, RefreshCw, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { useToast } from '@/hooks/use-toast';

interface SubscriberRow {
  workspace_id: string;
  workspace_name: string | null;
  status: string;
  current_period_end: string | null;
  created_at: string;
}
interface ModuleOverviewRow {
  module_slug: string;
  module_name: string;
  is_addon: boolean;
  addon_price_cents: number | null;
  addon_currency: string | null;
  active_count: number;
  canceling_count: number;
  entitled_count: number;
  mrr_cents: number;
  subscribers: SubscriberRow[];
}

function money(cents: number, currency: string | null): string {
  const cur = (currency || 'eur').toLowerCase();
  const symbol = cur === 'eur' ? '€' : cur === 'usd' ? '$' : `${cur.toUpperCase()} `;
  return `${symbol}${(cents / 100).toFixed(2)}`;
}

const STATUS_TONE: Record<string, string> = {
  active: 'text-emerald-600 dark:text-emerald-400',
  trialing: 'text-blue-500 dark:text-blue-400',
  canceling: 'text-amber-600 dark:text-amber-400',
  canceled: 'text-muted-foreground',
  past_due: 'text-red-500 dark:text-red-400',
};

// One table per module, so each keeps its own page — a component rather than inline JSX
// because page state can't live inside a .map().
const SubscriberTable: React.FC<{ module: ModuleOverviewRow }> = ({ module: m }) => {
  const [page, setPage] = useState(1);
  // Page state outlives a Refresh (the component is keyed by module), so clamp when
  // a refresh returns fewer subscribers than the current page covers.
  const total = m.subscribers.length;
  useEffect(() => { setPage((p) => clampPage(p, total)); }, [total]);
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Workspace</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Renews / Ends</TableHead>
            <TableHead>Since</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginate(m.subscribers, page).map((s) => (
            <TableRow key={`${m.module_slug}:${s.workspace_id}`}>
              <TableCell className="font-medium">{s.workspace_name || s.workspace_id.slice(0, 8)}</TableCell>
              <TableCell>
                <span className={`text-xs capitalize ${STATUS_TONE[s.status] || 'text-muted-foreground'}`}>
                  {s.status}
                </span>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : '—'}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {new Date(s.created_at).toLocaleDateString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <TablePagination
        page={page}
        total={m.subscribers.length}
        onPageChange={setPage}
        label="subscribers"
      />
    </>
  );
};

export const ModuleSubscribersPanel: React.FC = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<ModuleOverviewRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_module_subscription_overview');
    if (error) {
      toast({ title: 'Could not load module subscriptions', description: error.message, variant: 'destructive' });
      setRows([]);
    } else {
      setRows((data ?? []) as unknown as ModuleOverviewRow[]);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2"><CreditCard className="h-5 w-5" /> Module add-ons</h3>
          <p className="text-sm text-muted-foreground">Per-module activation, subscribers, and add-on MRR across all workspaces.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          No add-on modules configured yet. Mark a module as an add-on in <strong>Admin → Modules → Billing</strong>.
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {rows.map((m) => (
            <Card key={m.module_slug}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2">
                    {m.module_name}
                    {m.is_addon && m.addon_price_cents != null && (
                      <Badge variant="outline">{money(m.addon_price_cents, m.addon_currency)}/mo</Badge>
                    )}
                  </CardTitle>
                  <div className="flex items-center gap-4 text-sm">
                    <span><strong className="text-green-600">{m.active_count}</strong> active</span>
                    <span><strong className="text-amber-600">{m.canceling_count}</strong> canceling</span>
                    <span><strong>{m.entitled_count}</strong> entitled</span>
                    <span className="font-semibold">{money(m.mrr_cents, m.addon_currency)} MRR</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {m.subscribers.length === 0 ? (
                  <p className="px-6 pb-4 text-sm text-muted-foreground">No paid subscribers.</p>
                ) : (
                  <SubscriberTable module={m} />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
