import React, { useEffect, useState } from 'react';
import { Loader2, Package, Search as SearchIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
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
export const SupplierProductsTab: React.FC<SupplierProductsTabProps> = ({
  workspaceId,
  companyId,
}) => {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
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
          .eq('brand_company_id', companyId)
          .order('created_at', { ascending: false })
          .limit(500);

        if (err) throw err;
        if (cancelled) return;
        setRows((data ?? []) as ProductRow[]);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Failed to load products');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [workspaceId, companyId]);

  const filteredRows = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.name?.toLowerCase().includes(q)
      || r.sku?.toLowerCase().includes(q)
      || r.external_sku?.toLowerCase().includes(q),
    );
  }, [rows, search]);

  // Filtering (or switching to another supplier) can shrink the list under the current page.
  useEffect(() => { setPage(1); }, [search, companyId]);
  useEffect(() => { setPage((p) => clampPage(p, filteredRows.length)); }, [filteredRows.length]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Products from this supplier
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Linked by <code>brand_company_id</code> — the products claimed by this company (set at
            ingestion, or via the “Linked factory / manufacturer” pin).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by name or SKU"
              className="pl-8 h-9 w-56"
            />
          </div>
          <Badge variant="secondary" className="shrink-0">
            {loading ? '…' : `${filteredRows.length}${filteredRows.length !== rows.length ? ` / ${rows.length}` : ''} products`}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex items-center gap-2 justify-center py-12 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading products…
          </div>
        ) : error ? (
          <div className="p-6 text-sm text-destructive">{error}</div>
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
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14"></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Maker (on product)</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginate(filteredRows, page).map((p) => {
                  const img = getProductImageUrl(p);
                  const cat = getMaterialCategory(p.metadata);
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
                      <TableCell className="font-medium">{p.name || '(unnamed)'}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {p.sku || p.external_sku || '—'}
                      </TableCell>
                      <TableCell>{cat ? formatMaterialCategory(cat) : '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{maker ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant={p.status === 'published' ? 'default' : 'outline'} className="text-[10px]">
                          {p.status ?? 'draft'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <TablePagination page={page} total={filteredRows.length} onPageChange={setPage} label="products" />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SupplierProductsTab;
