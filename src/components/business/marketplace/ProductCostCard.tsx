/**
 * What this product COST and who we bought it from.
 *
 * Read-only. Purchase cost is set by the buying flows that know the real number — warehouse
 * intake from a supplier document, the XML importer, supplier pricing — so an editable field
 * here would be a fifth way to disagree with them. It is shown because it was previously shown
 * nowhere: `ProductPricingCard` mentions a `WorkspaceCostBadge` in its own docstring that has
 * never existed, so cost has been invisible on the product record.
 *
 * The caller gates this on `pricing.manage` or `sales.team.view` AND own-workspace ownership.
 * Cost is the most sensitive number on a product — it is margin, backwards — and must never
 * reach a project client, an invited employee or a rep without team scope.
 */
import React, { useEffect, useState } from 'react';
import { Coins } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatMoney } from '@/modules/finance/services/financeService';

interface CostRow {
  cost: number | null;
  cost_currency: string | null;
  supply_mode: string | null;
  external_sku: string | null;
  supplier: { name: string } | null;
  brand: { name: string } | null;
}

export const ProductCostCard: React.FC<{ productId: string }> = ({ productId }) => {
  const [row, setRow] = useState<CostRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    (async () => {
      const { data } = await supabase
        .from('products')
        .select('cost, cost_currency, supply_mode, external_sku, ' +
          'supplier:crm_companies!products_supplier_company_id_fkey(name), ' +
          'brand:crm_companies!products_brand_company_id_fkey(name)')
        .eq('id', productId)
        .maybeSingle();
      if (!live) return;
      setRow((data ?? null) as unknown as CostRow);
      setLoading(false);
    })();
    return () => { live = false; };
  }, [productId]);

  if (loading || !row) return null;

  const hasAnything =
    row.cost != null || row.supplier?.name || row.brand?.name || row.external_sku;
  if (!hasAnything) return null;

  return (
    <div className="rounded-md border border-border/60 bg-muted/20 p-3 space-y-2">
      <div className="text-xs font-medium flex items-center gap-1">
        <Coins className="h-3.5 w-3.5 text-primary" /> Cost &amp; supplier
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4 text-xs">
        <Fact
          label="Purchase cost"
          value={row.cost != null ? formatMoney(Number(row.cost), row.cost_currency ?? 'EUR') : null}
        />
        <Fact label="Bought from" value={row.supplier?.name} />
        <Fact label="Brand" value={row.brand?.name} />
        <Fact label="Their code" value={row.external_sku} />
      </div>
    </div>
  );
};

const Fact: React.FC<{ label: string; value: string | null | undefined }> = ({ label, value }) => {
  if (!value) return null;
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div>{value}</div>
    </div>
  );
};

export default ProductCostCard;
