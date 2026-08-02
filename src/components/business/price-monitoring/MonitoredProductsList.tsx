/**
 * Monitored Products List — internal flow.
 *
 * One row per `tracked_queries` row owned by the user (api_key_id IS NULL).
 * Reads the denormalized `current_price` cache populated by every refresh,
 * so the table renders without per-row history queries.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Switch } from '@/components/core/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/core/ui/table';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { Play, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { FilterBar, useFilters } from '@/components/core/filters';
import { refreshProduct, untrackProduct, trackProduct } from '@/services/priceMonitoringApi';
import type { TrackedQuery } from '@/services/priceMonitoringApi';
import { statusTone } from '@/utils/statusTone';
import { buildMonitoredProductFilters } from './monitoredProductFilters';

interface MonitoredProductsListProps {
  products: TrackedQuery[];
  onRefresh: () => void;
}

export const MonitoredProductsList: React.FC<MonitoredProductsListProps> = ({
  products,
  onRefresh,
}) => {
  const [productNames, setProductNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);
  const { toast } = useToast();

  const filterGroups = useMemo(
    () => buildMonitoredProductFilters(products, (id) => productNames[id]),
    [products, productNames],
  );
  const { values: filterValues, setValues: setFilterValues, filtered, previewCount } =
    useFilters<TrackedQuery>(products, filterGroups);

  // `products` is owned by the parent — an untrack + onRefresh can shrink it under the current
  // page, and a narrowed result set is a different list entirely.
  useEffect(() => {
    setPage((prev) => clampPage(prev, filtered.length));
  }, [filtered.length]);
  useEffect(() => { setPage(1); }, [filterValues]);

  useEffect(() => {
    const productIds = products.map((p) => p.product_id).filter((id): id is string => Boolean(id));
    if (productIds.length === 0) return;

    let cancelled = false;
    (async () => {
      // A discarded error made every row silently fall back to rendering the raw
      // search_query instead of the product name — an outage that looks like a naming
      // quirk, so nobody reports it.
      const { data, error } = await supabase
        .from('products')
        .select('id, name')
        .in('id', productIds);
      if (cancelled) return;
      if (error) console.error('[MonitoredProductsList] product-name lookup failed:', error.message);
      const map: Record<string, string> = {};
      for (const p of data ?? []) map[p.id] = p.name;
      setProductNames(map);
    })();
    return () => { cancelled = true; };
  }, [products]);

  const handleToggleMonitoring = async (tq: TrackedQuery) => {
    const productId = tq.product_id;
    if (!productId) return;
    setBusy((prev) => ({ ...prev, [tq.id]: true }));
    try {
      if (tq.is_active) {
        await untrackProduct(productId);
        toast({ title: 'Monitoring paused', description: 'No more refreshes until you re-enable.' });
      } else {
        await trackProduct(productId);
        toast({ title: 'Monitoring resumed' });
      }
      onRefresh();
    } catch (error) {
      console.error('Toggle failed:', error);
      toast({
        title: 'Failed to toggle',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setBusy((prev) => ({ ...prev, [tq.id]: false }));
    }
  };

  const handleCheckNow = async (tq: TrackedQuery) => {
    const productId = tq.product_id;
    if (!productId) return;
    setBusy((prev) => ({ ...prev, [tq.id]: true }));
    try {
      const outcome = await refreshProduct(productId, { force_refresh: true });
      toast({
        title: outcome.status === 'refreshed' ? 'Refresh complete' : `Status: ${outcome.status}`,
        description: outcome.status === 'refreshed'
          ? `${outcome.results?.length ?? 0} prices found, ${outcome.credits_used ?? 0} credits used`
          : outcome.error ?? '',
      });
      onRefresh();
    } catch (error) {
      console.error('Check now failed:', error);
      toast({
        title: 'Failed to refresh',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setBusy((prev) => ({ ...prev, [tq.id]: false }));
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Monitored Products</CardTitle>
        {products.length > 0 && (
          <FilterBar
            groups={filterGroups}
            values={filterValues}
            onChange={setFilterValues}
            previewCount={previewCount}
            title="Filter monitored products"
            searchPlaceholder="Search product, query, manufacturer…"
          />
        )}
      </CardHeader>
      <CardContent>
        {products.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No products being monitored yet</p>
            <p className="text-sm text-muted-foreground mt-2">
              Add products to start tracking competitor prices
            </p>
          </div>
        ) : (
          <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Cheapest Verified</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Last Check</TableHead>
                <TableHead className="hidden md:table-cell">Next Check</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                    No monitored products match the current filters.
                  </TableCell>
                </TableRow>
              )}
              {paginate(filtered, page).map((tq) => {
                const isBusy = busy[tq.id] ?? false;
                const name = (tq.product_id && productNames[tq.product_id]) || tq.search_query;
                return (
                  <TableRow key={tq.id}>
                    <TableCell className="font-medium">{name}</TableCell>
                    <TableCell>
                      {tq.current_price != null ? (
                        <div>
                          <span className="font-semibold">
                            {tq.current_price.toFixed(2)} {tq.current_currency || ''}
                          </span>
                          {tq.current_price_verified ? (
                            <span className={`ml-2 text-xs capitalize ${statusTone('verified')}`}>Verified</span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs capitalize ${statusTone(tq.is_active ? 'active' : 'paused')}`}>
                        {tq.is_active ? 'active' : 'paused'}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                      {tq.last_refreshed_at
                        ? new Date(tq.last_refreshed_at).toLocaleString()
                        : 'Never'}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                      {tq.next_check_at
                        ? new Date(tq.next_check_at).toLocaleString()
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Switch
                          checked={tq.is_active}
                          onCheckedChange={() => handleToggleMonitoring(tq)}
                          disabled={isBusy}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCheckNow(tq)}
                          disabled={!tq.is_active || isBusy}
                        >
                          {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <TablePagination
            page={page}
            total={filtered.length}
            onPageChange={setPage}
            label="products"
          />
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default MonitoredProductsList;
