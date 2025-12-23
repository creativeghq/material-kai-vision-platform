import React, { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Eye, Loader2, Trash2, FileText, Code, Globe } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ProductDetailModal } from './ProductDetailModal';

interface Product {
  id: string;
  name: string;
  metadata: any;
  created_at: string;
  source_document_id: string;
  source_type?: 'pdf_processing' | 'xml_import' | 'web_scraping' | null;
  source_job_id?: string | null;
}

interface ProductsTabProps {
  workspaceId: string;
  jobIdFilter?: string;
  onStatsUpdate: (wsId: string) => void;
}

export const ProductsTab: React.FC<ProductsTabProps> = ({ workspaceId, jobIdFilter, onStatsUpdate }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const { toast } = useToast();

  const ITEMS_PER_PAGE = 20;

  useEffect(() => {
    if (workspaceId) {
      setCurrentPage(1);
      loadProducts(1);
    }
  }, [workspaceId, sourceFilter, jobIdFilter]);

  useEffect(() => {
    if (workspaceId) {
      loadProducts(currentPage);
    }
  }, [currentPage]);

  const loadProducts = async (page: number) => {
    try {
      setIsLoading(true);

      const from = (page - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      let query = supabase
        .from('products')
        .select('*', { count: 'exact' })
        .eq('workspace_id', workspaceId);

      // Apply source filter
      if (sourceFilter !== 'all') {
        query = query.eq('source_type', sourceFilter);
      }

      // Apply job ID filter
      if (jobIdFilter && jobIdFilter.trim()) {
        query = query.eq('source_job_id', jobIdFilter.trim());
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      setProducts(data || []);
      setTotalCount(count || 0);
    } catch (error) {
      console.error('Failed to load products:', error);
      toast({
        title: 'Error',
        description: 'Failed to load products',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (productId: string) => {
    if (!confirm('Delete this product? This will also delete related data.')) return;

    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', productId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Product deleted successfully',
      });
      loadProducts();
      onStatsUpdate(workspaceId);
    } catch (error) {
      console.error('Failed to delete product:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete product',
        variant: 'destructive',
      });
    }
  };

  const filteredProducts = products.filter((product) =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getSourceBadge = (sourceType: string | null | undefined) => {
    if (!sourceType) return <Badge variant="outline">Unknown</Badge>;

    const badges = {
      pdf_processing: { label: 'PDF', icon: FileText, color: 'bg-blue-100 text-blue-700' },
      xml_import: { label: 'XML', icon: Code, color: 'bg-green-100 text-green-700' },
      web_scraping: { label: 'Web', icon: Globe, color: 'bg-purple-100 text-purple-700' },
    };

    const badge = badges[sourceType as keyof typeof badges];
    if (!badge) return <Badge variant="outline">{sourceType}</Badge>;

    const Icon = badge.icon;
    return (
      <Badge className={`${badge.color} flex items-center gap-1`}>
        <Icon className="h-3 w-3" />
        {badge.label}
      </Badge>
    );
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>All Products</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="pdf_processing">PDF Processing</SelectItem>
                  <SelectItem value="xml_import">XML Import</SelectItem>
                  <SelectItem value="web_scraping">Web Scraping</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 w-64"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No products found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product Name</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Manufacturer</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product) => {
                  // Helper to check if value is a "not found" placeholder
                  const isNotFound = (val: string | null | undefined): boolean => {
                    if (!val) return true;
                    const normalized = val.toLowerCase().trim();
                    return normalized === 'not found' ||
                           normalized === 'not explicitly mentioned' ||
                           normalized === 'not mentioned' ||
                           normalized === 'n/a' ||
                           normalized === 'unknown';
                  };

                  // Normalize category - use consistent casing
                  const rawCategory = product.metadata?.material_category;
                  const category = isNotFound(rawCategory) ? 'N/A' : rawCategory;

                  // Get manufacturer - try factory_name first, then factory_group_name
                  const factoryName = product.metadata?.factory_name;
                  const factoryGroup = product.metadata?.factory_group_name;
                  const manufacturer = !isNotFound(factoryName) ? factoryName
                                     : !isNotFound(factoryGroup) ? factoryGroup
                                     : 'N/A';

                  return (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell>{getSourceBadge(product.source_type)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {category}
                      </Badge>
                    </TableCell>
                    <TableCell>{manufacturer}</TableCell>
                    <TableCell>
                      {new Date(product.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedProduct(product)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(product.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          {/* Pagination */}
          {totalCount > ITEMS_PER_PAGE && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>

              {Array.from({ length: Math.ceil(totalCount / ITEMS_PER_PAGE) }, (_, i) => i + 1).map(page => (
                <Button
                  key={page}
                  variant={currentPage === page ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </Button>
              ))}

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(Math.ceil(totalCount / ITEMS_PER_PAGE), p + 1))}
                disabled={currentPage === Math.ceil(totalCount / ITEMS_PER_PAGE)}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </>
  );
};

