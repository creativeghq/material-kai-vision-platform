import React, { useEffect, useState } from 'react';
import { Loader2, Package, Search as SearchIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import {
  PRODUCT_IMAGE_SELECT,
  getProductImageUrl,
  getManufacturer,
  getMaterialCategory,
  formatMaterialCategory,
} from '@/utils/productMetadata';

interface SupplierProductsTabProps {
  /** The supplier party name to match against products.metadata.factory_name */
  supplierName: string;
  /** Optional list of aliases (e.g. trading names, legal names) to also match */
  aliases?: string[];
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
 * Lists every product whose maker (metadata.factory_name / manufacturer / brand
 * / supplier) matches this supplier's name. Used on CRM company / contact
 * profiles tagged is_supplier=true.
 *
 * Matching is case-insensitive ilike. No FK link exists between products and
 * CRM parties today — the maker is a free-text string on product metadata.
 */
export const SupplierProductsTab: React.FC<SupplierProductsTabProps> = ({
  supplierName,
  aliases = [],
}) => {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const candidateNames = React.useMemo(() => {
    const all = [supplierName, ...aliases].map((s) => (s ?? '').trim()).filter(Boolean);
    // Dedupe case-insensitively
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of all) {
      const key = s.toLowerCase();
      if (!seen.has(key)) { seen.add(key); out.push(s); }
    }
    return out;
  }, [supplierName, aliases]);

  useEffect(() => {
    let cancelled = false;
    if (candidateNames.length === 0) { setRows([]); setLoading(false); return; }

    (async () => {
      try {
        setLoading(true);
        setError(null);
        // Fetch up to 200 candidate products that have any maker key set, then
        // filter client-side. The maker key can live under any of the legacy
        // aliases (factory_name / manufacturer / brand / supplier), so a
        // single ilike per key would miss rows that use a different key. The
        // canonical key is metadata.factory_name post-ingestion.
        // We do a broad fetch on metadata->>factory_name first, then fall
        // back to the alias keys client-side.
        const ors: string[] = [];
        for (const n of candidateNames) {
          const esc = n.replace(/[%_]/g, '\\$&');
          ors.push(`metadata->>factory_name.ilike.%${esc}%`);
          ors.push(`metadata->>manufacturer.ilike.%${esc}%`);
          ors.push(`metadata->>brand.ilike.%${esc}%`);
          ors.push(`metadata->>supplier.ilike.%${esc}%`);
        }

        const { data, error: err } = await supabase
          .from('products')
          .select(`id, name, sku, external_sku, status, created_at, metadata, ${PRODUCT_IMAGE_SELECT}`)
          .or(ors.join(','))
          .order('created_at', { ascending: false })
          .limit(500);

        if (err) throw err;
        if (cancelled) return;

        // Defence-in-depth: verify each row actually matches via the canonical
        // getManufacturer() helper (handles structured {value, confidence}
        // envelopes that ilike on plain text wouldn't catch).
        const lower = candidateNames.map((n) => n.toLowerCase());
        const filtered = (data ?? []).filter((p: any) => {
          const maker = (getManufacturer(p.metadata) ?? '').toLowerCase();
          if (!maker) return false;
          return lower.some((n) => maker.includes(n) || n.includes(maker));
        });

        setRows(filtered as ProductRow[]);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Failed to load products');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [candidateNames.join('|')]);

  const filteredRows = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.name?.toLowerCase().includes(q)
      || r.sku?.toLowerCase().includes(q)
      || r.external_sku?.toLowerCase().includes(q),
    );
  }, [rows, search]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Products from this supplier
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Matched by maker name on product metadata (no FK link yet — rename the
            supplier or fix the product metadata if a row is missing).
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
            <p className="text-sm">No products linked to this supplier yet.</p>
            <p className="text-xs">
              Products are linked by their maker name in metadata
              (<code>factory_name</code>, <code>manufacturer</code>, <code>brand</code>, <code>supplier</code>).
              Make sure the supplier name here matches what's stored on the products.
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
                {filteredRows.map((p) => {
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
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SupplierProductsTab;
