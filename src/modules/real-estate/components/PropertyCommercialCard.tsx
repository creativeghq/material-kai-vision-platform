/**
 * What has been bought, sold and spent ON this building.
 *
 * `orders.property_id` and `supplier_bills.property_id` shipped with a writer and no reader — a
 * building could be told what was bought for it and could never say so. A write-only link is
 * indistinguishable from a working one from the side that writes it, which is exactly why the
 * one-way-link class in #378 went unnoticed for so long.
 *
 * Deliberately NOT a project P&L. A job is one commitment tracked through two stages, so
 * `get_project_pnl` nets committed against actual; a building accumulates unrelated documents over
 * years, and a supplier bill that invoices a purchase order listed here is the SAME money. So
 * "ordered" and "billed" are shown apart and never added, and a bill that belongs to one of the
 * orders above says so rather than leaving the reader to double-count it.
 *
 * Renders nothing when nothing is linked. The way to link a building is on the ORDER or the
 * EXPENSE, so an empty state here could offer no honest create action — and `HubEmptyState` is
 * explicit that an empty state without a way out of being empty is worse than no empty state.
 */
import React, { useEffect, useState } from 'react';
import { Building2, Receipt, ShoppingCart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
// The canonical formatter, not the finance re-export: `formatMoney` pins en-IE on purpose, and
// this is the file guarded by moneyFormattingSingleSource.test.ts.
import { formatMoney } from '@/utils/decimal';
import { statusTone } from '@/utils/statusTone';
import { formatDate } from '@/utils/datetime';
import { supabase } from '@/integrations/supabase/client';

/** One currency's worth of a derived total. Never summed across currencies — the RPC groups. */
interface MoneyByCurrency { currency: string; amount: number }

interface CommercialLinks {
  orders: Array<{
    id: string; order_number: string | null; order_type: 'sales' | 'purchase'; status: string;
    total: number; currency: string; created_at: string; party_name: string | null;
  }>;
  bills: Array<{
    id: string; number: string | null; status: string; total: number; currency: string;
    issued_at: string | null; supplier_name: string | null;
    /** Set when this bill invoices one of the purchase orders above — so it is not counted twice. */
    invoices_order_id: string | null;
  }>;
  sold: MoneyByCurrency[];
  ordered: MoneyByCurrency[];
  billed: MoneyByCurrency[];
}

const EMPTY: CommercialLinks = { orders: [], bills: [], sold: [], ordered: [], billed: [] };

export const PropertyCommercialCard: React.FC<{ propertyId: string }> = ({ propertyId }) => {
  const [links, setLinks] = useState<CommercialLinks>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!propertyId) { setLinks(EMPTY); return; }
      // Best-effort: this is a summary beside the listing itself, and a failure to load it must
      // not take the workbench down with it.
      const { data } = await (supabase as any).rpc('get_property_commercial_links', { p_property_id: propertyId });
      if (cancelled) return;
      const d = (data ?? {}) as Partial<CommercialLinks>;
      setLinks({
        orders: d.orders ?? [], bills: d.bills ?? [],
        sold: d.sold ?? [], ordered: d.ordered ?? [], billed: d.billed ?? [],
      });
    })().catch(() => { if (!cancelled) setLinks(EMPTY); });
    return () => { cancelled = true; };
  }, [propertyId]);

  if (links.orders.length === 0 && links.bills.length === 0) return null;

  const sales = links.orders.filter((o) => o.order_type === 'sales');
  const purchases = links.orders.filter((o) => o.order_type === 'purchase');

  return (
    <Card>
      <CardHeader className="border-b border-hairline px-5 py-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Building2 className="h-4 w-4 text-muted-foreground" /> Bought &amp; sold for this property
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {links.sold.map((m) => <Tile key={`s:${m.currency}`} label="Sold" m={m} tone="green" />)}
          {links.ordered.map((m) => <Tile key={`o:${m.currency}`} label="Ordered" m={m} />)}
          {links.billed.map((m) => <Tile key={`b:${m.currency}`} label="Billed" m={m} tone="amber" />)}
        </div>
        {links.ordered.length > 0 && links.billed.length > 0 && (
          <p className="pt-1 text-[11px] text-muted-foreground">
            Ordered and billed are shown separately and must not be added — a supplier bill that
            invoices one of the purchase orders below is the same money, and says so on its row.
          </p>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {sales.length > 0 && <GroupRow icon={<ShoppingCart className="h-3 w-3" />} text="Sold" />}
        {sales.map((o) => <OrderRow key={o.id} o={o} />)}

        {purchases.length > 0 && <GroupRow icon={<ShoppingCart className="h-3 w-3" />} text="Purchased for it" />}
        {purchases.map((o) => <OrderRow key={o.id} o={o} />)}

        {links.bills.length > 0 && <GroupRow icon={<Receipt className="h-3 w-3" />} text="Costs booked to it" />}
        {links.bills.map((b) => (
          <div key={b.id} className="flex items-center justify-between border-b border-hairline px-5 py-2 text-sm">
            <span className="min-w-0 truncate">
              <span className="font-medium">{b.supplier_name || b.number || b.id.slice(0, 8)}</span>
              {b.issued_at && <span className="text-muted-foreground"> · {formatDate(b.issued_at)}</span>}
              <span className={`ml-2 text-xs ${statusTone(b.status)}`}>{b.status}</span>
              {b.invoices_order_id && (
                <span className="ml-2 text-[10px] text-muted-foreground">already on a purchase order above</span>
              )}
            </span>
            <span className="tabular-nums">{formatMoney(Number(b.total), b.currency)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

const OrderRow: React.FC<{ o: CommercialLinks['orders'][number] }> = ({ o }) => (
  <div className="flex items-center justify-between border-b border-hairline px-5 py-2 text-sm">
    <span className="min-w-0 truncate">
      <span className="font-medium">{o.order_number ?? o.id.slice(0, 8)}</span>
      {o.party_name && <span className="text-muted-foreground"> · {o.party_name}</span>}
      <span className={`ml-2 text-xs ${statusTone(o.status)}`}>{o.status}</span>
    </span>
    <span className="tabular-nums">{formatMoney(Number(o.total), o.currency)}</span>
  </div>
);

const Tile: React.FC<{ label: string; m: MoneyByCurrency; tone?: 'green' | 'amber' }> = ({ label, m, tone }) => (
  <div className="rounded-md border border-hairline px-2.5 py-1.5">
    <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className={`text-sm font-medium tabular-nums ${tone === 'green' ? 'text-emerald-500' : tone === 'amber' ? 'text-amber-500' : ''}`}>
      {formatMoney(Number(m.amount), m.currency)}
    </div>
  </div>
);

const GroupRow: React.FC<{ icon: React.ReactNode; text: string }> = ({ icon, text }) => (
  <div className="flex items-center gap-1.5 border-b border-hairline bg-surface-sunken px-5 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
    {icon}{text}
  </div>
);
