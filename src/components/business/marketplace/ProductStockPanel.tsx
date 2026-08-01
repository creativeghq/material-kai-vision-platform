/**
 * Physical stock for one catalog product, on the product record.
 *
 * The modal used to say nothing at all about stock — a comment in it still explained that this
 * is "a quote-based platform, retail/wholesale/stock aren't tracked", which stopped being true
 * once multi-warehouse stock, movements and marketplace listings shipped. So an operator could
 * receive 200 m² into the Athens depot and the product record showed no sign of it.
 *
 * It also surfaces the physical facts that only ever existed on the STOCK row — weight, the
 * per-receipt dimensions, the supplier's own product code. `products` has no columns for those,
 * so before this panel they were write-only: entered at intake, never displayed anywhere except
 * the warehouse table.
 *
 * VISIBILITY IS THE CALLER'S JOB and is deliberately not re-derived here. The panel renders
 * whatever it is given; `ProductDetailModal` decides who may mount it (`warehouse.manage`, own
 * workspace, `stock` module). Note that RLS on `warehouse_items` / `stock_movements` is only
 * `is_workspace_member(...)` — it enforces TENANCY, not role — so this gate is the only thing
 * separating a warehouse reader from, say, an invited employee. That gap, and the
 * `is_workspace_stock_reader` predicate that would close it, are written up under
 * "Who sees stock on the product record" in docs/warehouse-and-billing.md.
 */
import React, { useEffect, useState } from 'react';
import { Loader2, Boxes, ArrowDownLeft, ArrowUpRight, Settings2, Store } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import {
  warehouseService, type ProductStockRow, type StockMovementRow,
} from '@/services/warehouseService';
import { marketplaceService, type ActiveListingSummary } from '@/services/marketplaceService';
import { formatMoney } from '@/modules/finance/services/financeService';
import { unitSuffix } from '@/lib/units';

interface Props {
  productId: string;
  workspaceId: string;
  /** Show the marketplace listing column. Same gate as the panel today, kept explicit. */
  showListings?: boolean;
  /**
   * `summary` renders ONLY the availability total — no per-warehouse rows, no locations, no
   * movements, no listings. That is what a sales rep needs (don't quote what isn't there) and
   * the most they should get: warehouse layout and the movement ledger are operations data.
   * One component with two presentations rather than a second near-duplicate to drift.
   */
  variant?: 'full' | 'summary';
}

export const ProductStockPanel: React.FC<Props> = ({
  productId, workspaceId, showListings = true, variant = 'full',
}) => {
  const summaryOnly = variant === 'summary';
  const [rows, setRows] = useState<ProductStockRow[]>([]);
  const [movements, setMovements] = useState<StockMovementRow[]>([]);
  const [listings, setListings] = useState<Record<string, ActiveListingSummary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const stock = await warehouseService.productStock(workspaceId, productId);
        if (!live) return;
        setRows(stock);
        // Movements and listings are supporting detail — a failure in either must not blank the
        // quantities, which are the answer the operator actually came for.
        // Never fetched in summary mode — a rep has no business generating reads for a ledger
        // they are not allowed to see.
        const [mv, ls] = summaryOnly ? [[], {}] : await Promise.all([
          warehouseService.productMovements(workspaceId, productId, 15).catch(() => []),
          showListings
            ? marketplaceService.activeListingsByItem(workspaceId).catch(() => ({}))
            : Promise.resolve({} as Record<string, ActiveListingSummary>),
        ]);
        if (!live) return;
        setMovements(mv);
        setListings(ls);
      } catch (err: any) {
        if (live) setError(err?.message ?? 'Could not load stock');
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [productId, workspaceId, showListings, summaryOnly]);

  if (loading) {
    return summaryOnly ? null : (
      <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
    );
  }
  if (error) {
    // A summary line is a convenience on someone else's screen; failing it loudly would put an
    // operations error in front of a sales rep who can do nothing about it.
    return summaryOnly ? null : <p className="text-xs text-destructive">{error}</p>;
  }
  if (rows.length === 0) {
    if (summaryOnly) return null;
    return (
      <p className="text-xs text-muted-foreground">
        This product is not stocked in any warehouse. It can still be quoted and sold — stock is
        only tracked for items received into a warehouse.
      </p>
    );
  }

  const unit = rows[0]?.unit ?? 'pcs';
  const suffix = unitSuffix(unit);
  const totalOnHand = rows.reduce((s, r) => s + (Number(r.qty_on_hand) || 0), 0);
  const totalReserved = rows.reduce((s, r) => s + (Number(r.qty_reserved) || 0), 0);
  const totalAvailable = totalOnHand - totalReserved;

  // Physical facts live per stock row because origin/size can differ by receipt. Only show the
  // block when the rows agree, rather than inventing a single answer out of several.
  const firstWithPhysical = rows.find(
    (r) => r.weight_kg != null || r.width_mm != null || r.manufacturer || r.supplier_product_code,
  );

  const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

  if (summaryOnly) {
    const anyLow = rows.some((r) => Number(r.reorder_point) > 0 && Number(r.qty_on_hand) <= Number(r.reorder_point));
    return (
      <div className="flex items-center gap-2 text-xs">
        <Boxes className="h-3.5 w-3.5 text-muted-foreground" />
        <span className={totalAvailable <= 0 ? 'text-destructive' : anyLow ? 'text-amber-500' : 'text-emerald-500'}>
          {totalAvailable <= 0 ? 'Out of stock' : anyLow ? 'Low stock' : 'In stock'}
        </span>
        {totalAvailable > 0 && (
          <span className="text-muted-foreground">— {num(totalAvailable)} {suffix} available</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="dashboard-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Boxes className="h-4 w-4 text-primary" />
            {num(totalAvailable)} {suffix} available
          </CardTitle>
          <CardDescription>
            {num(totalOnHand)} {suffix} on hand
            {totalReserved > 0 && <> · {num(totalReserved)} reserved</>}
            {rows.length > 1 && <> · across {rows.length} warehouses</>}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Warehouse</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead className="text-right">Reserved</TableHead>
                <TableHead className="text-right">Reorder at</TableHead>
                <TableHead>Status</TableHead>
                {showListings && <TableHead>Listing</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const onHand = Number(r.qty_on_hand) || 0;
                const reorder = Number(r.reorder_point) || 0;
                const low = reorder > 0 && onHand <= reorder;
                const listing = listings[r.id];
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {r.warehouse_name ?? 'Unassigned'}
                      {r.warehouse_is_default && (
                        <span className="ml-1.5 text-[10px] text-muted-foreground">default</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.location || '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(onHand)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {Number(r.qty_reserved) > 0 ? num(Number(r.qty_reserved)) : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {reorder > 0 ? num(reorder) : '—'}
                    </TableCell>
                    {/* Plain coloured words, not pills — house table style. */}
                    <TableCell className={onHand <= 0 ? 'text-destructive' : low ? 'text-amber-500' : 'text-emerald-500'}>
                      {onHand <= 0 ? 'Out of stock' : low ? 'Low' : 'In stock'}
                    </TableCell>
                    {showListings && (
                      <TableCell className="text-muted-foreground">
                        {listing ? (
                          <span className="flex items-center gap-1.5">
                            <Store className="h-3 w-3 text-primary" />
                            {formatMoney(listing.price, listing.currency)}
                            <span className="text-[10px]">· {num(listing.qty_remaining)} left</span>
                          </span>
                        ) : '—'}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {firstWithPhysical && (
        <Card className="dashboard-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Settings2 className="h-4 w-4 text-primary" />
              As received
            </CardTitle>
            <CardDescription>
              Measured at intake and stored on the stock row — not part of the catalog spec.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4 text-xs">
            <Fact label="Weight" value={firstWithPhysical.weight_kg != null ? `${firstWithPhysical.weight_kg} kg` : null} />
            <Fact
              label="Dimensions"
              value={[
                firstWithPhysical.width_mm != null && `W ${firstWithPhysical.width_mm}`,
                firstWithPhysical.length_mm != null && `L ${firstWithPhysical.length_mm}`,
                firstWithPhysical.thickness_mm != null && `T ${firstWithPhysical.thickness_mm}`,
              ].filter(Boolean).join(' × ') || null}
              suffix="mm"
            />
            <Fact label="Manufacturer" value={firstWithPhysical.manufacturer} />
            <Fact label="Supplier code" value={firstWithPhysical.supplier_product_code} />
            <Fact label="Serial" value={firstWithPhysical.serial_number} />
          </CardContent>
        </Card>
      )}

      {movements.length > 0 && (
        <Card className="dashboard-card">
          <CardHeader>
            <CardTitle className="text-sm">Recent movements</CardTitle>
            <CardDescription>The last {movements.length} stock changes for this product.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-muted-foreground">
                      {new Date(m.occurred_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className={m.direction === 'in' ? 'text-emerald-500' : m.direction === 'out' ? 'text-amber-500' : 'text-muted-foreground'}>
                      <span className="flex items-center gap-1">
                        {m.direction === 'in'
                          ? <ArrowDownLeft className="h-3 w-3" />
                          : m.direction === 'out'
                            ? <ArrowUpRight className="h-3 w-3" />
                            : <Settings2 className="h-3 w-3" />}
                        {m.direction === 'in' ? 'Received' : m.direction === 'out' ? 'Issued' : 'Adjusted'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{num(Number(m.quantity) || 0)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.reason || (m.source_type ? m.source_type.replace(/_/g, ' ') : '—')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const Fact: React.FC<{ label: string; value: string | number | null | undefined; suffix?: string }> =
  ({ label, value, suffix }) => {
    if (value === null || value === undefined || value === '') return null;
    return (
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div>{value}{suffix ? ` ${suffix}` : ''}</div>
      </div>
    );
  };

export default ProductStockPanel;
