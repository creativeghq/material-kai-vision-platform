import React, { useEffect, useState } from 'react';
import { Loader2, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { statusTone } from '@/utils/statusTone';
import {
  HubToolbar, HubFilterSelect, HubResetFilters, HubSortButton, HubCellEmpty, HubEmptyState,
  useHubTable, HUB_FILTER_ALL, type HubTableField,
} from '@/components/core/hub';
import {
  PRODUCT_IMAGE_SELECT,
  getProductImageUrl,
  getManufacturer,
  getMaterialCategory,
  formatMaterialCategory,
} from '@/utils/productMetadata';

interface SupplierProductsTabProps {
  /**
   * The active workspace. Belt-and-braces scope on top of the brand_company_id match
   * (the company is workspace-scoped, so its catalog must be too).
   */
  workspaceId: string;
  /**
   * The supplier's crm_companies id. This is the SINGLE source of truth: products carry
   * a brand_company_id FK that ingestion stamps (resolve_brand_company) and the
   * "Linked factory / manufacturer" pin claims (claim_brand_for_company). We list every
   * product whose brand_company_id = this company — exact, indexed, no fuzzy name match.
   */
  companyId: string;
}

interface ProductRow {
  id: string;
  name: string;
  sku: string | null;
  external_sku: string | null;
  status: string | null;
  created_at: string | null;
  metadata: Record<string, any> | null;
  image_product_associations?: Array<{
    overall_score: number | null;
    document_images: { image_url: string | null } | null;
  }>;
}

/**
 * Lists every product whose brand_company_id FK points at this supplier company.
 * Used on CRM company profiles tagged is_supplier=true.
 *
 * brand_company_id is the single source of truth: ingestion stamps it
 * (resolve_brand_company) and the "Linked factory / manufacturer" pin claims matching
 * products onto the company (claim_brand_for_company). No fuzzy metadata-name match.
 */
/** How many of a supplier's products this tab loads. The filter and paging are client-side, so
 *  this is a real ceiling — it is SHOWN when hit rather than quietly cutting the list short. */
const ROW_LIMIT = 500;

const categoryOf = (p: ProductRow) => {
  const c = getMaterialCategory(p.metadata);
  return c ? formatMaterialCategory(c) : null;
};

const FIELDS: HubTableField<ProductRow>[] = [
  { id: 'name', sortValue: (p) => p.name, searchText: (p) => [p.name, p.sku, p.external_sku].filter(Boolean).join(' ') },
  { id: 'sku', sortValue: (p) => p.sku || p.external_sku },
  { id: 'category', sortValue: categoryOf, filterValue: categoryOf, filterLabel: 'Category' },
  { id: 'maker', sortValue: (p) => getManufacturer(p.metadata), filterValue: (p) => getManufacturer(p.metadata), filterLabel: 'Maker' },
  { id: 'status', sortValue: (p) => p.status ?? 'draft', filterValue: (p) => p.status ?? 'draft', filterLabel: 'Status' },
];

const SORTABLE: Array<[string, string, string?]> = [
  ['name', 'Name'], ['sku', 'SKU', 'hidden sm:table-cell'], ['category', 'Category', 'hidden md:table-cell'],
  ['maker', 'Maker (on product)', 'hidden lg:table-cell'], ['status', 'Status'],
];

export const SupplierProductsTab: React.FC<SupplierProductsTabProps> = ({
  workspaceId,
  companyId,
}) => {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    if (!companyId) { setRows([]); setLoading(false); return; }

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const { data, error: err } = await supabase
          .from('products')
          .select(`id, name, sku, external_sku, status, created_at, metadata, ${PRODUCT_IMAGE_SELECT}`)
          // Belt-and-braces workspace scope. RLS already bounds this (all 286 tenant tables have
          // it, per the #358 sweep), so its absence was never a live leak — but the props and the
          // comment both said this query was workspace-scoped and it was not (#366 BU-13).
          // Defence in depth only counts when it is actually applied.
          .eq('workspace_id', workspaceId)
          .eq('brand_company_id', companyId)
          .order('created_at', { ascending: false })
          // One over the cap, so a truncated list can say so instead of just being short.
          .limit(ROW_LIMIT + 1);

        if (err) throw err;
        if (cancelled) return;
        const all = (data ?? []) as ProductRow[];
        setTruncated(all.length > ROW_LIMIT);
        setRows(all.slice(0, ROW_LIMIT));
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Failed to load products');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [workspaceId, companyId]);

  const t = useHubTable(rows, FIELDS);
  const filteredRows = t.rows;

  // Filtering (or switching to another supplier) can shrink the list under the current page.
  useEffect(() => { setPage(1); }, [t.search, t.filters, companyId]);
  useEffect(() => { setPage((p) => clampPage(p, filteredRows.length)); }, [filteredRows.length]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Products from This Supplier
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Products attributed to this company as their brand or manufacturer — matched when a
            catalog is imported, or linked manually from a product’s “Factory / manufacturer” field.
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0">
          {loading ? '…' : `${filteredRows.length}${filteredRows.length !== rows.length ? ` / ${rows.length}` : ''} products${truncated ? '+' : ''}`}
        </Badge>
      </CardHeader>
      <CardContent className="p-0">
        {!loading && !error && rows.length > 0 && (
          <HubToolbar
            search={t.search}
            onSearchChange={t.setSearch}
            searchPlaceholder="Filter by name or SKU"
            filters={<>
              {(['category', 'maker', 'status'] as const).map((id) => (t.filterOptions[id]?.length ?? 0) > 2 && (
                <HubFilterSelect
                  key={id}
                  label={id === 'category' ? 'Category' : id === 'maker' ? 'Maker' : 'Status'}
                  value={t.filters[id] ?? HUB_FILTER_ALL}
                  options={t.filterOptions[id]}
                  onChange={(v) => t.setFilter(id, v)}
                />
              ))}
              <HubResetFilters count={t.activeFilterCount} onReset={t.reset} />
            </>}
          />
        )}
        {loading ? (
          <div className="flex items-center gap-2 justify-center py-12 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading products…
          </div>
        ) : error ? (
          <div className="p-6 text-sm text-destructive">{error}</div>
        ) : filteredRows.length === 0 && rows.length > 0 ? (
          <HubEmptyState
            variant="filtered"
            title="No products match these filters"
            action={<Button size="sm" variant="outline" onClick={t.reset}>Clear filters</Button>}
          />
        ) : filteredRows.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground space-y-2">
            <Package className="h-10 w-10 mx-auto opacity-40" />
            <p className="text-sm">No products claimed by this supplier yet.</p>
            <p className="text-xs">
              Pin the ingested factory name(s) under “Linked factory / manufacturer” to claim their
              products — that stamps each product's <code>brand_company_id</code> to this company.
            </p>
          </div>
        ) : (
          <div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14"></TableHead>
                  {SORTABLE.map(([id, label, hide]) => (
                    <TableHead
                      key={id}
                      className={hide}
                      aria-sort={t.sort?.columnId === id ? (t.sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                    >
                      <HubSortButton active={t.sort?.columnId === id ? t.sort.direction : undefined} onClick={() => t.toggleSort(id)}>
                        {label}
                      </HubSortButton>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginate(filteredRows, page).map((p) => {
                  const img = getProductImageUrl(p);
                  const cat = categoryOf(p);
                  const maker = getManufacturer(p.metadata);
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        {img ? (
                          <img src={img} alt="" className="h-10 w-10 rounded object-cover" />
                        ) : (
                          <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                            <Package className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        <span className="block max-w-[20rem] truncate" title={p.name || undefined}>{p.name || '(unnamed)'}</span>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell font-mono text-xs">
                        {p.sku || p.external_sku || <HubCellEmpty />}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{cat ?? <HubCellEmpty />}</TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">{maker ?? <HubCellEmpty />}</TableCell>
                      <TableCell>
                        <span className={`text-xs capitalize ${statusTone(p.status ?? 'draft')}`}>
                          {p.status ?? 'draft'}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <TablePagination page={page} total={filteredRows.length} onPageChange={setPage} label="products" />
            {truncated && (
              <p className="px-4 pb-3 text-[11px] text-muted-foreground">
                Showing the first {ROW_LIMIT} — this supplier has more products than that.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SupplierProductsTab;
