import React, { useCallback, useEffect, useState } from 'react';
import { Store, RefreshCw, Check, X, PackageCheck, FileUp } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import {
  HubCellLink, HubFilterSelect, HubResetFilters, HubSortButton, HubToolbar, HUB_FILTER_ALL, useHubTable,
  type HubTableField,
} from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/utils/datetime';
import type { StoreConnection } from '@/services/commerce/storeConnectionsService';

interface QueueRow {
  id: string;
  external_order_id: string;
  external_order_number: string | null;
  external_state: string | null;
  document_request: string | null;
  synced_at: string;
  invoice_id: string | null;
  invoice_number: string | null;
  order_id: string | null;
}

const FIELDS: HubTableField<QueueRow>[] = [
  {
    id: 'order',
    sortValue: (r) => r.external_order_number ?? r.external_order_id,
    searchText: (r) => `${r.external_order_number ?? ''} ${r.external_order_id} ${r.invoice_number ?? ''}`,
  },
  {
    id: 'state',
    sortValue: (r) => r.external_state,
    filterValue: (r) => r.external_state,
    filterLabel: 'State',
    filterOptionLabel: (v) => v.replace(/_/g, ' '),
  },
  {
    id: 'request',
    sortValue: (r) => r.document_request,
    filterValue: (r) => r.document_request,
    filterLabel: 'Asked for',
    filterOptionLabel: (v) => v.replace(/_/g, ' '),
  },
  { id: 'seen', sortValue: (r) => r.synced_at },
];

const STATE_TONE: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  open: 'warning', accepted: 'info', dispatched: 'info', delivered: 'success',
  rejected: 'neutral', cancelled: 'neutral', expired: 'error',
  for_return: 'warning', returned: 'neutral', partially_returned: 'warning', partially_delivered: 'info',
};

export const SkroutzQueueCard: React.FC<{ connection: StoreConnection }> = ({ connection }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('store_orders')
      .select('id, external_order_id, external_order_number, external_state, document_request, synced_at, '
        + 'orders(id, invoices(id, status, internal_number))')
      .eq('connection_id', connection.id)
      .order('synced_at', { ascending: false })
      .limit(50);
    if (error) {
      toast({ title: 'Could not load the Skroutz queue', description: error.message, variant: 'destructive' });
      return;
    }
    setRows((data ?? []).map((raw) => {
      const r = raw as Record<string, any>;
      const issued = (r.orders ?? [])
        .flatMap((o: Record<string, any>) => o.invoices ?? [])
        .find((i: Record<string, any>) => i.status !== 'draft') ?? null;
      return {
        id: r.id,
        external_order_id: r.external_order_id,
        external_order_number: r.external_order_number,
        external_state: r.external_state,
        document_request: r.document_request,
        synced_at: r.synced_at,
        invoice_id: issued?.id ?? null,
        invoice_number: issued?.internal_number ?? null,
        order_id: (r.orders ?? [])[0]?.id ?? null,
      } as QueueRow;
    }));
  }, [connection.id, toast]);

  useEffect(() => { void load(); }, [load]);

  const call = async (action: string, orderCode?: string, invoiceId?: string) => {
    setBusy(orderCode ?? action);
    try {
      const { data, error } = await supabase.functions.invoke('store-skroutz-orders', {
        body: { action, connection_id: connection.id, order_code: orderCode, invoice_id: invoiceId },
      });
      if (error) throw error;
      await load();
      toast({
        title: action === 'pull'
          ? `${data?.created ?? 0} new, ${data?.duplicate ?? 0} already held`
          : `${action.replace(/_/g, ' ')} done`,
        description: data?.state ? `Now ${data.state}.` : undefined,
      });
    } catch (err) {
      toast({ title: 'Skroutz refused that', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const open = rows.filter((r) => r.external_state === 'open');
  const t = useHubTable(rows, FIELDS, { columnId: 'seen', direction: 'desc' });
  const sortHead = (id: string, label: string) => (
    <HubSortButton active={t.sort?.columnId === id ? t.sort.direction : undefined} onClick={() => t.toggleSort(id)}>
      {label}
    </HubSortButton>
  );
  const ariaSort = (id: string) =>
    t.sort?.columnId === id ? (t.sort.direction === 'asc' ? 'ascending' : 'descending') : undefined;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2"><Store className="h-4 w-4" aria-hidden="true" /> Skroutz orders</CardTitle>
          <CardDescription>
            Unlike a webshop, Skroutz starts a clock: an order has to be accepted or rejected, and since
            30/03/2026 dispatch needs an explicit <em>Set as ready</em>. An order left open expires, and an
            expired order is a lost sale.
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" disabled={busy === 'pull'} onClick={() => call('pull')}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> {busy === 'pull' ? 'Fetching…' : 'Fetch orders'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {open.length > 0 && (
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            {open.length} order{open.length === 1 ? '' : 's'} waiting on you.
          </p>
        )}

        {rows.length === 0 ? (
          <HubEmptyState
            icon={Store}
            title="Nothing fetched yet"
            description="Fetch the open orders to see what is waiting. Skroutz does not push until a webhook is registered, so until then this is the way to see them."
            action={<Button size="sm" onClick={() => call('pull')}><RefreshCw className="mr-1 h-3.5 w-3.5" /> Fetch orders</Button>}
          />
        ) : (
          <div className="overflow-hidden rounded-md border border-hairline">
          {rows.length > 8 && (
            <HubToolbar
              search={t.search}
              onSearchChange={t.setSearch}
              searchPlaceholder="Search order or document"
              filters={<>
                <HubFilterSelect label="State" value={t.filters.state ?? HUB_FILTER_ALL} options={t.filterOptions.state ?? []} onChange={(v) => t.setFilter('state', v)} />
                <HubFilterSelect label="Asked for" value={t.filters.request ?? HUB_FILTER_ALL} options={t.filterOptions.request ?? []} onChange={(v) => t.setFilter('request', v)} />
                <HubResetFilters count={t.activeFilterCount} onReset={t.reset} />
              </>}
            />
          )}
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead className="bg-surface-sunken">
                <tr className="text-left">
                  <th className="px-2 py-1 text-[11px] font-semibold" aria-sort={ariaSort('order')}>{sortHead('order', 'Order')}</th>
                  <th className="px-2 py-1 text-[11px] font-semibold" aria-sort={ariaSort('state')}>{sortHead('state', 'State')}</th>
                  <th className="hidden px-2 py-1 text-[11px] font-semibold md:table-cell" aria-sort={ariaSort('request')}>{sortHead('request', 'Asked for')}</th>
                  <th className="hidden px-2 py-1 text-[11px] font-semibold sm:table-cell" aria-sort={ariaSort('seen')}>{sortHead('seen', 'Seen')}</th>
                  <th className="px-2 py-1"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {t.rows.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <HubEmptyState
                        variant="filtered"
                        title="No orders match"
                        action={<Button size="sm" variant="outline" onClick={t.reset}>Clear filters</Button>}
                      />
                    </td>
                  </tr>
                )}
                {t.rows.map((r) => (
                  <tr key={r.id} className="border-t border-hairline">
                    <td className="whitespace-nowrap px-2 py-1 font-mono text-xs">
                      {r.order_id
                        ? <HubCellLink to={`/finance/orders/${r.order_id}`}>{r.external_order_number ?? r.external_order_id}</HubCellLink>
                        : (r.external_order_number ?? r.external_order_id)}
                    </td>
                    <td className="px-2 py-1">
                      <Badge variant={STATE_TONE[r.external_state ?? ''] ?? 'neutral'} className="text-[10px]">
                        {r.external_state ?? 'unknown'}
                      </Badge>
                    </td>
                    <td className="hidden px-2 py-1 text-xs text-muted-foreground md:table-cell">
                      {r.document_request ? r.document_request.replace(/_/g, ' ') : '—'}
                    </td>
                    <td className="hidden whitespace-nowrap px-2 py-1 text-xs text-muted-foreground sm:table-cell">{formatDate(r.synced_at)}</td>
                    <td className="whitespace-nowrap px-2 py-1 text-right">
                      {r.external_state === 'open' && (
                        <>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" disabled={busy === r.external_order_id}
                            onClick={() => call('accept', r.external_order_id)}>
                            <Check className="mr-1 h-3 w-3" /> Accept
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" disabled={busy === r.external_order_id}
                            onClick={() => call('reject', r.external_order_id)}>
                            <X className="mr-1 h-3 w-3 text-destructive" /> Reject
                          </Button>
                        </>
                      )}
                      {r.external_state === 'accepted' && (
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" disabled={busy === r.external_order_id}
                          onClick={() => call('set_as_ready', r.external_order_id)}>
                          <PackageCheck className="mr-1 h-3 w-3" /> Set as ready
                        </Button>
                      )}
                      {r.invoice_id && (
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" disabled={busy === r.external_order_id}
                          onClick={() => call('upload_document', r.external_order_id, r.invoice_id ?? undefined)}>
                          <FileUp className="mr-1 h-3 w-3" /> Send {r.invoice_number}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
