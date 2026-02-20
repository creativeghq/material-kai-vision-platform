/**
 * Metadata Management Component
 *
 * Comprehensive admin interface for viewing and managing extracted metadata
 * from PDF processing pipeline. Supports filtering, editing, and statistics.
 */

import React, { useState, useEffect } from 'react';
import {
  Filter,
  Search,
  Edit,
  Trash2,
  BarChart3,
  Database,
  FileText,
  Package,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Badge } from '@/components/core/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/core/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/core/ui/dialog';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { GlobalAdminHeader } from './GlobalAdminHeader';
import { supabase } from '@/integrations/supabase/client';

// Product-level aggregate fields that should not appear as individual metadata rows
const AGGREGATE_FIELDS = new Set(['confidence', 'factory_group_name']);

interface MetadataItem {
  // Composite key for React rendering only — never parsed for DB operations
  id: string;
  // Actual product UUID used for all DB operations
  productId: string;
  field_name: string;
  field_value: string;
  // Per-field confidence from _extraction_metadata, fallback to product-level confidence
  confidence: number;
  product_name: string;
  document_name: string;
  created_at: string;
}

interface MetadataStatistics {
  total_products: number;
  total_metadata_fields: number;
  unique_fields: number;
  most_common_fields: Array<{ field: string; count: number }>;
}

export const MetadataManagement: React.FC = () => {
  const { toast } = useToast();

  // State
  const [metadata, setMetadata] = useState<MetadataItem[]>([]);
  const [statistics, setStatistics] = useState<MetadataStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<MetadataItem | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Filters (applied client-side after one fetch)
  const [confidenceFilter, setConfidenceFilter] = useState<string>('0.0');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    loadMetadata();
  }, []);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [confidenceFilter, searchQuery]);

  const loadMetadata = async () => {
    try {
      setLoading(true);

      const { data: products, error } = await supabase
        .from('products')
        .select('id, name, metadata, source_document_id, created_at')
        .not('metadata', 'is', null)
        .limit(1000);

      if (error) throw error;
      if (!products) {
        setMetadata([]);
        return;
      }

      // Batch-fetch document filenames for human-readable names
      const docIds = [...new Set(products.map(p => p.source_document_id).filter(Boolean))];
      const docNameMap: Record<string, string> = {};
      if (docIds.length > 0) {
        const { data: docs } = await supabase
          .from('documents')
          .select('id, filename')
          .in('id', docIds);
        docs?.forEach(doc => {
          docNameMap[doc.id] = doc.filename || doc.id;
        });
      }

      const items: MetadataItem[] = [];
      const fieldCounts: Record<string, number> = {};

      products.forEach(product => {
        const meta = product.metadata || {};
        // _extraction_metadata contains per-field {confidence, source} entries
        const extractionMeta = meta._extraction_metadata || {};
        // Product-level confidence is the fallback when per-field data is absent
        const productConfidence =
          typeof meta.confidence === 'number' ? meta.confidence : 1.0;

        Object.entries(meta).forEach(([key, value]) => {
          // Skip internal/system fields (prefixed with _)
          if (key.startsWith('_')) return;
          // Skip product-level aggregate fields
          if (AGGREGATE_FIELDS.has(key)) return;
          // Skip null values — not meaningful to display
          if (value === null || value === undefined) return;
          // Skip empty arrays — no content to show
          if (Array.isArray(value) && value.length === 0) return;

          // Prefer per-field confidence from _extraction_metadata
          const fieldMeta = extractionMeta[key];
          const fieldConfidence =
            typeof fieldMeta?.confidence === 'number'
              ? fieldMeta.confidence
              : productConfidence;

          const fieldValue = Array.isArray(value)
            ? value.join(', ')
            : typeof value === 'object'
              ? JSON.stringify(value)
              : String(value);

          fieldCounts[key] = (fieldCounts[key] || 0) + 1;

          items.push({
            // Use :: separator — safe since UUIDs only contain hyphens and hex chars
            id: `${product.id}::${key}`,
            productId: product.id,
            field_name: key,
            field_value: fieldValue,
            confidence: fieldConfidence,
            product_name: product.name,
            document_name:
              docNameMap[product.source_document_id] ||
              product.source_document_id ||
              'Unknown',
            created_at: product.created_at || new Date().toISOString(),
          });
        });
      });

      setMetadata(items);
      setStatistics({
        total_products: products.length,
        total_metadata_fields: items.length,
        unique_fields: Object.keys(fieldCounts).length,
        most_common_fields: Object.entries(fieldCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10)
          .map(([field, count]) => ({ field, count })),
      });
    } catch (error) {
      console.error('Error loading metadata:', error);
      toast({
        title: 'Error',
        description: 'Failed to load metadata',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Client-side filtering — applied after the single DB fetch
  const filteredMetadata = metadata.filter((item) => {
    if (item.confidence < parseFloat(confidenceFilter)) return false;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (
        !item.field_name.toLowerCase().includes(q) &&
        !item.field_value.toLowerCase().includes(q) &&
        !item.product_name.toLowerCase().includes(q) &&
        !item.document_name.toLowerCase().includes(q)
      ) {
        return false;
      }
    }

    return true;
  });

  const totalPages = Math.ceil(filteredMetadata.length / itemsPerPage);
  const paginatedMetadata = filteredMetadata.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 0.9) {
      return (
        <Badge className="bg-green-100 text-green-800 border-green-300">
          High ({confidence.toFixed(2)})
        </Badge>
      );
    } else if (confidence >= 0.7) {
      return (
        <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">
          Medium ({confidence.toFixed(2)})
        </Badge>
      );
    } else {
      return (
        <Badge className="bg-red-100 text-red-800 border-red-300">
          Low ({confidence.toFixed(2)})
        </Badge>
      );
    }
  };

  const handleEdit = (item: MetadataItem) => {
    setSelectedItem(item);
    setEditValue(item.field_value);
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedItem) return;
    setIsSaving(true);
    try {
      const { data: product, error: fetchError } = await supabase
        .from('products')
        .select('metadata')
        .eq('id', selectedItem.productId)
        .single();

      if (fetchError) throw fetchError;
      if (!product) throw new Error('Product not found');

      const updatedMetadata = {
        ...product.metadata,
        [selectedItem.field_name]: editValue,
      };

      const { error: updateError } = await supabase
        .from('products')
        .update({ metadata: updatedMetadata })
        .eq('id', selectedItem.productId);

      if (updateError) throw updateError;

      toast({
        title: 'Success',
        description: `Field "${selectedItem.field_name}" updated`,
      });
      setIsEditDialogOpen(false);
      setSelectedItem(null);
      loadMetadata();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (item: MetadataItem) => {
    if (
      !confirm(
        `Delete metadata field "${item.field_name}" from "${item.product_name}"?`,
      )
    ) {
      return;
    }

    try {
      const { data: product, error: fetchError } = await supabase
        .from('products')
        .select('metadata')
        .eq('id', item.productId)
        .single();

      if (fetchError) throw fetchError;
      if (!product) throw new Error('Product not found');

      const updatedMetadata = { ...product.metadata };
      delete updatedMetadata[item.field_name];

      const { error: updateError } = await supabase
        .from('products')
        .update({ metadata: updatedMetadata })
        .eq('id', item.productId);

      if (updateError) throw updateError;

      toast({
        title: 'Success',
        description: `Field "${item.field_name}" deleted`,
      });
      loadMetadata();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader
        title="Metadata Management"
        description="View and manage extracted metadata from PDF processing"
        badge="Admin"
      />

      <div className="p-6 space-y-6">
        {/* Statistics Cards */}
        {statistics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="dashboard-card">
              <div className="flex items-center gap-2 mb-2">
                <Package className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
                <p className="text-xs text-muted-foreground">Total Products</p>
              </div>
              <div className="text-2xl font-bold">{statistics.total_products}</div>
              <p className="text-xs text-muted-foreground mt-1">With metadata</p>
            </div>

            <div className="dashboard-card">
              <div className="flex items-center gap-2 mb-2">
                <Database className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
                <p className="text-xs text-muted-foreground">Metadata Fields</p>
              </div>
              <div className="text-2xl font-bold text-blue-600">
                {statistics.total_metadata_fields}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Total field instances</p>
            </div>

            <div className="dashboard-card">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
                <p className="text-xs text-muted-foreground">Unique Fields</p>
              </div>
              <div className="text-2xl font-bold text-green-600">
                {statistics.unique_fields}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Different field types</p>
            </div>

            <div className="dashboard-card">
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
                <p className="text-xs text-muted-foreground">Most Common</p>
              </div>
              <div className="text-2xl font-bold text-purple-600">
                {statistics.most_common_fields[0]?.field || 'N/A'}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {statistics.most_common_fields[0]?.count || 0} occurrences
              </p>
            </div>
          </div>
        )}

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Min Confidence</Label>
                <Select value={confidenceFilter} onValueChange={setConfidenceFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.0">All (≥0.0)</SelectItem>
                    <SelectItem value="0.5">Medium+ (≥0.5)</SelectItem>
                    <SelectItem value="0.7">High+ (≥0.7)</SelectItem>
                    <SelectItem value="0.9">Very High (≥0.9)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2">
                <Label>Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search field name, value, product, or document..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Metadata Table */}
        <Card>
          <CardHeader>
            <CardTitle>Metadata List ({filteredMetadata.length} items)</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-gray-500">Loading metadata...</div>
            ) : paginatedMetadata.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No metadata found</div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Field Name</TableHead>
                      <TableHead>Value</TableHead>
                      <TableHead>Confidence</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Document</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedMetadata.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.field_name}</TableCell>
                        <TableCell className="max-w-xs truncate">{item.field_value}</TableCell>
                        <TableCell>{getConfidenceBadge(item.confidence)}</TableCell>
                        <TableCell className="text-sm">{item.product_name}</TableCell>
                        <TableCell className="max-w-xs truncate text-sm text-gray-600">
                          {item.document_name}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(item)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(item)}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-gray-600">
                      Page {currentPage} of {totalPages}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Metadata Field</DialogTitle>
          </DialogHeader>
          {selectedItem && (
            <div className="space-y-4 py-2">
              <div>
                <Label>Field Name</Label>
                <Input value={selectedItem.field_name} disabled className="bg-muted" />
              </div>
              <div>
                <Label>Product</Label>
                <Input value={selectedItem.product_name} disabled className="bg-muted" />
              </div>
              <div>
                <Label>Value</Label>
                <Textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  rows={4}
                  placeholder="Enter new value..."
                />
              </div>
              <div>
                <Label>Confidence</Label>
                <div className="mt-1">{getConfidenceBadge(selectedItem.confidence)}</div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
